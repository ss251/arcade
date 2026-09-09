import { afterEach, describe, expect, it, vi } from "vitest"
import { request } from "node:http"
import { hire, HireRefused, subSpendUsd, __resetSubSpend } from "@arcade/buyer/hire"
import { ARC_CAIP2, HIRE_CAPABILITY_HEADER, USDC_ADDRESS } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE } from "@arcade/payments"
import * as ensPolicy from "../../buyer/src/ens-policy.ts"
import { startHireBroker, type HireBroker, type PurchaseArgs, type PurchaseFn } from "../src/hire-broker.ts"

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
  body?: unknown
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

const NAME = "wallet-risk-note.sail.arcade.eth"
const NAME_HUB = "https://hub.test"
const NAME_SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const NAME_ENDPOINT = `${NAME_HUB}/x/${NAME_SELLER}/wallet-risk-note`
const NAME_POLL = `${NAME_HUB}/jobs/job_child/result?token=${"ab".repeat(16)}`

/** Only read-only ENS and HTTP are injected; the real SDK signs offline with KEY. */
const defaultNameBroker = (changes: {
  endpoint?: string; payTo?: string; missing?: boolean; unavailable?: boolean; cycle?: boolean
} = {}) => {
  const reads = vi.fn(async ({ key }: { name: string; key: string }) => {
    if (changes.unavailable) throw new Error("PRIVATE_RPC_CREDENTIAL")
    if (changes.missing) return null
    return ({
      "arcade.endpoint": changes.endpoint ?? NAME_ENDPOINT,
      "arcade.payTo": changes.payTo ?? NAME_SELLER,
      "arcade.chain": ARC_CAIP2,
      "arcade.priceAtomic": "50000"
    })[key] ?? null
  })
  vi.spyOn(ensPolicy, "sepoliaEnsReader").mockReturnValue({ getEnsText: reads })
  const requests: Request[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    requests.push(req)
    if (req.url === NAME_POLL) {
      return Response.json({ job_id: "job_child", status: "succeeded", result: { advice: "untrusted seller output" }, receipt: { settled: true, price: "$0.05" } })
    }
    if (req.url !== NAME_ENDPOINT) throw new Error("Unexpected outbound request")
    if (changes.cycle) return Response.json({ error: "lineage_cycle", detail: "child is already an ancestor" }, { status: 402 })
    if (req.headers.has(HEADER_PAYMENT_SIGNATURE)) {
      return Response.json({ job_id: "job_child", poll_url: NAME_POLL }, { status: 202 })
    }
    return Response.json({ x402Version: 2, accepts: [{
      scheme: "exact", network: ARC_CAIP2, amount: "50000", asset: USDC_ADDRESS,
      payTo: NAME_SELLER, resource: req.url, mimeType: "application/json", maxTimeoutSeconds: 60, extra: {}
    }] }, { status: 402 })
  }) as typeof fetch
  SOCK = `/tmp/arcade-hire-name-${process.pid}-${seq++}.sock`
  broker = startHireBroker({ hubUrl: NAME_HUB, subBuyKey: KEY, socketPath: SOCK })
  const token = broker.openJob("job_name_parent", 0.05, "cap.real-name-parent")
  vi.stubEnv("ARCADE_HIRE_SOCKET", SOCK)
  vi.stubEnv("ARCADE_JOB_ID", "job_name_parent")
  vi.stubEnv("ARCADE_JOB_TOKEN", token)
  __resetSubSpend()
  return { broker, requests, reads }
}

afterEach(() => {
  broker?.stop()
  broker = undefined
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("hire broker", () => {
  it("pays by name through the real socket and SDK, retaining the parent capability and ceiling", async () => {
    const fixture = defaultNameBroker()
    const result = await hire(NAME.toUpperCase(), { question: "fixture" }, { maxAmountUsd: 0.05, hubUrl: "https://foreign.example" })
    expect(result).toMatchObject({ skillId: NAME, jobId: "job_child", settled: true, costUsd: 0.05 })
    expect(result.fenced).toContain(NAME)
    expect(result.fenced).toContain("untrusted seller output")
    expect(fixture.requests.map(request => request.url)).toEqual([NAME_ENDPOINT, NAME_ENDPOINT, NAME_POLL])
    const [probe, paid, poll] = fixture.requests
    expect(probe!.headers.get(HIRE_CAPABILITY_HEADER)).toBe("cap.real-name-parent")
    expect(paid!.headers.get(HIRE_CAPABILITY_HEADER)).toBe("cap.real-name-parent")
    expect(probe!.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(paid!.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(true)
    expect(poll!.headers.has(HIRE_CAPABILITY_HEADER)).toBe(false)
    for (const request of fixture.requests) {
      expect(request.redirect).toBe("error")
      expect(request.credentials).toBe("omit")
      expect(request.headers.has("x-job-token")).toBe(false)
      expect(request.headers.has("authorization")).toBe(false)
    }
    expect(await paid!.clone().json()).toEqual({ question: "fixture" })
    // Four records, read once each. No hub listing lookup or second ENS resolution.
    expect(fixture.reads).toHaveBeenCalledTimes(4)
    expect(fixture.reads.mock.calls.every(([read]) => read.name === NAME)).toBe(true)
    expect(fixture.broker.spentUsd("job_name_parent")).toBe(0.05)
    expect(subSpendUsd()).toBe(0.05)
    await expect(hire(NAME, {})).rejects.toThrow(/budget exhausted/)
    expect(fixture.requests).toHaveLength(3)
  })

  it("carries an explicit narrower cap into the real by-name signer gate", async () => {
    const fixture = defaultNameBroker()
    await expect(hire(NAME, {}, { maxAmountUsd: 0.03 })).rejects.toThrow(/exceeds max-amount 30000/)
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]!.headers.get(HIRE_CAPABILITY_HEADER)).toBe("cap.real-name-parent")
    expect(fixture.requests[0]!.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(fixture.broker.spentUsd("job_name_parent")).toBe(0)
    expect(subSpendUsd()).toBe(0)
  })

  it.each(["https://foreign.example", "https://hub.test:8443"])(
    "refuses a name resolving to %s before any parent-capability-bearing HTTP", async origin => {
      const fixture = defaultNameBroker({ endpoint: `${origin}/x/${NAME_SELLER}/wallet-risk-note` })
      await expect(hire(NAME, {})).rejects.toThrow(/issuing hub/)
      expect(fixture.requests).toHaveLength(0)
      expect(fixture.broker.spentUsd("job_name_parent")).toBe(0)
    }
  )

  it("preserves a by-name lineage-cycle refusal without signing or charging", async () => {
    const fixture = defaultNameBroker({ cycle: true })
    await expect(hire(NAME, {})).rejects.toThrow(/lineage_cycle: child is already an ancestor/)
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]!.headers.get(HIRE_CAPABILITY_HEADER)).toBe("cap.real-name-parent")
    expect(fixture.requests[0]!.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(fixture.broker.spentUsd("job_name_parent")).toBe(0)
  })

  it("refuses an ENS payee mismatch through the socket before a payment retry", async () => {
    const fixture = defaultNameBroker({ payTo: `0x${"22".repeat(20)}` })
    await expect(hire(NAME, {})).rejects.toThrow(/ens_payto_mismatch/)
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]!.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(fixture.broker.spentUsd("job_name_parent")).toBe(0)
  })

  it.each(["missing", "unavailable"] as const)("returns a safe %s ENS refusal without HTTP or payment", async mode => {
    const fixture = defaultNameBroker({ [mode]: true })
    const error = await hire(NAME, {}).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(HireRefused)
    expect((error as Error).message).toContain(mode === "missing" ? "may be expired" : "rpc_unavailable")
    expect((error as Error).message).not.toContain("PRIVATE")
    expect(fixture.requests).toHaveLength(0)
    expect(fixture.broker.spentUsd("job_name_parent")).toBe(0)
  })

  it("routes a normalized ENS target without discovery, preserving the trusted cap and lineage", async () => {
    let captured: PurchaseArgs | undefined
    const b = start(async args => { captured = args; return purchaseAt(0.02)(args) })
    const discovery = vi.fn(async () => { throw new Error("name hires must not discover a listing") })
    globalThis.fetch = discovery as unknown as typeof fetch
    const token = b.openJob("job_name", 0.05, "cap.parent")
    const result = await call("/hire", { "x-job-id": "job_name", "x-job-token": token }, {
      name: "Wallet-Risk-Note.SAIL.ARCADE.ETH", input: { query: "test" }, maxAmountUsd: 0.03,
      hubUrl: "https://attacker.example", lineage: "cap.forged", privateKey: "forged"
    })
    expect(result.status).toBe(200)
    expect(captured).toEqual({
      name: "wallet-risk-note.sail.arcade.eth", skillId: "wallet-risk-note.sail.arcade.eth", seller: "",
      input: { query: "test" }, hubUrl: "http://hub.test", lineage: "cap.parent", privateKey: KEY, maxAmountAtomic: 30_000n
    })
    expect(discovery).not.toHaveBeenCalled()
    expect(result.body["skillId"]).toBe("wallet-risk-note.sail.arcade.eth")
    expect(b.spentUsd("job_name")).toBe(0.02)
  })

  it.each([
    { name: "child.sail.arcade.eth", skillId: "child" },
    { name: "child.sail.arcade.eth", skillId: null },
    { name: null, skillId: "child" },
    {}, null, [],
    { name: "not-a-name" }, { name: "child.sail.arcade.eth." },
    { name: `${"a".repeat(64)}.sail.arcade.eth` },
    { name: `${"a.".repeat(130)}eth` },
    { name: " child.sail.arcade.eth" }, { name: {} },
    { skillId: "../child" }, { skillId: "child?secret=private" }, { skillId: "" },
    { skillId: "a".repeat(65) }
  ].map(body => [body] as const))("refuses malformed or ambiguous targets before discovery or purchase: %j", async body => {
    const purchase = vi.fn(purchaseAt(0.01))
    const b = start(purchase)
    const discovery = vi.fn(async () => new Response(JSON.stringify({ seller: "0xSeller" })))
    globalThis.fetch = discovery as unknown as typeof fetch
    const token = b.openJob("job_target", 0.05)
    const result = await call("/hire", { "x-job-id": "job_target", "x-job-token": token }, body)
    expect(result.status).toBe(400)
    expect(result.body["error"]).not.toContain("private")
    expect(purchase).not.toHaveBeenCalled()
    expect(discovery).not.toHaveBeenCalled()
  })

  it.each([0, -1, null, "0.01", 0.0000001, 0.1234567, Number.MAX_VALUE])(
    "refuses an invalid explicit sandbox cap (%s), never silently widening it", async maxAmountUsd => {
      const purchase = vi.fn(purchaseAt(0.01))
      const b = start(purchase)
      const discovery = vi.fn(async () => new Response(JSON.stringify({ seller: "0xSeller" })))
      globalThis.fetch = discovery as unknown as typeof fetch
      const token = b.openJob("job_cap", 0.05)
      const result = await ask("job_cap", token, { maxAmountUsd })
      expect(result.status).toBe(400)
      expect(purchase).not.toHaveBeenCalled()
      expect(discovery).not.toHaveBeenCalled()
    }
  )

  it("refuses a job it never opened", async () => {
    const b = start(purchaseAt(0.01))
    const r = await ask("job_unknown", "anything")
    expect(r.status).toBe(403)
    expect(String(r.body["error"])).toMatch(/not authorized/)
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

  it("stops honoring a token once the job is closed", async () => {
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

  it("forwards the hub capability to the purchase", async () => {
    let seen: string | undefined
    const purchase: PurchaseFn = async (args) => {
      seen = args.lineage
      return {
        jobId: "job_sub",
        settled: true,
        result: {},
        fenced: "",
        paidAtomic: 0n
      }
    }
    const b = start(purchase)
    const token = b.openJob("job_p", 1, "cap.abc")
    const res = await call(
      "/hire",
      { "x-job-id": "job_p", "x-job-token": token },
      { skillId: "child", input: {} }
    )
    expect(res.status).toBe(200)
    expect(seen).toBe("cap.abc")
  })

  it("keeps the capability and cycle refusal through the real buyer purchase and hire socket", async () => {
    const seller = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
    const requests: Request[] = []
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init)
      const url = new URL(req.url)
      if (url.pathname.startsWith("/listings/")) return json({ seller })
      if (url.pathname === "/jobs/job_child/result") {
        expect(url.search).toBe(`?token=${"ab".repeat(16)}`)
        return json({ job_id: "job_child", status: "succeeded", result: { ok: true }, receipt: { settled: true, price: "$0.05" } })
      }
      requests.push(req)
      if (url.pathname === `/x/${seller}/loop-probe`) {
        return json({ error: "lineage_cycle", detail: "loop-probe is already an ancestor" }, 402)
      }
      if (url.pathname !== `/x/${seller}/wallet-risk-note`) throw new Error(`unexpected request: ${url.pathname}`)
      if (req.headers.has(HEADER_PAYMENT_SIGNATURE)) {
        return json({ job_id: "job_child", poll_url: `http://hub.test/jobs/job_child/result?token=${"ab".repeat(16)}` }, 202)
      }
      return json({
        x402Version: 2,
        accepts: [{ scheme: "exact", network: ARC_CAIP2, amount: "50000", asset: USDC_ADDRESS,
          payTo: seller, resource: req.url, mimeType: "application/json", maxTimeoutSeconds: 60, extra: {} }]
      }, 402)
    }) as typeof globalThis.fetch
    SOCK = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-hire-${process.pid}-${seq++}.sock`
    broker = startHireBroker({ hubUrl: "http://hub.test", subBuyKey: KEY, socketPath: SOCK })
    const token = broker.openJob("job_parent", 0.25, "cap.real-parent")
    vi.stubEnv("ARCADE_HIRE_SOCKET", SOCK)
    vi.stubEnv("ARCADE_JOB_ID", "job_parent")
    vi.stubEnv("ARCADE_JOB_TOKEN", token)
    __resetSubSpend()

    const child = await hire("wallet-risk-note", {})
    expect(child).toMatchObject({ jobId: "job_child", settled: true, costUsd: 0.05 })
    const refusal = await hire("loop-probe", {}).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(HireRefused)
    expect((refusal as Error).message).toContain("lineage_cycle: loop-probe is already an ancestor")
    expect(requests).toHaveLength(3)
    for (const req of requests) expect(req.headers.get(HIRE_CAPABILITY_HEADER)).toBe("cap.real-parent")
    expect(requests[0]?.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(requests[1]?.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(true)
    expect(requests[2]?.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(false)
    expect(broker.spentUsd("job_parent")).toBeCloseTo(0.05, 6)
    expect(subSpendUsd()).toBeCloseTo(0.05, 6)
  })
})
