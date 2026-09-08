import { describe, expect, it, vi } from "vitest"
import { validateJson } from "../../../apps/hub/src/validate.ts"
import { readFileSync } from "node:fs"

const ADDRESS = "0x1111111111111111111111111111111111111111"
const HASH = `0x${"ab".repeat(32)}`
const TX = `0x${"cd".repeat(32)}`
const KEY = `0x${"11".repeat(32)}` // Public dummy fixture, never sent to any network.
const meta = () => ({ block: { number: 41, hash: HASH }, hasIndexingErrors: false })
const agent = () => ({ id: "8453:7", chainId: "8453", agentId: "7", owner: ADDRESS,
  agentWallet: ADDRESS, registrationFile: { name: "Fixture", active: true, x402Support: true,
    supportedTrusts: [], mcpEndpoint: null, ens: null }, validations: [] })
const firstData = (): Record<string, unknown> => ({ _meta: meta(), asWallet: [agent()], asOwner: [] })
const secondData = (): Record<string, unknown> => ({ _meta: meta(), feedbacks: [] })
const result = (data: Record<string, unknown>) => ({ data, paymentTx: TX, costAtomic: "10000" })
const fixture = (first = firstData(), second = secondData()) => {
  let calls = 0
  const query = vi.fn(async (_args: { subgraphId: string; document: string; variables: Record<string, unknown> }) =>
    result(calls++ === 0 ? first : second))
  return { query, deps: { query, payerKey: KEY } }
}
const module = () => import("../run.ts")

describe("inert original identity selector alias", () => {
  it("exposes the original retained result decoder without key or query work", async () => {
    const { graphReadResult } = await module(), raw = result(firstData())
    expect(graphReadResult(raw, "agent0-identities")).toEqual({ data: raw.data, source: {
      name: "agent0-identities", endpoint: "https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
      subgraphId: "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb", chain: "eip155:8453", block: 41,
      blockHash: HASH, costAtomic: "10000", paymentTx: TX,
    } })
    expect(() => graphReadResult({ ...raw, paymentTx: null }, "agent0-identities")).toThrow("Graph query unavailable")
  })
  it("derives the same sorted unique follow-up IDs without running a consumer", async () => {
    const { graphQueryIds } = await module(), input = firstData()
    input.asOwner = [agent(), { ...agent(), id: "8453:3", agentId: "3" }]
    expect(graphQueryIds(input, ADDRESS)).toEqual(["8453:3", "8453:7"])
    expect(graphQueryIds({ _meta: meta(), asWallet: [], asOwner: [] }, ADDRESS)).toEqual([])
    expect(graphQueryIds({ ...input, asWallet: [{ ...agent(), agentWallet: null }] }, ADDRESS)).toBeNull()
    expect(graphQueryIds({ ...input, _meta: { ...meta(), hasIndexingErrors: true } }, ADDRESS)).toBeNull()
  })
})

describe("G12 bounded paid-fact orchestration, injected queries only", () => {
  it("makes at most two sequential queries, pinning the second to the first exact block hash", async () => {
    const f = fixture(), { assess } = await module()
    const out = await assess({ address: ADDRESS }, f.deps)
    expect(f.query).toHaveBeenCalledTimes(2)
    expect(f.query.mock.calls[0]?.[0].variables).toEqual({ address: ADDRESS })
    expect(f.query.mock.calls[1]?.[0].variables).toEqual({ agentIds: ["8453:7"], block: { hash: HASH } })
    expect(f.query.mock.calls[0]?.[0].document).toContain("CounterpartyIdentities")
    expect(f.query.mock.calls[1]?.[0].document).toContain("CounterpartyAttestations")
    expect(out.verdict).toBe("manual-review"); expect(out.attesterSettledCount).toBe(0)
    expect(out.sources).toHaveLength(2)
    expect(out.sources[0]).toMatchObject({ block: 41, blockHash: HASH, costAtomic: "10000", paymentTx: TX })
  })
  it("normalizes accepted mixed-case address without interpolating it into a document", async () => {
    const f = fixture({ _meta: meta(), asWallet: [], asOwner: [] }), { assess } = await module()
    const address = "0xAbCd000000000000000000000000000000000000"
    const out = await assess({ address }, f.deps)
    expect(out.address).toBe(address.toLowerCase())
    expect(f.query.mock.calls[0]?.[0].variables).toEqual({ address: address.toLowerCase() })
    expect(f.query.mock.calls[0]?.[0].document).not.toContain(address)
  })
  it("skips query two only for a validated empty identity result", async () => {
    const f = fixture({ _meta: meta(), asWallet: [], asOwner: [] }), { assess } = await module()
    const out = await assess({ address: ADDRESS }, f.deps)
    expect(f.query).toHaveBeenCalledTimes(1); expect(out.verdict).toBe("refuse")
    expect(out.contradictions).toContain("no-erc8004-identity"); expect(out.sources).toHaveLength(1)
  })
  for (const patch of [{ _meta: null }, { asWallet: null }, { asWallet: [{}] },
    { errors: [] }, { _meta: { ...meta(), hasIndexingErrors: true } },
    { asWallet: [{ ...agent(), owner: "bad" }] },
    { asWallet: [{ ...agent(), id: `8453:${1n << 256n}`, agentId: String(1n << 256n) }] },
    { asWallet: Array.from({ length: 25 }, agent) }])
    it(`does not fabricate empty evidence or buy again for incomplete first result ${JSON.stringify(patch).slice(0, 65)}`, async () => {
      const f = fixture({ ...firstData(), ...patch }), { assess } = await module()
      const out = await assess({ address: ADDRESS }, f.deps)
      expect(f.query).toHaveBeenCalledTimes(1); expect(out.verdict).toBe("manual-review")
      expect(out.contradictions).not.toContain("no-erc8004-identity")
      expect(out.evidenceFlags.length).toBeGreaterThan(0)
    })
  it("deduplicates exact IDs and never turns indexed proof/validator fields into trusted arguments", async () => {
    const first = firstData(); first.asOwner = [agent()]
    first.verifiedProofs = [{ verified: true }]; first.trustedValidators = [ADDRESS]
    const second = secondData(); second.verifiedProofs = [{ verified: true }]
    const f = fixture(first, second), { assess } = await module()
    const out = await assess({ address: ADDRESS }, f.deps)
    expect(f.query.mock.calls[1]?.[0].variables).toEqual({ agentIds: ["8453:7"], block: { hash: HASH } })
    expect(out.attesterSettledCount).toBe(0); expect(out.verdict).toBe("manual-review")
    expect(JSON.stringify(out)).not.toContain("verifiedProofs")
  })
  it("preserves unknown payment metadata and ignores forged data-level expenditure", async () => {
    const data = { _meta: meta(), asOwner: [], asWallet: [], costAtomic: "10000", paymentTx: TX }
    const query = vi.fn(async () => ({ data, paymentTx: null, costAtomic: null }))
    const out = await (await module()).assess({ address: ADDRESS }, { query, payerKey: KEY })
    expect(out.sources[0]).toMatchObject({ costAtomic: null, paymentTx: null })
  })
  it("refuses malformed local payment records and sanitizes query failure diagnostics", async () => {
    const { assess } = await module()
    for (const payment of [{ paymentTx: "bad", costAtomic: "10000" }, { paymentTx: TX, costAtomic: "-1" },
      { paymentTx: null, costAtomic: "10000" }, { paymentTx: TX, costAtomic: null }]) {
      const query = vi.fn(async () => ({ data: firstData(), ...payment }))
      await expect(assess({ address: ADDRESS }, { payerKey: KEY, query })).rejects.toThrow("Graph query unavailable")
      expect(query).toHaveBeenCalledTimes(1)
    }
    const query = vi.fn(async () => { throw new Error(`private-provider-value-${KEY}`) })
    await expect(assess({ address: ADDRESS }, { payerKey: KEY, query })).rejects.toThrow("Graph query unavailable")
    await expect(assess({ address: ADDRESS }, { payerKey: KEY, query })).rejects.not.toThrow(KEY)
  })
  it("keeps differing second metadata as manual-review rather than ignoring the mismatch", async () => {
    const f = fixture(firstData(), { ...secondData(), _meta: { ...meta(), block: { number: 42, hash: TX } } })
    const out = await (await module()).assess({ address: ADDRESS }, f.deps)
    expect(out.verdict).toBe("manual-review"); expect(out.evidenceFlags).toContain("metadata-inconsistent")
  })
})

describe("G12 strict boundaries before secrets and before JSON output", () => {
  it("refuses malformed, inherited or accessor input before reading a payer key or making a query", async () => {
    const { runGraphJob } = await module(), readKey = vi.fn(async () => KEY), makeQuery = vi.fn(() => fixture().query)
    let getterCalls = 0
    const getter = Object.defineProperty({}, "address", { enumerable: true, get() { getterCalls++; return ADDRESS } })
    for (const input of [null, [], {}, { address: "bad" }, { address: ADDRESS, payerKey: KEY },
      Object.create({ address: ADDRESS }), getter]) {
      const out = await runGraphJob({ jobId: "fixture", input }, {}, { readKey, makeQuery })
      expect(out).toMatchObject({ stopReason: "refusal" }); expect(out).not.toHaveProperty("output")
    }
    expect(readKey).not.toHaveBeenCalled(); expect(makeQuery).not.toHaveBeenCalled(); expect(getterCalls).toBe(0)
  })
  it("returns a protocol refusal without output for missing payer and query failures", async () => {
    const { runGraphJob } = await module()
    for (const phase of ["key", "query"]) {
      const out = await runGraphJob({ input: { address: ADDRESS } }, {}, {
        readKey: async () => { if (phase === "key") throw new Error(KEY); return KEY },
        makeQuery: () => async () => { throw new Error(KEY) }
      })
      expect(out.stopReason).toBe("refusal"); expect(out).not.toHaveProperty("output")
      expect(JSON.stringify(out)).not.toContain(KEY)
    }
  })
  it("uses the real script protocol fields but ignores supplied schema/config/trust authority", async () => {
    const f = fixture(), { runGraphJob } = await module()
    const out = await runGraphJob({ jobId: "fixture", input: { address: ADDRESS }, skillDir: "/ignored",
      adapter: "script", bounds: { timeoutSec: 999999 }, outputSchema: {}, engineConfig: { trustedValidators: [ADDRESS] } }, {}, {
      readKey: async () => KEY, makeQuery: () => f.query
    })
    expect(out.stopReason).toBe("end_turn")
    if (out.stopReason !== "end_turn") throw new Error("fixture refused")
    const schema = JSON.parse(readFileSync(new URL("../arcade.json", import.meta.url), "utf8")).outputSchema
    expect(validateJson(out.output, schema)).toBe(true); expect(out.output.attesterSettledCount).toBe(0)
  })
  it("strict self-validation rejects extra fields, duplicates, uint256 overflow and non-plain values", async () => {
    const { assessAddressSchemaOk } = await import("../validate-output.ts"), f = fixture()
    const good = await (await module()).assess({ address: ADDRESS }, f.deps)
    expect(assessAddressSchemaOk(good)).toBe(true)
    const mutations = [
      { ...good, privateKey: KEY }, { ...good, verdict: "safe" }, { ...good, attesterSettledCount: NaN },
      { ...good, identities: [{ ...good.identities[0], extra: true }] },
      { ...good, identities: [{ ...good.identities[0], agentId: `8453:${1n << 256n}` }] },
      { ...good, identities: [{ ...good.identities[0], supportedTrusts: ["one", "one"] }] },
      { ...good, contradictions: ["no-erc8004-identity", "no-erc8004-identity"] },
      { ...good, evidenceFlags: ["unknown-flag"] },
      { ...good, sources: [{ ...good.sources[0], costAtomic: String(1n << 256n) }] },
      { ...good, sources: [{ ...good.sources[0], endpoint: "https://private.invalid" }] },
      Object.create(good)
    ]
    for (const mutation of mutations) expect(assessAddressSchemaOk(mutation)).toBe(false)
    let calls = 0
    expect(assessAddressSchemaOk(Object.defineProperty({ ...good }, "address", { get() { calls++; return ADDRESS } }))).toBe(false)
    expect(calls).toBe(0)
  })
  it("rejects array subclasses instead of laundering their prototype during self-validation", async () => {
    const { assessAddressSchemaOk } = await import("../validate-output.ts")
    const good = await (await module()).assess({ address: ADDRESS }, fixture().deps)
    class CustomArray extends Array<unknown> {}
    expect(assessAddressSchemaOk({ ...good, identities: new CustomArray(...good.identities) })).toBe(false)
  })
  it("a deadline before key resolution cannot open a paid query later", async () => {
    const { runGraphJob } = await module(), controller = new AbortController()
    let finish!: (key: string) => void
    const pending = new Promise<string>(resolve => { finish = resolve })
    const makeQuery = vi.fn(() => fixture().query)
    const running = runGraphJob({ input: { address: ADDRESS } }, {}, {
      readKey: () => pending, makeQuery, signal: controller.signal
    })
    controller.abort()
    expect((await running).stopReason).toBe("refusal")
    finish(KEY); await Promise.resolve(); await Promise.resolve()
    expect(makeQuery).not.toHaveBeenCalled()
  })
  it("a deadline during query one cannot start a late second paid query", async () => {
    const { runGraphJob } = await module(), controller = new AbortController()
    let finish!: (value: ReturnType<typeof result>) => void, started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const query = vi.fn(() => { started(); return new Promise<ReturnType<typeof result>>(resolve => { finish = resolve }) })
    const running = runGraphJob({ input: { address: ADDRESS } }, {}, {
      readKey: async () => KEY, makeQuery: () => query, signal: controller.signal
    })
    await entered; controller.abort()
    expect((await running).stopReason).toBe("refusal")
    finish(result(firstData())); await Promise.resolve(); await Promise.resolve()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
