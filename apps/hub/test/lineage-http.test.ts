import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { HIRE_CAPABILITY_HEADER, helloDigest, mintHireCapability } from "@arcade/core"
import { fetchWithPayment } from "@arcade/buyer"

/**
 * The canonical order, locked at HTTP level.
 *
 * `lineage.test.ts` proves `resolveLineage` in isolation; nothing there proves the paid
 * branch of `server.ts` actually calls it where the brief says it must — before the
 * `header === null` 402 challenge, with the tree reservation gated strictly behind
 * `rail.verify` so a probe never holds budget. The only honest way to check wiring rather
 * than logic is to boot the real process and hit it over HTTP, same as `preflight.test.ts`.
 *
 * A fake runner (a real WebSocket client, not a mock) announces two listings by the real
 * signed `Hello` handshake, then never answers a `JobAssignment` — so a job it was
 * dispatched stays `queued` for the life of the test, which is exactly the state a hire
 * capability needs to name a live parent.
 */

const REPO_ROOT = new URL("../../..", import.meta.url).pathname
const HUB_SECRET = "lineage-http-test-secret-do-not-reuse"
// Spread across the ephemeral range and salted by pid so a parallel vitest worker (or
// `preflight.test.ts`, which really does bind :8787 for its "stays out of the way" case)
// does not collide with this one.
const PORT = 21000 + (process.pid % 4000)
const BASE_URL = `http://127.0.0.1:${PORT}`
const WS_URL = `ws://127.0.0.1:${PORT}/ws`

const seller = privateKeyToAccount(generatePrivateKey())
const runnerId = "rnr_lineage_http_test"

const rootListing = {
  id: "root-skill",
  version: "1.0.0",
  serviceName: "Root",
  description: "d",
  tags: [],
  price: "$0.10",
  bounds: { timeoutSec: 60 }, // deliberately no maxSubSpendUsd — case (c) below
  inputSchema: { type: "object" },
  outputSchema: { type: "object" }
}

const childListing = {
  id: "child-skill",
  version: "1.0.0",
  serviceName: "Child",
  description: "d",
  tags: [],
  price: "$0.10",
  bounds: { timeoutSec: 60 },
  inputSchema: { type: "object" },
  outputSchema: { type: "object" }
}

let hub: ChildProcessWithoutNullStreams
let hubOut = ""
let runnerWs: WebSocket
let rootJobId: string

const waitFor = async (check: () => Promise<boolean>, timeoutMs: number, what: string) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check().catch(() => false)) return
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n--- hub output ---\n${hubOut}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const connectRunner = () =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.addEventListener("open", () => {
      void (async () => {
        const nonce = `${Date.now()}-${crypto.randomUUID()}`
        const digest = helloDigest({
          runnerId,
          seller: seller.address,
          nonce,
          skillIds: [rootListing.id, childListing.id]
        })
        const signature = await seller.signMessage({ message: digest })
        ws.send(
          JSON.stringify({
            _tag: "Hello",
            runnerId,
            seller: seller.address,
            listings: [rootListing, childListing],
            maxConcurrency: 4,
            agentVersion: "test",
            nonce,
            signature
          })
        )
      })()
    })
    ws.addEventListener("message", (ev) => {
      let msg: { _tag?: string; ok?: boolean; detail?: string }
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (msg._tag === "Ack") {
        if (msg.ok) resolve(ws)
        else reject(new Error(`hub rejected the test runner's Hello: ${msg.detail}`))
      }
      // Any `JobAssignment` is deliberately left unanswered: the job it names must stay
      // "queued" for the life of this test — that is the live parent case (c) needs, and
      // the absence of a reply is what proves the reservation is not on the probe path
      // (a probe never reaches dispatch at all).
    })
    ws.addEventListener("error", () => reject(new Error("runner websocket error")))
  })

/** probe → 402 → sign (RailTest, no chain) → retry — the real buyer client, against the real process. */
const payForRootJob = async (): Promise<string> => {
  const buyer = privateKeyToAccount(generatePrivateKey())
  const paid = await Effect.runPromise(
    fetchWithPayment(
      `${BASE_URL}/x/${seller.address}/root-skill`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
      { account: buyer }
    )
  )
  if (paid.response.status !== 202) {
    throw new Error(`root purchase did not reach 202: ${paid.response.status} ${await paid.response.text()}`)
  }
  const body = (await paid.response.json()) as { job_id: string }
  return body.job_id
}

beforeAll(async () => {
  hub = spawn("bun", ["run", "apps/hub/src/server.ts"], {
    cwd: REPO_ROOT,
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: process.env["HOME"] ?? "",
      PORT: String(PORT),
      ARCADE_RAIL: "test",
      ARCADE_CHAIN_CHECK: "0",
      ARCADE_HUB_SECRET: HUB_SECRET,
      ARCADE_TEST_BALANCE: "$1000"
      // No RAILWAY_*/ARCADE_PUBLIC_URL — this is deliberately the laptop case, so
      // `preflight()` returns immediately and the process actually serves.
    }
  })
  hub.stdout.on("data", (d) => {
    hubOut += String(d)
  })
  hub.stderr.on("data", (d) => {
    hubOut += String(d)
  })
  hub.on("exit", (code, signal) => {
    hubOut += `\n[test] hub exited early: code=${code} signal=${signal}\n`
  })

  await waitFor(
    async () => (await fetch(`${BASE_URL}/healthz`)).ok,
    10_000,
    "the hub to answer /healthz"
  )

  runnerWs = await connectRunner()

  rootJobId = await payForRootJob()
}, 20_000)

afterAll(() => {
  try {
    runnerWs?.close()
  } catch {
    // already gone
  }
  hub?.kill()
})

describe("lineage ordering at the paid endpoint (real process, real HTTP)", () => {
  it("(a) a forged x-arcade-hire-capability is refused before any payment challenge", async () => {
    const forged = mintHireCapability("not-the-hub-secret", rootJobId, Date.now() + 60_000)
    const res = await fetch(`${BASE_URL}/x/${seller.address}/child-skill`, {
      method: "POST",
      headers: { "content-type": "application/json", [HIRE_CAPABILITY_HEADER]: forged },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("lineage_invalid")
  })

  it("(b) no capability header → the ordinary root challenge, with accepts[]", async () => {
    const res = await fetch(`${BASE_URL}/x/${seller.address}/root-skill`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { accepts?: Array<unknown>; error?: string }
    expect(body.error).not.toMatch(/^lineage_|^tree_budget_exceeded$/)
    expect(Array.isArray(body.accepts)).toBe(true)
    expect((body.accepts ?? []).length).toBeGreaterThan(0)
  })

  it("(c) a valid capability for a parent whose listing has NO maxSubSpendUsd still challenges — proves the reservation never runs on the probe", async () => {
    // `rootListing.bounds` declares no `maxSubSpendUsd` at all, and `rootJobId` is still
    // "queued" (the test runner never answered its JobAssignment). If the tree reservation
    // ran here, ceilingAtomicFor(undefined) = 0n would refuse every child instantly with
    // tree_budget_exceeded. It must not run at all on a probe — only after rail.verify.
    const cap = mintHireCapability(HUB_SECRET, rootJobId, Date.now() + 60_000)
    const res = await fetch(`${BASE_URL}/x/${seller.address}/child-skill`, {
      method: "POST",
      headers: { "content-type": "application/json", [HIRE_CAPABILITY_HEADER]: cap },
      body: JSON.stringify({})
    })
    const body = (await res.json()) as { accepts?: Array<unknown>; error?: string }
    expect(body.error).not.toBe("tree_budget_exceeded")
    expect(body.error).not.toMatch(/^lineage_/)
    expect(res.status).toBe(402)
    expect(Array.isArray(body.accepts)).toBe(true)
    expect((body.accepts ?? []).length).toBeGreaterThan(0)
  })
})
