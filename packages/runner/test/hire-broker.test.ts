import { afterEach, describe, expect, it } from "vitest"
import { request } from "node:http"
import { hire, subSpendUsd, __resetSubSpend } from "@arcade/buyer/hire"
import { startHireBroker, type HireBroker, type PurchaseFn } from "../src/hire-broker.ts"

/**
 * The broker is where `maxSubSpendUsd` is actually enforced, and that is the whole point:
 * the process holding the key is not the process being bounded.
 *
 * Previously the budget lived inside the sandbox alongside the key, which made it
 * advisory — an injection reaching the agent could spend past it, and the real cap was the
 * wallet balance. These tests exist to keep enforcement on this side of the socket.
 */

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

// A fresh socket per test. Reusing one path let a closed server linger on the inode long
// enough for the next test's client to reach the PREVIOUS broker — different HMAC secret,
// different ledger — which failed six tests that all passed in isolation.
let seq = 0
let SOCK = ""
let broker: HireBroker | undefined

/** Stands in for a settled purchase at a fixed price, with no chain and no hub. */
const purchaseAt = (priceUsd: number, settled = true): PurchaseFn => {
  return async () => ({
    jobId: "job_sub",
    settled,
    result: { ok: true },
    fenced: "<<<F>>>{}<<<END>>>",
    paidAtomic: settled ? BigInt(Math.round(priceUsd * 1e6)) : 0n
  })
}

const start = (purchase: PurchaseFn) => {
  SOCK = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-hire-${process.pid}-${seq++}.sock`
  broker = startHireBroker({
    hubUrl: "http://hub.test",
    subBuyKey: KEY,
    socketPath: SOCK,
    purchase
  })
  // Every listing lookup resolves; the broker's job is the ledger, not discovery.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/listings/")) {
      return new Response(JSON.stringify({ seller: "0xSeller" }), {
        headers: { "content-type": "application/json" }
      })
    }
    return originalFetch(input as never, init as never)
  }) as unknown as typeof fetch
  return broker
}

const originalFetch = globalThis.fetch

const call = (
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = request(
      {
        socketPath: SOCK,
        path,
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...headers,
          ...(payload === undefined
            ? {}
            : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) })
        }
      },
      (res) => {
        let acc = ""
        res.on("data", (c) => (acc += String(c)))
        res.on("end", () => {
          let parsed: Record<string, unknown> = {}
          try {
            parsed = JSON.parse(acc)
          } catch {
            /* non-JSON body is fine for the 404 case */
          }
          resolve({ status: res.statusCode ?? 500, body: parsed })
        })
      }
    )
    req.on("error", reject)
    req.end(payload)
  })

const ask = (jobId: string, token: string, body: Record<string, unknown> = {}) =>
  call("/hire", { "x-job-id": jobId, "x-job-token": token }, {
    skillId: "usdc-flow-check",
    input: {},
    ...body
  })

afterEach(() => {
  broker?.stop()
  broker = undefined
  globalThis.fetch = originalFetch
})

describe("hire broker", () => {
  it("refuses a job it never opened", async () => {
    const b = start(purchaseAt(0.01))
    const r = await ask("job_unknown", "anything")
    expect(r.status).toBe(403)
    expect(String(r.body["error"])).toMatch(/not authorised/)
  })

  it("refuses a forged token", async () => {
    const b = start(purchaseAt(0.01))
    b.openJob("job_1", 0.05)
    const r = await ask("job_1", "not-the-token")
    expect(r.status).toBe(403)
  })

  it("refuses a token issued for a DIFFERENT job", async () => {
    // The token is an HMAC over the job id, so one job's token is useless for another.
    const b = start(purchaseAt(0.01))
    const tokenA = b.openJob("job_a", 0.05)
    b.openJob("job_b", 0.05)

    const r = await ask("job_b", tokenA)
    expect(r.status).toBe(403)
  })

  it("stops honouring a token once the job is closed", async () => {
    // A token must not outlive the work it was issued for.
    const b = start(purchaseAt(0.01))
    const token = b.openJob("job_1", 0.05)
    expect((await ask("job_1", token)).status).toBe(200)

    b.closeJob("job_1")
    expect((await ask("job_1", token)).status).toBe(403)
  })

  it("enforces the ceiling across repeated calls — the property that matters", async () => {
    // $0.04 budget at $0.02 a call: two succeed, the third is refused. An injected agent
    // looping on hire_skill gets exactly this and no more — it holds no key, so the
    // refusal is not something it can decline.
    const b = start(purchaseAt(0.02))
    const token = b.openJob("job_1", 0.04)

    expect((await ask("job_1", token)).status).toBe(200)
    expect((await ask("job_1", token)).status).toBe(200)

    const third = await ask("job_1", token)
    expect(third.status).toBe(402)
    expect(String(third.body["error"])).toMatch(/budget exhausted/)
    expect(b.spentUsd("job_1")).toBeCloseTo(0.04, 6)
  })

  it("treats an absent budget as zero, never unlimited", async () => {
    const b = start(purchaseAt(0.01))
    const token = b.openJob("job_1", undefined)
    const r = await ask("job_1", token)
    expect(r.status).toBe(402)
    expect(b.spentUsd("job_1")).toBe(0)
  })

  it("does not charge the budget for an unsettled purchase", async () => {
    // Non-settlement is the refund; charging it would shrink the budget for work that
    // never happened.
    const b = start(purchaseAt(0.02, false))
    const token = b.openJob("job_1", 0.05)

    const r = await ask("job_1", token)
    expect(r.status).toBe(200)
    expect(r.body["settled"]).toBe(false)
    expect(b.spentUsd("job_1")).toBe(0)
  })

  it("lets a caller narrow its own cap but not widen the job's", async () => {
    const b = start(purchaseAt(0.02))
    const token = b.openJob("job_1", 0.04)

    // Asking for more than the budget does not raise it: the purchase is capped at what
    // remains, and after two calls the third is still refused.
    await ask("job_1", token, { maxAmountUsd: 100 })
    await ask("job_1", token, { maxAmountUsd: 100 })
    expect((await ask("job_1", token)).status).toBe(402)
  })

  it("returns the fenced result, and keeps ledgers separate per job", async () => {
    const b = start(purchaseAt(0.02))
    const t1 = b.openJob("job_1", 0.05)
    const t2 = b.openJob("job_2", 0.05)

    const r = await ask("job_1", t1)
    expect(String(r.body["fenced"])).toContain("<<<F>>>")

    expect(b.spentUsd("job_1")).toBeCloseTo(0.02, 6)
    expect(b.spentUsd("job_2")).toBe(0)
    expect((await ask("job_2", t2)).status).toBe(200)
  })

  it("serves nothing but POST /hire", async () => {
    const b = start(purchaseAt(0.01))
    b.openJob("job_1", 0.05)
    const res = await call("/anything-else", {})
    expect(res.status).toBe(404)
  })

  it("holds the ceiling against the REAL sandbox client, end to end", async () => {
    // The tests above drive the socket directly. This one goes through `hire()` — the
    // actual code a skill runs — so the guarantee is proven across the boundary it exists
    // to defend rather than only on this side of it.
    const b = start(purchaseAt(0.02))
    const token = b.openJob("job_real", 0.04)

    process.env["ARCADE_HIRE_SOCKET"] = SOCK
    process.env["ARCADE_JOB_ID"] = "job_real"
    process.env["ARCADE_JOB_TOKEN"] = token
    __resetSubSpend()

    const first = await hire("usdc-flow-check", {})
    expect(first.settled).toBe(true)
    expect(first.costUsd).toBeCloseTo(0.02, 6)
    expect(first.fenced).toContain("<<<F>>>")

    await hire("usdc-flow-check", {})

    // Third call: the sandbox holds no key, so the refusal is not something it can decline.
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/budget exhausted/)
    expect(b.spentUsd("job_real")).toBeCloseTo(0.04, 6)
    expect(subSpendUsd()).toBeCloseTo(0.04, 6)
  })
})
