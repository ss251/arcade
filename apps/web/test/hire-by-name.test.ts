import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asSchema, generateText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { deriveSigningRequest } from "../src/lib/purchase.ts"
import * as tools from "../src/lib/tools.ts"
import { handleQuote } from "../src/routes/api.quote.ts"
import { decide } from "../src/lib/approval.ts"

const HUB = "https://hub.example", WEB = "https://web.example"
const ID = "diff-triage", NAME = "diff-triage.seller.arcade.eth"
const SELLER = "0x" + "1".repeat(40), PAYEE = "0x" + "a".repeat(40), OTHER = "0x" + "b".repeat(40)
const INPUT = { patch: "actual input" }, opts = { toolCallId: "name_call", messages: [], context: {} }
const record = () => ({ name: NAME, skillId: ID, seller: SELLER, endpoint: HUB + "/x/" + SELLER + "/" + ID,
  payTo: PAYEE, chain: "eip155:5042002", priceAtomic: "99999", expired: false })
type Overrides = { names?: (read: number) => Response; payTo?: string; listingName?: string | null; afterName?: () => void; extraAccepts?: ReadonlyArray<Record<string, unknown>> }
const fixture = (over: Overrides = {}) => {
  let names = 0
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === "/names/" + NAME) {
      const result = over.names?.(++names) ?? Response.json(record())
      over.afterName?.(); return result
    }
    if (path === "/listings/" + ID) return Response.json({ id: ID, version: "0.1.0", seller: SELLER,
      serviceName: "Diff Triage", description: "Fixture", tags: [], price: "$0.01",
      inputSchema: {}, outputSchema: {}, bounds: { timeoutSec: 30 }, ensName: over.listingName ?? null })
    if (path === "/x/" + SELLER + "/" + ID) return Response.json({ x402Version: 2, rail: "eip3009", accepts: [{
      scheme: "exact", amount: "10000", payTo: over.payTo ?? PAYEE, network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000", resource: HUB + path,
      maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" }
    }, ...(over.extraAccepts ?? [])] }, { status: 402 })
    throw new Error("Unexpected fixture request")
  })
  vi.stubGlobal("fetch", f)
  return f
}
const prepare = (target: { skillId?: string; name?: string }) =>
  deriveSigningRequest({ ...target, maxAmountUsd: "$0.02", toolCallId: opts.toolCallId, input: INPUT })
beforeEach(() => { vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet") })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

const GATEWAY_ACCEPT = {
  scheme: "exact", amount: "10000", payTo: SELLER, network: "eip155:5042002",
  asset: "0x3600000000000000000000000000000000000000", resource: HUB + "/x/" + SELLER + "/" + ID,
  maxTimeoutSeconds: 604900,
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" }
}

describe("multi-rail challenges", () => {
  it("signs the USDC EIP-712 route when the hub also offers Gateway", async () => {
    // The live hub returns exactly this pair, Gateway first. Taking accepts[0] would sign a
    // domain this flow cannot honour and pay the seller instead of the listing's payee.
    fixture({ extraAccepts: [GATEWAY_ACCEPT] })
    expect(await prepare({ skillId: ID })).toMatchObject({ skillId: ID, payTo: PAYEE })
  })
  it("refuses rather than guessing when two accepts share the USDC domain", async () => {
    const twin = { ...GATEWAY_ACCEPT, payTo: OTHER, extra: { name: "USDC", version: "2" } }
    fixture({ extraAccepts: [twin] })
    await expect(prepare({ skillId: ID })).rejects.toThrow(/nothing was signed/)
  })
  it("refuses a challenge carrying more accepts than the bound", async () => {
    fixture({ extraAccepts: Array.from({ length: 8 }, () => GATEWAY_ACCEPT) })
    await expect(prepare({ skillId: ID })).rejects.toThrow(/nothing was signed/)
  })
})

describe("explicit ENS keyless purchase preparation", () => {
  it("resolves and rechecks an explicit name even when the listing advertises none", async () => {
    const f = fixture()
    expect(await prepare({ name: NAME })).toMatchObject({ skillId: ID, name: NAME, ensName: NAME,
      payTo: PAYEE, amountAtomic: "10000", toolCallId: opts.toolCallId })
    expect(f.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/names/" + NAME, "/listings/" + ID, "/x/" + SELLER + "/" + ID, "/names/" + NAME
    ])
    expect(JSON.parse(String(f.mock.calls[2]?.[1]?.body))).toEqual(INPUT)
    for (const [, init] of f.mock.calls) {
      expect(new Headers(init?.headers).has("payment-signature")).toBe(false)
      expect(init).toMatchObject({ redirect: "error", credentials: "omit" })
    }
  })
  it("pins issuer and chain before the initial name await", async () => {
    const f = fixture({ afterName: () => { vi.stubEnv("ARCADE_HUB", "https://other.example"); vi.stubEnv("ARCADE_NETWORK", "arc-mainnet") } })
    expect(await prepare({ name: NAME })).toMatchObject({ skillId: ID, network: "eip155:5042002" })
    expect(f.mock.calls.map(([url]) => new URL(String(url)).origin)).toEqual([HUB, HUB, HUB, HUB])
  })
  it("keeps the id-only path and original signing-request shape", async () => {
    const f = fixture()
    const result = await prepare({ skillId: ID })
    expect(result).not.toHaveProperty("name"); expect(result).not.toHaveProperty("ensName")
    expect(result).toMatchObject({ skillId: ID, amountAtomic: "10000" }); expect(f).toHaveBeenCalledTimes(2)
  })
  it.each([{}, { skillId: ID, name: NAME }, { name: "" }, { name: "HTTPS://bad.eth" }, { name: "x..eth" },
    { name: "diff%2etriag.eth" }, { name: "A.eth" }, { skillId: "x" }])("rejects an ambiguous/invalid target before IO: %j", async target => {
    const f = fixture()
    await expect(prepare(target)).rejects.toThrow(/target/i)
    expect(f).not.toHaveBeenCalled()
  })
  it.each([1, 2])("only the exact typed expiry at name read %s is expiry", async expiredRead => {
    const f = fixture({ names: n => n === expiredRead ? Response.json({ error: "ens_name_expired" }, { status: 404 }) : Response.json(record()) })
    await expect(prepare({ name: NAME })).rejects.toMatchObject({ _tag: "EnsNameExpired" })
    expect(f).toHaveBeenCalledTimes(expiredRead === 1 ? 1 : 4)
  })
  it("names both validated public payees on mismatch, but never accepts it", async () => {
    fixture({ payTo: OTHER })
    await expect(prepare({ name: NAME })).rejects.toMatchObject({ _tag: "EnsPayToMismatch",
      ensPayTo: PAYEE, challengePayTo: OTHER, message: expect.stringContaining(PAYEE) })
    await expect(prepare({ name: NAME })).rejects.toThrow(OTHER)
  })
  it("rejects a payee change only on the final resolver read", async () => {
    fixture({ names: n => Response.json({ ...record(), ...(n === 2 ? { payTo: OTHER } : {}) }) })
    await expect(prepare({ name: NAME })).rejects.toMatchObject({ _tag: "EnsPayToMismatch", ensPayTo: OTHER, challengePayTo: PAYEE })
  })
  it("compares payee addresses case-insensitively", async () => {
    fixture({ payTo: "0x" + "A".repeat(40) })
    expect(await prepare({ name: NAME })).toMatchObject({ ensName: NAME, payTo: "0x" + "A".repeat(40) })
  })
  it.each([
    { skillId: "other-skill", endpoint: HUB + "/x/" + SELLER + "/other-skill" },
    { seller: OTHER, endpoint: HUB + "/x/" + OTHER + "/" + ID },
    { endpoint: "https://foreign.example/x/" + SELLER + "/" + ID },
    { chain: "eip155:1" }, { name: "different.eth" }, { expired: true }
  ])("refuses a fresh resolver disagreement %j", async change => {
    fixture({ names: n => Response.json({ ...record(), ...(n === 2 ? change : {}) }) })
    await expect(prepare({ name: NAME })).rejects.toThrow(/ENS/)
  })
  it.each([404, 503])("does not leak or call a generic %s outage expiry", async status => {
    fixture({ names: () => Response.json({ error: "private RPC diagnostic" }, { status }) })
    await expect(prepare({ name: NAME })).rejects.toThrow(/ENS resolution unavailable/)
    await expect(prepare({ name: NAME })).rejects.not.toThrow(/private|expired/)
  })
  it("rejects malformed payee data without reflecting it", async () => {
    fixture({ names: () => Response.json({ ...record(), payTo: "private secret" }) })
    await expect(prepare({ name: NAME })).rejects.toThrow(/ENS resolution unavailable/)
    await expect(prepare({ name: NAME })).rejects.not.toThrow(/private secret/)
  })
  it("accepts the producer's explicit unknown ENS price without inventing a price", async () => {
    fixture({ names: () => Response.json({ ...record(), priceAtomic: null }) })
    expect(await prepare({ name: NAME })).toMatchObject({ amountAtomic: "10000", ensName: NAME })
  })
  it("returns the name's fixed expiry refusal as a tool result", async () => {
    fixture({ names: () => Response.json({ error: "ens_name_expired" }, { status: 404 }) })
    expect(await tools.arcade_call_skill.execute!({ name: NAME, maxAmountUsd: "$0.02" }, opts)).toMatchObject({
      awaitingSignature: false, refused: true, name: NAME, reason: expect.stringContaining("expired")
    })
  })
  it("returns mismatch through the real tool using only decoded public addresses", async () => {
    fixture({ payTo: OTHER })
    expect(await tools.arcade_call_skill.execute!({ name: NAME, maxAmountUsd: "$0.02", input: JSON.stringify(INPUT) }, opts))
      .toMatchObject({ awaitingSignature: false, refused: true, name: NAME,
        reason: expect.stringContaining(PAYEE + " differs from the payment challenge payTo " + OTHER) })
  })
  it("keeps advertised-name verification on an explicit alias instead of silently dropping it", async () => {
    fixture({ listingName: "other.seller.arcade.eth" })
    await expect(prepare({ name: NAME })).rejects.toThrow(/ENS resolution unavailable/)
  })
  it("enforces the same hard ceiling on name and id purchases", () => {
    expect(decide({ name: NAME, maxAmountUsd: "$2" }, { ARCADE_MAX_CALL_USD: "$1" })).toBe("denied")
    expect(decide({ name: NAME, maxAmountUsd: "$0.01" }, { ARCADE_MAX_CALL_USD: "$1" })).toBe("user-approval")
  })
  it("advertises and runtime-validates exactly one target in the actual SDK schema", async () => {
    const schema = asSchema(tools.arcade_call_skill.inputSchema)
    expect(await schema.validate?.({ name: NAME, maxAmountUsd: "$0.02" })).toMatchObject({ success: true })
    expect(await schema.validate?.({ skillId: ID, name: NAME, maxAmountUsd: "$0.02" })).toMatchObject({ success: false })
    expect(await schema.validate?.({ maxAmountUsd: "$0.02" })).toMatchObject({ success: false })
    expect(JSON.stringify(await schema.jsonSchema)).toContain("oneOf")
    expect(await schema.jsonSchema).toMatchObject({ type: "object", required: ["maxAmountUsd"],
      properties: { skillId: { type: "string" }, name: { type: "string" },
        maxAmountUsd: { type: "string" }, input: { type: "string" } } })
  })
  it("uses the actual read-only resolver tool through SDK model selection", async () => {
    const f = fixture()
    const model = new MockLanguageModelV4({ doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "resolve_1", toolName: "arcade_resolve_name", input: JSON.stringify({ name: NAME }) }],
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: []
    }) })
    const result = await generateText({ model, prompt: "Resolve the named listing.", tools: tools.READ_ONLY_TOOLS })
    expect(result.toolResults).toHaveLength(1)
    expect(result.toolResults[0]?.output).toMatchObject({ name: NAME, skillId: ID, payTo: PAYEE, note: expect.stringContaining("hub") })
    expect(f).toHaveBeenCalledTimes(1)
    expect(tools.SPENDING_TOOLS).not.toContain("arcade_resolve_name")
  })
  it("accepts explicit names at the actual keyless quote route with no-store", async () => {
    fixture()
    const response = await handleQuote({ request: new Request(WEB + "/api/quote", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ name: NAME, input: INPUT }) }) })
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ skillId: ID, ensName: NAME, browser: { skillId: ID, ensName: NAME } })
  })
  it("rejects both identifiers at the quote route before requests", async () => {
    const f = fixture()
    const response = await handleQuote({ request: new Request(WEB + "/api/quote", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ skillId: ID, name: NAME, input: INPUT }) }) })
    expect(response.status).toBe(400); expect(f).not.toHaveBeenCalled()
  })
  it("returns typed public mismatch and expiry at the quote route without raw causes", async () => {
    fixture({ payTo: OTHER })
    const call = () => handleQuote({ request: new Request(WEB + "/api/quote?name=" + NAME) })
    const mismatch = await call()
    expect(mismatch.status).toBe(502)
    expect(await mismatch.json()).toMatchObject({ error: "ens_payto_mismatch", ensPayTo: PAYEE, challengePayTo: OTHER })
    fixture({ names: () => Response.json({ error: "ens_name_expired", cause: "private RPC" }, { status: 404 }) })
    const expired = await call()
    expect(await expired.json()).toEqual({ error: "ens_name_expired", detail: "The ENS name has expired. Nothing was signed." })
  })
  it("bounds a stalled initial resolver and cancels it without a 402 probe", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(), f = vi.fn(async () => new Response(new ReadableStream({ cancel })))
    vi.stubGlobal("fetch", f)
    try {
      const result = prepare({ name: NAME }).then(() => "accepted", () => "refused")
      await vi.advanceTimersByTimeAsync(10001)
      expect(await result).toBe("refused")
      expect(cancel).toHaveBeenCalledTimes(1); expect(f).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
