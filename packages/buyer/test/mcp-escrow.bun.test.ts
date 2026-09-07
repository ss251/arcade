import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import { Effect } from "effect"
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RpcFailure } from "@arcade/core"
import { buyerFixture, ephemeralBuyerKey } from "../../payments/test/fixtures/erc8183-buyer.ts"
import { openEscrowBuyerJournal } from "../../payments/src/erc8183-buyer-journal.ts"
import { recordSyntheticBuyerPurchase } from "../../payments/test/fixtures/erc8183-buyer-record.ts"
const envKeys = ["ARCADE_HUB", "ARCADE_NETWORK", "ARCADE_MAX_CALL_USD", "ARCADE_SESSION_BUDGET_USD", "ARCADE_BUYER_KEY", "ARCADE_BUYER_ESCROW_CONFIG", "ARCADE_BUYER_ESCROW_JOURNAL"]
const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch
const restoreEnv = () => { for (const key of envKeys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } }
process.env.ARCADE_HUB = "https://example.test"; process.env.ARCADE_NETWORK = "arc-testnet"
process.env.ARCADE_MAX_CALL_USD = "0.50"; process.env.ARCADE_SESSION_BUDGET_USD = "1.00"
const m = await import("../src/mcp.ts")
restoreEnv()
let dir: string, f: Awaited<ReturnType<typeof buyerFixture>>, requests: string[], sdkCalls: number
let config: Record<string, unknown>
beforeEach(async () => {
  process.env.ARCADE_HUB = "https://example.test"; process.env.ARCADE_NETWORK = "arc-testnet"
  process.env.ARCADE_MAX_CALL_USD = "0.50"; process.env.ARCADE_SESSION_BUDGET_USD = "1.00"
  f = await buyerFixture(); requests = []; sdkCalls = 0
  dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-mcp-escrow-test-"))); chmodSync(dir, 0o700)
  config = { identity: f.intent.identity, buyer: f.intent.client, gasBudgetWei: "6000000", expiresInSeconds: 1800, operationTimeoutMs: 3000 }
  process.env.ARCADE_BUYER_ESCROW_CONFIG = join(dir, "config.json"); process.env.ARCADE_BUYER_ESCROW_JOURNAL = join(dir, "purchase.sqlite")
  process.env.ARCADE_BUYER_KEY = ephemeralBuyerKey
  writeFileSync(process.env.ARCADE_BUYER_ESCROW_CONFIG, JSON.stringify(config), { mode: 0o600 })
  globalThis.fetch = (async url => {
    requests.push(String(url))
    if (String(url) === "https://example.test/listings") return Response.json([{ id: "skill", seller: f.intent.call.provider, price: "$0.30" }])
    if (String(url) !== f.intent.call.resource) throw Error("UNEXPECTED_PRIVATE_REQUEST")
    return Response.json({ x402Version: 2, accepts: [f.input.requirements] }, { status: 402 })
  }) as typeof globalThis.fetch
  m.__resetBudget(); m.__setCallSkill(() => { sdkCalls++; return Effect.fail(new RpcFailure({ method: "escrow", reason: "PRIVATE_DIAGNOSTIC" })) })
})
afterEach(() => { m.__resetBudget(); m.__setCallSkill(undefined); globalThis.fetch = originalFetch; restoreEnv(); rmSync(dir, { recursive: true, force: true }) })
afterAll(restoreEnv)
const invoke = (extra: Record<string, unknown> = {}, signal?: AbortSignal) => m.handleTool("arcade_call_skill", { skillId: "skill", input: { fixture: true }, rail: "erc8183", ...extra }, signal === undefined ? {} : { signal })
test("explicit escrow needs owner config and rejects private tool arguments without reflecting them", async () => {
  delete process.env.ARCADE_BUYER_ESCROW_CONFIG; delete process.env.ARCADE_BUYER_ESCROW_JOURNAL
  expect(JSON.stringify(await invoke())).toContain("escrow_configuration_required")
  const bad = JSON.stringify(await invoke({ key: "PRIVATE_SENTINEL", journal: "/PRIVATE_SENTINEL" }))
  expect(bad).toContain("input_invalid"); expect(bad).not.toContain("PRIVATE_SENTINEL"); expect(requests).toHaveLength(0); expect(sdkCalls).toBe(0)
})
test("per-call cap includes rounded gas before any key or journal open", async () => {
  process.env.ARCADE_BUYER_KEY = "PRIVATE_INVALID"
  const out = JSON.stringify(await invoke({ maxAmountUsd: 0.30 }))
  expect(out).toContain("including the escrow gas cap"); expect(out).not.toContain("PRIVATE_INVALID")
  expect(sdkCalls).toBe(0); expect(existsSync(process.env.ARCADE_BUYER_ESCROW_JOURNAL!)).toBe(false)
})
test("a tool argument cannot raise the owner ceiling to cover extra escrow gas", async () => {
  writeFileSync(process.env.ARCADE_BUYER_ESCROW_CONFIG!, JSON.stringify({ ...config, gasBudgetWei: "200001000000000000" }))
  process.env.ARCADE_BUYER_KEY = "PRIVATE_INVALID"
  const out = JSON.stringify(await invoke({ maxAmountUsd: 999 }))
  expect(out).toContain("server's per-call ceiling"); expect(out).toContain("including the escrow gas cap")
  expect(out).not.toContain("PRIVATE_INVALID"); expect(sdkCalls).toBe(0); expect(existsSync(process.env.ARCADE_BUYER_ESCROW_JOURNAL!)).toBe(false)
})
test("owner config alone cannot enable default escrow selection", async () => {
  process.env.ARCADE_BUYER_KEY = "PRIVATE_INVALID"
  const out = await m.handleTool("arcade_call_skill", { skillId: "skill", input: { fixture: true } })
  expect(out.isError).toBe(true); expect(JSON.stringify(out)).not.toContain("PRIVATE_INVALID"); expect(sdkCalls).toBe(0)
  expect(existsSync(process.env.ARCADE_BUYER_ESCROW_JOURNAL!)).toBe(false)
})
test("unknown escrow outcomes retain principal plus gas and never expose private diagnostics", async () => {
  const out = JSON.stringify(await invoke())
  expect(out).toContain("0.300001 remains reserved"); expect(out).not.toContain("PRIVATE_DIAGNOSTIC"); expect(sdkCalls).toBe(1); expect(m.spentSoFarAtomic()).toBe(0n)
})
test("an unsigned refusal releases only an empty private journal reservation", async () => {
  m.__setCallSkill(() => { sdkCalls++; return Effect.fail(new RpcFailure({ method: "402", reason: "PRIVATE_DIAGNOSTIC" })) })
  expect(JSON.stringify(await invoke())).toContain("reservation was released")
  m.__setCallSkill(args => Effect.gen(function* () {
    yield* Effect.promise(() => args.escrow!.journal.claim(f.input, '{"fixture":true}'))
    return yield* new RpcFailure({ method: "402", reason: "PRIVATE_DIAGNOSTIC" })
  }))
  expect(JSON.stringify(await invoke())).toContain("0.300001 remains reserved")
  const opened = openEscrowBuyerJournal(process.env.ARCADE_BUYER_ESCROW_JOURNAL!)
  try { expect(await opened.journal.inspect()).toMatchObject({ state: "claimed" }) } finally { opened.close() }
})
test("cumulative ceiling includes configured gas and reserves the full uncertain exposure", async () => {
  writeFileSync(process.env.ARCADE_BUYER_ESCROW_CONFIG!, JSON.stringify({ ...config, gasBudgetWei: "200000000000000000" }))
  expect((await invoke()).isError).toBe(true); expect((await invoke()).isError).toBe(true)
  process.env.ARCADE_BUYER_KEY = "PRIVATE_INVALID"
  const out = JSON.stringify(await invoke())
  expect(out).toContain("remains of this session"); expect(out).not.toContain("PRIVATE_INVALID"); expect(sdkCalls).toBe(2)
})
test.each(["succeeded", "failed"])("durable funding counts principal plus actual gas despite hub-reported %s/refund", async status => {
  m.__setCallSkill(args => Effect.promise(async () => {
    sdkCalls++; const accepted = await recordSyntheticBuyerPurchase(args.escrow!.journal)
    return { jobId: accepted.jobId, status, result: { fixture: true }, receipt: { settled: status === "succeeded", price: "$0.00", refunded: true },
      authorizedRail: "erc8183" as const, authorizedAmountAtomic: 300000n, fencedResult: "<<<UNTRUSTED:fixture>>>data<<</UNTRUSTED:fixture>>>" }
  }))
  const out = await invoke(), encoded = JSON.stringify(out)
  expect(out.isError).not.toBe(true); expect(m.spentSoFarAtomic()).toBe(300001n)
  expect(out.structuredContent).toMatchObject({ authorizedRail: "erc8183", fundedUsdc: "0.300000", buyerGasUsdc: "0.000001", accountedSpendUsdc: "0.300001",
    settlementVerified: false, refundVerified: false, escrowEvidence: { state: "funded_and_queued", buyerGasWei: "600000" } })
  expect(encoded).not.toContain("b".repeat(32)); expect(encoded).not.toContain(ephemeralBuyerKey); expect(encoded).not.toContain(dir)
  process.env.ARCADE_BUYER_KEY = "PRIVATE_INVALID"
  expect(JSON.stringify(await invoke())).toContain("escrow_configuration_refused"); expect(sdkCalls).toBe(1); expect(m.spentSoFarAtomic()).toBe(300001n)
})
test("fabricated SDK success without owned journal proof cannot release exposure", async () => {
  m.__setCallSkill(() => Effect.succeed({ jobId: "job_fake", status: "succeeded", result: {}, receipt: { settled: true, price: "$0.30" },
    authorizedRail: "erc8183", authorizedAmountAtomic: 300000n, fencedResult: "fixture" }))
  expect(JSON.stringify(await invoke())).toContain("0.300001 remains reserved"); expect(m.spentSoFarAtomic()).toBe(0n)
})
test("cancellation joins durable cleanup before closing journal and releasing the purchase lease", async () => {
  const controller = new AbortController(); let enter!: () => void, done = false, timer: ReturnType<typeof setTimeout> | undefined
  const entered = new Promise<void>(r => { enter = r })
  m.__setCallSkill(args => Effect.acquireUseRelease(
    Effect.promise(() => args.escrow!.journal.claim(f.input, '{"fixture":true}')),
    () => Effect.sync(enter).pipe(Effect.zipRight(Effect.never)),
    claim => Effect.promise(async () => { await Bun.sleep(30); await args.escrow!.journal.uncertain(claim!); done = true })))
  const running = invoke({}, controller.signal)
  try {
    await Promise.race([entered, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("fixture not entered")), 1000) })]); clearTimeout(timer)
    controller.abort(); expect((await running).isError).toBe(true); expect(done).toBe(true)
    const journal = openEscrowBuyerJournal(process.env.ARCADE_BUYER_ESCROW_JOURNAL!)
    try { expect(await journal.journal.inspect()).toMatchObject({ state: "uncertain" }) } finally { journal.close() }
    expect(JSON.stringify(await invoke())).toContain("escrow_configuration_refused"); expect(m.spentSoFarAtomic()).toBe(0n)
  } finally { clearTimeout(timer); controller.abort(); await running }
})
