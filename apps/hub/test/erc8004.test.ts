import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { encodeAbiParameters } from "viem"
import { loadChainConfig } from "@arcade/core"
import { Erc8004Failed, Erc8004FromEnv, Erc8004Tag, keyRoleRefusal, makeConfirmedWallet, makeErc8004, noopErc8004, boundedRegistryResponse, type Erc8004Wallet } from "../src/erc8004.ts"

const registries = loadChainConfig("arc-testnet").erc8004!
const OP = `0x${"11".repeat(20)}`, VA = `0x${"22".repeat(20)}`, AT = `0x${"33".repeat(20)}`, OWNER = `0x${"44".repeat(20)}`
const HASH = `0x${"ab".repeat(32)}`, OTHER = `0x${"cd".repeat(32)}`
const goodFeedback = [[AT, AT], [1n, 2n], [1n, 1n], [0, 0], ["arcade-settled", "arcade-settled"], ["a", "b"], [false, false]]
const status = [VA, 42n, 100, HASH, "arcade-settle", 1n]
const build = (over: Record<string, unknown> = {}) => {
  const writes: Array<{ role: string; call: any }> = [], reads: any[] = []
  const wallet = (address: string): Erc8004Wallet => ({ address, writeContract: async call => { writes.push({ role: address, call }); return HASH } })
  const answers: Record<string, unknown> = { ownerOf: OWNER, getAgentValidations: [HASH, OTHER], getValidationStatus: status, readAllFeedback: goodFeedback }
  const reader = { readContract: async (call: any) => { reads.push(call); return answers[call.functionName] } }
  return { writes, reads, answers, svc: makeErc8004({ registries, chainId: 5042002, reader, operator: wallet(OP), validator: wallet(VA), attester: wallet(AT), ...over }) }
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("three-key service", () => {
  it("encodes each write from the exact role with pinned tags", async () => {
    const { svc, writes } = build()
    expect(await Effect.runPromise(svc.requestValidation({ agentId: "42", requestURI: "https://h/request", requestHash: HASH }))).toBe(HASH)
    await Effect.runPromise(svc.respondValidation({ requestHash: HASH, response: 0, responseURI: "https://h/response", responseHash: OTHER }))
    await Effect.runPromise(svc.giveFeedback({ agentId: "42", skillId: "a", endpoint: "https://h/x", feedbackURI: "https://h/feedback", feedbackHash: HASH }))
    expect(writes.map(w => w.role)).toEqual([OP, VA, AT])
    expect(writes.map(w => w.call.functionName)).toEqual(["validationRequest", "validationResponse", "giveFeedback"])
    expect(writes[0]!.call).toMatchObject({ address: registries.validation, args: [VA, 42n, "https://h/request", HASH] })
    expect(writes[1]!.call.args).toEqual([HASH, 0, "https://h/response", OTHER, "arcade-settle"])
    expect(writes[2]!.call.args).toEqual([42n, 1n, 0, "arcade-settled", "a", "https://h/x", "https://h/feedback", HASH])
  })
  it.each([[OP, VA, OP], [OP, VA, VA], [OP, OP, AT]])("refuses colliding role keys %s/%s/%s", (operator, validator, attester) => {
    expect(keyRoleRefusal({ operator, validator, attester })).toBeTypeOf("string")
  })
  it("validates the roles case-insensitively and disables bad direct config", () => {
    expect(keyRoleRefusal({ operator: OP, validator: VA, attester: AT })).toBeUndefined()
    expect(keyRoleRefusal({ operator: OP.toUpperCase().replace("0X", "0x"), validator: VA, attester: OP })).toBeDefined()
    expect(build({ attester: { address: OP, writeContract: async () => HASH } }).svc.armed).toBe(false)
  })
  it("never leaks provider text and does not repeat an uncertain write", async () => {
    let attempts = 0
    const { svc } = build({ operator: { address: OP, writeContract: () => { attempts++; throw new Error("SECRET_PRIVATE_KEY https://rpc/?token=SECRET -32011") } } })
    const out = await Effect.runPromise(Effect.either(svc.requestValidation({ agentId: "42", requestURI: "https://h/a", requestHash: HASH })))
    expect(out._tag).toBe("Left")
    expect(JSON.stringify(out)).not.toContain("SECRET")
    expect(attempts).toBe(1)
  })
  it("bad IDs and non-binary responses fail without throwing or touching clients", async () => {
    const { svc, writes, reads } = build()
    for (const agentId of ["-1", "1e2", "01", "x", (2n ** 256n).toString()]) {
      expect((await Effect.runPromise(Effect.either(svc.ownerOf(agentId))))._tag).toBe("Left")
    }
    expect((await Effect.runPromise(Effect.either(svc.respondValidation({ requestHash: HASH, response: 50, responseURI: "https://h/r", responseHash: HASH }))))._tag).toBe("Left")
    expect(reads).toEqual([]); expect(writes).toEqual([])
  })
  it("provides the noop service instead of throwing on an unconfigured hub", async () => {
    const svc = noopErc8004("not configured")
    expect(svc.armed).toBe(false)
    expect(await Effect.runPromise(svc.evidenceFor("bad"))).toEqual({ validationPasses: 0, validationsRead: 0, settlementFeedback: 0, stale: true })
    expect((await Effect.runPromise(Effect.either(svc.ownerOf("42"))))._tag).toBe("Left")
  })
})

describe("bounded filtered evidence", () => {
  it("reads only our attester, counts our tagged answers, and never calls getSummary", async () => {
    const { svc, reads } = build()
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toEqual({ validationPasses: 2, validationsRead: 2, settlementFeedback: 2, stale: false })
    expect(reads.find(r => r.functionName === "readAllFeedback").args).toEqual([42n, [AT], "arcade-settled", "", false])
    expect(reads.some(r => r.functionName.includes("Summary"))).toBe(false)
  })
  it("filters wrong validator, agent, tag and unanswered requests out of the denominator", async () => {
    for (const st of [[OWNER, ...status.slice(1)], [VA, 7n, ...status.slice(2)], [...status.slice(0, 4), "wrong", 1n], [...status.slice(0, 5), 0n]]) {
      const { svc, answers } = build(); answers.getValidationStatus = st
      expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ validationPasses: 0, validationsRead: 0, stale: false })
    }
    const { svc, answers } = build(); answers.getValidationStatus = [VA, 42n, 0, HASH, "arcade-settle", 1n]
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ validationPasses: 0, validationsRead: 2 })
  })
  it("independently validates every feedback dimension, including revoked/value/decimals", async () => {
    for (const [column, value] of [[0, OWNER], [2, 2n], [3, 1], [4, "wrong"], [6, true]] as const) {
      const { svc, answers } = build(); const fb = goodFeedback.map(xs => [...xs]); fb[column]![0] = value as never; answers.readAllFeedback = fb
      expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ settlementFeedback: 1, stale: false })
    }
  })
  it("deduplicates hashes and caps status reads at twenty", async () => {
    const { svc, answers, reads } = build()
    answers.getAgentValidations = Array.from({ length: 50 }, (_, i) => `0x${i.toString(16).padStart(64, "0")}`).concat([HASH, HASH])
    await Effect.runPromise(svc.evidenceFor("42"))
    const statusReads = reads.filter(r => r.functionName === "getValidationStatus")
    expect(statusReads).toHaveLength(20)
    expect(new Set(statusReads.map(r => r.args[0])).size).toBe(20)
  })
  it("caches concurrent results and expires both success and failure snapshots", async () => {
    let now = 0; const { svc, reads, answers } = build({ nowMs: () => now })
    await Promise.all(Array.from({ length: 10 }, () => Effect.runPromise(svc.evidenceFor("42"))))
    expect(reads).toHaveLength(4)
    now = 60_001; answers.getAgentValidations = "malformed"
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ stale: true })
    const count = reads.length
    await Effect.runPromise(svc.evidenceFor("42")); expect(reads).toHaveLength(count)
  })
  it.each([null, [], [[AT], [], [], [], [], [], []]])("malformed feedback is stale, not a fabricated count", async value => {
    const { svc, answers } = build(); answers.readAllFeedback = value
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ stale: true, settlementFeedback: 0 })
  })
  it("a hanging reader is bounded and degrades without leaking or failing", async () => {
    const { svc } = build({ reader: { readContract: () => new Promise(() => {}) }, readTimeoutMs: 20 })
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ stale: true })
  })
})

describe("confirmed registry wallet", () => {
  const base = () => ({ address: OP, chainId: 5042002, getChainId: async () => 5042002,
    send: vi.fn(async () => HASH), receipt: vi.fn(async () => ({ status: "success", transactionHash: HASH })), pollMs: 0, attempts: 2 })
  it("returns only a confirmed successful transaction and broadcasts once", async () => {
    const cfg = base(); cfg.receipt.mockRejectedValueOnce(new Error("not found"))
    expect(await makeConfirmedWallet(cfg).writeContract({})).toBe(HASH)
    expect(cfg.send).toHaveBeenCalledTimes(1); expect(cfg.receipt).toHaveBeenCalledTimes(2)
  })
  it.each(["reverted", "pending"])("rejects %s receipts without a second broadcast", async status => {
    const cfg = base(); cfg.receipt.mockResolvedValue({ status, transactionHash: HASH })
    await expect(makeConfirmedWallet(cfg).writeContract({})).rejects.toMatchObject({ _tag: "Erc8004Failed", retryable: false })
    expect(cfg.send).toHaveBeenCalledTimes(1)
  })
  it("rejects a receipt for another transaction", async () => {
    const cfg = base(); cfg.receipt.mockResolvedValue({ status: "success", transactionHash: OTHER })
    await expect(makeConfirmedWallet(cfg).writeContract({})).rejects.toThrow()
  })
  it("rejects wrong-chain RPC before broadcast", async () => {
    const cfg = { ...base(), getChainId: async () => 1 }
    await expect(makeConfirmedWallet(cfg).writeContract({})).rejects.toThrow()
    expect(cfg.send).not.toHaveBeenCalled()
  })
  it("unreadable confirmation is not treated as success", async () => {
    const cfg = base(); cfg.receipt.mockRejectedValue(new Error("SECRET provider text"))
    const error = await makeConfirmedWallet(cfg).writeContract({}).catch(e => e)
    expect(error).toBeInstanceOf(Erc8004Failed); expect(JSON.stringify(error)).not.toContain("SECRET")
    expect(cfg.send).toHaveBeenCalledTimes(1)
  })
})

describe("feature-only environment refusal", () => {
  it("checks the actual RPC chain before trusting owner or evidence reads", async () => {
    vi.stubEnv("ARCADE_OPERATOR_KEY", `0x${"01".repeat(32)}`); vi.stubEnv("ARCADE_VALIDATOR_KEY", `0x${"02".repeat(32)}`); vi.stubEnv("ARCADE_ATTESTER_KEY", `0x${"03".repeat(32)}`)
    vi.stubEnv("ARCADE_RAIL", "eip3009"); vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
    const calls: string[] = []
    vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body)); calls.push(req.method)
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id,
        result: req.method === "eth_chainId" ? "0x1" : encodeAbiParameters([{ type: "address" }], [OWNER as `0x${string}`]) }))
    })
    const svc = await Effect.runPromise(Effect.provide(Erc8004Tag, Erc8004FromEnv(registries)))
    expect((await Effect.runPromise(Effect.either(svc.ownerOf("42"))))._tag).toBe("Left")
    expect(await Effect.runPromise(svc.evidenceFor("42"))).toMatchObject({ stale: true })
    expect(calls.length).toBeGreaterThan(0); expect(calls.every(method => method === "eth_chainId")).toBe(true)
  })
  it("rejects unpinned registries even with valid distinct role keys", async () => {
    vi.stubEnv("ARCADE_OPERATOR_KEY", `0x${"01".repeat(32)}`); vi.stubEnv("ARCADE_VALIDATOR_KEY", `0x${"02".repeat(32)}`); vi.stubEnv("ARCADE_ATTESTER_KEY", `0x${"03".repeat(32)}`)
    vi.stubEnv("ARCADE_RAIL", "eip3009"); vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const svc = await Effect.runPromise(Effect.provide(Erc8004Tag, Erc8004FromEnv({ ...registries, validation: OWNER })))
    expect(svc.armed).toBe(false)
  })
  it.each([undefined, "", "SECRET-invalid-key"])("unarms safely for bad key %s", async key => {
    vi.stubEnv("ARCADE_OPERATOR_KEY", key); vi.stubEnv("ARCADE_VALIDATOR_KEY", key); vi.stubEnv("ARCADE_ATTESTER_KEY", key)
    const log = vi.spyOn(console, "warn").mockImplementation(() => {})
    const svc = await Effect.runPromise(Effect.provide(Erc8004Tag, Erc8004FromEnv(registries)))
    expect(svc.armed).toBe(false); expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET")
  })
})

describe("bounded registry HTTP responses", () => {
  it("preserves a small response and its status", async () => {
    const res = await boundedRegistryResponse(new Response('{"jsonrpc":"2.0"}', { status: 429 }))
    expect(res.status).toBe(429); expect(await res.text()).toBe('{"jsonrpc":"2.0"}')
  })
  it("rejects an oversized body even without a content-length header", async () => {
    let cancelled = false
    const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(600_000)) }, cancel() { cancelled = true } })
    await expect(boundedRegistryResponse(new Response(body))).rejects.toThrow()
    expect(cancelled).toBe(true)
  })
})
