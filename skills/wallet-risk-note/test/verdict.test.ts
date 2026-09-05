import { afterEach, describe, expect, it, vi } from "vitest"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { startHireBroker, type PurchaseFn } from "../../../packages/runner/src/hire-broker.ts"
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from "node:http"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  combineVerdict,
  hireOverUnix,
  runWalletRiskJob,
  type HireCall,
  type WalletEnvelope
} from "../run.ts"

const ADDRESS = `0x${"a".repeat(40)}`
const SELLER = `0x${"b".repeat(40)}`
const HASH = `0x${"c".repeat(64)}`
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const ENDPOINT = `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`
const NOW = Date.parse("2026-09-05T10:00:00.000Z")
const JOB = "job_parent0000000000"
const TOKEN = "d".repeat(64)

const flowResult = (over: Record<string, unknown> = {}) => ({
  address: ADDRESS,
  balanceUsdc: "2.000000",
  balanceAtomic: "2000000",
  nonce: 3,
  isContract: false,
  chainId: 5_042_002,
  blockNumber: "123456",
  checkedAt: new Date(NOW).toISOString(),
  ...over
})

const graphResult = (over: Record<string, unknown> = {}) => ({
  address: ADDRESS,
  verdict: "manual-review",
  identities: [],
  attesterSettledCount: 0,
  contradictions: ["no-erc8004-identity"],
  sources: [{
    name: "agent0-identities",
    endpoint: ENDPOINT,
    subgraphId: SUBGRAPH,
    block: 12,
    blockHash: HASH,
    chain: "eip155:8453",
    costAtomic: "10000",
    paymentTx: HASH
  }],
  evidenceFlags: ["payment-proof-unverified"],
  ...over
})

const brokerBody = (
  skillId: "usdc-flow-check" | "counterparty-graph",
  over: Record<string, unknown> = {}
) => ({
  skillId,
  jobId: skillId === "usdc-flow-check" ? "job_flow000000000000" : "job_graph00000000000",
  settled: true,
  result: skillId === "usdc-flow-check" ? flowResult() : graphResult(),
  fenced: "<<<UNTRUSTED-fixture>>>fixture<<<END-fixture>>>",
  costUsd: skillId === "usdc-flow-check" ? 0.01 : 0.05,
  remainingUsd: skillId === "usdc-flow-check" ? 0.07 : 0.02,
  ...over
})

const env = (socketPath = "/tmp/not-used.sock") => ({
  ARCADE_HIRE_SOCKET: socketPath,
  ARCADE_JOB_ID: JOB,
  ARCADE_JOB_TOKEN: TOKEN
})

const job = (input: Record<string, unknown> = { address: ADDRESS, minUsdc: 1 }) => ({ jobId: JOB, input })

const scriptedHire = (
  graph: unknown = brokerBody("counterparty-graph"),
  flow: unknown = brokerBody("usdc-flow-check")
) => {
  const calls: HireCall[] = []
  const hire = vi.fn(async (call: HireCall) => {
    calls.push(call)
    return call.skillId === "usdc-flow-check" ? flow : graph
  })
  return { calls, hire }
}

const expectRefusal = (envelope: WalletEnvelope) => {
  expect(envelope).toEqual({
    stopReason: "refusal",
    error: "Wallet Risk Note could not establish paid evidence; settlement refused"
  })
}
const within = async <T>(promise: PromiseLike<T>, timeoutMs = 2_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("fixture deadline exceeded")), timeoutMs)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

describe("one-way verdict composition", () => {
  it("never upgrades and withholds a clean allow when Graph evidence is missing", () => {
    expect(combineVerdict("ok", null)).toBe("caution")
    expect(combineVerdict("ok", { verdict: "allow", contradictions: [], attesterSettledCount: 0 })).toBe("caution")
    expect(combineVerdict("ok", { verdict: "manual-review", contradictions: [], attesterSettledCount: 0 })).toBe("caution")
    expect(combineVerdict("ok", { verdict: "refuse", contradictions: [], attesterSettledCount: 0 })).toBe("caution")
    expect(combineVerdict("caution", null)).toBe("caution")
    expect(combineVerdict("unfunded", { verdict: "allow", contradictions: [], attesterSettledCount: 0 })).toBe("unfunded")
  })
})

describe("strict wallet job", () => {
  it("correlates two settled broker children and preserves the object-shaped source", async () => {
    const fixture = scriptedHire()
    const envelope = await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW })
    expect(fixture.calls.map(call => [call.skillId, call.maxAmountUsd, call.input])).toEqual([
      ["usdc-flow-check", 0.01, { address: ADDRESS }],
      ["counterparty-graph", 0.05, { address: ADDRESS }]
    ])
    expect(envelope).toEqual({ stopReason: "end_turn", output: {
      address: ADDRESS,
      verdict: "caution",
      findings: [
        "Externally owned account — no contract code at this address.",
        "Has sent 3 transaction(s); the key is in use.",
        "Holds 2.000000 USDC, at or above the 1.000000 required to settle.",
        "Counterparty evidence: no ERC-8004 identity."
      ],
      balanceUsdc: "2.000000",
      isContract: false,
      everTransacted: true,
      counterparty: { verdict: "manual-review", contradictions: ["no-erc8004-identity"], attesterSettledCount: 0 },
      sourcedFrom: {
        skillId: "usdc-flow-check",
        paidUsdc: "$0.0100",
        budgetLeftUsd: "$0.0200",
        counterpartyGraph: { skillId: "counterparty-graph", paidUsdc: "$0.0500", evidenceUsed: true }
      }
    } })
  })

  it("continues only for a correlated definitive Graph no-settlement", async () => {
    const unavailable = brokerBody("counterparty-graph", {
      settled: false, result: null,
      fenced: "<<<UNTRUSTED-fixture>>>\nnull\n<<<END-fixture>>>", costUsd: 0, remainingUsd: 0.07
    })
    const fixture = scriptedHire(unavailable)
    const envelope = await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW })
    expect(envelope).toMatchObject({ stopReason: "end_turn", output: {
      verdict: "caution", counterparty: null,
      findings: expect.arrayContaining(["Counterparty evidence unavailable; clean allow withheld."]),
      sourcedFrom: { budgetLeftUsd: "$0.0700", counterpartyGraph: null }
    } })
  })

  it("refuses malformed flow, paid malformed Graph evidence and ambiguous transport with one fixed error", async () => {
    const badCases: Array<ReturnType<typeof scriptedHire>> = [
      scriptedHire(undefined, brokerBody("usdc-flow-check", { result: flowResult({ balanceAtomic: undefined }) })),
      scriptedHire(undefined, brokerBody("usdc-flow-check", { settled: false, result: null, costUsd: 0, remainingUsd: 0.08 })),
      scriptedHire(brokerBody("counterparty-graph", { result: graphResult({ verdict: "allow" }) })),
      scriptedHire(brokerBody("counterparty-graph", { result: graphResult({ attesterSettledCount: 1 }) }))
    ]
    for (const fixture of badCases) {
      expectRefusal(await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW }))
    }
    const uncertain = vi.fn(async () => { throw new Error("PRIVATE provider diagnostic") })
    const envelope = await runWalletRiskJob(job(), env(), { hire: uncertain, now: () => NOW })
    expectRefusal(envelope)
    expect(JSON.stringify(envelope)).not.toContain("PRIVATE")
    expect(uncertain).toHaveBeenCalledTimes(1)
  })

  it("rejects uncorrelated broker accounting and overprecision before inventing zeros", async () => {
    for (const graph of [
      brokerBody("counterparty-graph", { skillId: "usdc-flow-check" }),
      brokerBody("counterparty-graph", { costUsd: 0 }),
      brokerBody("counterparty-graph", { remainingUsd: 0.021 })
    ]) {
      const fixture = scriptedHire(graph)
      expectRefusal(await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW }))
    }
    const fixture = scriptedHire()
    expect(await runWalletRiskJob(job({ address: ADDRESS, minUsdc: 0.0000001 }), env(), {
      hire: fixture.hire, now: () => NOW
    })).toMatchObject({ stopReason: "refusal" })
    expect(fixture.hire).not.toHaveBeenCalled()
  })

  it("requires two distinct child job IDs that cannot reuse the parent", async () => {
    const flowId = brokerBody("usdc-flow-check").jobId
    for (const fixture of [
      scriptedHire(undefined, brokerBody("usdc-flow-check", { jobId: JOB })),
      scriptedHire(brokerBody("counterparty-graph", { jobId: flowId })),
      scriptedHire(brokerBody("counterparty-graph", {
        jobId: flowId, settled: false, result: null, costUsd: 0, remainingUsd: 0.07
      }))
    ]) {
      expectRefusal(await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW }))
    }
  })

  it("strictly binds every flow fact and the current Graph source contract", async () => {
    const flowMutations = [
      { address: SELLER }, { chainId: 8453 }, { balanceAtomic: "1999999" },
      { nonce: Number.MAX_SAFE_INTEGER + 1 }, { checkedAt: "2026-09-05T09:00:00.000Z" }
    ]
    for (const mutation of flowMutations) {
      const fixture = scriptedHire(undefined, brokerBody("usdc-flow-check", { result: flowResult(mutation) }))
      expectRefusal(await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW }))
    }
    const source = graphResult().sources[0]!
    const graphMutations = [
      { address: SELLER },
      { sources: [{ ...source, costAtomic: null }] },
      { sources: [{ ...source, paymentTx: null }] },
      { sources: [{ ...source, chain: "eip155:5042002" }] },
      { evidenceFlags: ["provider-said-safe"] }
    ]
    for (const mutation of graphMutations) {
      const fixture = scriptedHire(brokerBody("counterparty-graph", { result: graphResult(mutation) }))
      expectRefusal(await runWalletRiskJob(job(), env(), { hire: fixture.hire, now: () => NOW }))
    }
  })
})

describe("bounded Unix broker transport", () => {
  let directory: string | undefined
  let server: Server | undefined
  afterEach(async () => {
    const owned = server
    owned?.closeAllConnections()
    if (owned?.listening) await within(new Promise<void>(resolve => owned.close(() => resolve())), 1_000)
    server = undefined
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
    directory = undefined
    vi.restoreAllMocks()
  })

  const listen = async (handler: RequestListener) => {
    directory = mkdtempSync("/tmp/wallet-risk-note-")
    const socketPath = join(directory, "broker.sock")
    server = createServer(handler)
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(socketPath, resolve) })
    return socketPath
  }

  it("accepts a chunked JSON body and sends only the exact grant and fixed request", async () => {
    let seen: { headers: IncomingHttpHeaders; body: string } | undefined
    const expected = brokerBody("usdc-flow-check")
    const socketPath = await listen((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", chunk => chunks.push(Buffer.from(chunk)))
      req.on("end", () => {
        seen = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") }
        const bytes = JSON.stringify(expected), middle = Math.floor(bytes.length / 2)
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "identity" })
        res.write(bytes.slice(0, middle)); res.end(bytes.slice(middle))
      })
    })
    const body = await hireOverUnix({ grant: { socketPath, jobId: JOB, token: TOKEN },
      skillId: "usdc-flow-check", input: { address: ADDRESS }, maxAmountUsd: 0.01, timeoutMs: 1000 })
    expect(body).toEqual(expected)
    expect(seen?.headers["x-job-id"]).toBe(JOB)
    expect(seen?.headers["x-job-token"]).toBe(TOKEN)
    expect(seen?.headers["accept-encoding"]).toBe("identity")
    expect(seen?.headers["content-length"]).toBe(String(Buffer.byteLength(seen!.body)))
    expect(JSON.parse(seen!.body)).toEqual({ skillId: "usdc-flow-check", input: { address: ADDRESS }, maxAmountUsd: 0.01 })
  })

  it("destroys a stalled response on cancellation and never retries", async () => {
    let requests = 0, received!: () => void
    const arrived = new Promise<void>(resolve => { received = resolve })
    const socketPath = await listen(req => { requests++; req.resume(); received() })
    const connectionClosed = new Promise<void>(resolve => {
      server!.once("connection", socket => socket.once("close", () => resolve()))
    })
    const controller = new AbortController()
    const pending = hireOverUnix({ grant: { socketPath, jobId: JOB, token: TOKEN },
      skillId: "usdc-flow-check", input: { address: ADDRESS }, maxAmountUsd: 0.01,
      signal: controller.signal, timeoutMs: 1000 })
    await within(arrived); controller.abort()
    await within(expect(pending).rejects.toThrow("Wallet Risk Note broker unavailable"))
    await within(connectionClosed)
    expect(requests).toBe(1)
  })

  it("enforces its own whole-response deadline and makes one attempt", async () => {
    let requests = 0
    const socketPath = await listen(req => { requests++; req.resume() })
    const call = hireOverUnix({ grant: { socketPath, jobId: JOB, token: TOKEN },
      skillId: "usdc-flow-check", input: { address: ADDRESS }, maxAmountUsd: 0.01, timeoutMs: 20 })
    await expect(call).rejects.toThrow("Wallet Risk Note broker unavailable")
    expect(requests).toBe(1)
  })

  it("does not reflect a broker diagnostic from a non-success response", async () => {
    const socketPath = await listen((_req, res) => {
      res.writeHead(502, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "PRIVATE provider diagnostic" }))
    })
    const call = hireOverUnix({ grant: { socketPath, jobId: JOB, token: TOKEN },
      skillId: "counterparty-graph", input: { address: ADDRESS }, maxAmountUsd: 0.05, timeoutMs: 1000 })
    await expect(call).rejects.toThrow("Wallet Risk Note broker unavailable")
    await expect(call).rejects.not.toThrow("PRIVATE")
  })

  it("runs through the actual broker and its parent-budget ledger without a real buyer or chain", async () => {
    directory = mkdtempSync("/tmp/wallet-risk-note-broker-")
    const socketPath = join(directory, "broker.sock")
    const purchases: Parameters<PurchaseFn>[0][] = []
    const purchase: PurchaseFn = async args => {
      purchases.push(args)
      const flow = args.skillId === "usdc-flow-check"
      return { jobId: flow ? "job_flow000000000000" : "job_graph00000000000", settled: true,
        result: flow ? flowResult() : graphResult(), fenced: "fixture", paidAtomic: flow ? 10_000n : 50_000n }
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(vi.fn(async () => Response.json({ seller: SELLER })),
      { preconnect: () => { throw new Error("unexpected external preconnect") } })
    const broker = startHireBroker({ hubUrl: "http://owned.invalid", subBuyKey: `0x${"1".repeat(64)}`, socketPath, purchase })
    try {
      const token = broker.openJob(JOB, 0.08, "test.lineage.signature")
      const envelope = await runWalletRiskJob(job(), { ARCADE_HIRE_SOCKET: socketPath,
        ARCADE_JOB_ID: JOB, ARCADE_JOB_TOKEN: token }, { now: () => NOW })
      expect(envelope).toMatchObject({ stopReason: "end_turn", output: {
        sourcedFrom: { paidUsdc: "$0.0100", budgetLeftUsd: "$0.0200",
          counterpartyGraph: { paidUsdc: "$0.0500" } }
      } })
      expect(purchases.map(p => [p.skillId, p.maxAmountAtomic, p.lineage])).toEqual([
        ["usdc-flow-check", 10_000n, "test.lineage.signature"],
        ["counterparty-graph", 50_000n, "test.lineage.signature"]
      ])
      expect(broker.spentUsd(JOB)).toBe(0.06)
    } finally {
      broker.stop(); globalThis.fetch = originalFetch
    }
  })
})

describe("manifest and bounded economics", () => {
  it("keeps the historical object source while declaring nullable Graph evidence and exact arithmetic", () => {
    const raw = JSON.parse(readFileSync(new URL("../arcade.json", import.meta.url), "utf8"))
    const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
    const flow = Schema.decodeUnknownSync(SkillManifest)(JSON.parse(readFileSync(new URL("../../usdc-flow-check/arcade.json", import.meta.url), "utf8")))
    const graph = Schema.decodeUnknownSync(SkillManifest)(JSON.parse(readFileSync(new URL("../../counterparty-graph/arcade.json", import.meta.url), "utf8")))
    expect(manifest.price).toBe("$0.15")
    expect(manifest.bounds).toMatchObject({ timeoutSec: 135, maxSubSpendUsd: 0.08 })
    expect((raw.outputSchema.required as string[])).toContain("counterparty")
    expect(raw.outputSchema.properties.sourcedFrom.type).toBe("object")
    expect(raw.outputSchema.properties.sourcedFrom.properties.counterpartyGraph.type).toEqual(["object", "null"])
    expect([flow.price, graph.price]).toEqual(["$0.01", "$0.05"])
    const sellerShare = 150_000n * 9_500n / 10_000n
    const childCost = 10_000n + 50_000n
    expect({ sellerShare, childCost, preInferenceMargin: sellerShare - childCost })
      .toEqual({ sellerShare: 142_500n, childCost: 60_000n, preInferenceMargin: 82_500n })
  })
})
