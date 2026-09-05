import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { validateJson } from "../../../apps/hub/src/validate.ts"
import { synthesize, CONTRADICTION_CODES, EVIDENCE_FLAGS, type Source, type VerifiedSettlementProof } from "../synthesize.ts"

const ADDRESS = `0x${"11".repeat(20)}`
const CLIENT = `0x${"22".repeat(20)}`
const VALIDATOR = `0x${"33".repeat(20)}`
const OTHER = `0x${"44".repeat(20)}`
const HASH = `0x${"aa".repeat(32)}`
const TX = `0x${"bb".repeat(32)}`
const FEEDBACK_HASH = `0x${"cc".repeat(32)}`
const REGISTRY = `eip155:8453:0x${"55".repeat(20)}`
const TOKEN = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const ID = "8453:7"
const FEEDBACK_ID = `${ID}:${CLIENT}:0`
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const meta = () => ({ block: { number: 41, hash: HASH }, hasIndexingErrors: false })
const source = (name: string): Source => ({ name, endpoint: `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`,
  subgraphId: SUBGRAPH, block: 41, blockHash: HASH, chain: "eip155:8453", costAtomic: null, paymentTx: null })
const validation = (over: Record<string, unknown> = {}) => ({
  id: `0x${"66".repeat(32)}`, agent: { id: ID }, validatorAddress: VALIDATOR, status: "COMPLETED", response: 100, ...over
})
const agent = (over: Record<string, unknown> = {}) => ({
  id: ID, chainId: "8453", agentId: "7", owner: ADDRESS, agentWallet: ADDRESS,
  totalFeedback: "1", lastActivity: "1",
  registrationFile: { name: "Fixture agent", active: true, x402Support: true, supportedTrusts: [], ens: null },
  validations: [validation()], ...over
})
const feedback = (over: Record<string, unknown> = {}) => ({
  id: FEEDBACK_ID, feedbackIndex: "0", clientAddress: CLIENT, feedbackHash: FEEDBACK_HASH,
  isRevoked: false, value: "100", createdAt: "1", agent: { id: ID, owner: ADDRESS, agentWallet: ADDRESS },
  feedbackFile: { feedbackId: FEEDBACK_ID, agentId: "7", clientAddress: CLIENT, agentRegistry: REGISTRY,
    proofOfPaymentFromAddress: CLIENT, proofOfPaymentToAddress: ADDRESS, proofOfPaymentChainId: "eip155:8453", proofOfPaymentTxHash: TX },
  ...over
})
const proof = (over: Partial<VerifiedSettlementProof> = {}): VerifiedSettlementProof => ({
  feedbackId: FEEDBACK_ID, agentId: ID, chain: "eip155:8453", transactionHash: TX, logIndex: 2,
  payer: CLIENT, payee: ADDRESS, token: TOKEN, amountAtomic: "10000", blockNumber: 40, blockHash: `0x${"dd".repeat(32)}`,
  serviceBinding: { kind: "agent-service-settlement", feedbackHash: FEEDBACK_HASH, agentRegistry: REGISTRY }, ...over
})
const input = () => ({ address: ADDRESS, identities: { _meta: meta(), asWallet: [agent()], asOwner: [] },
  attestations: { _meta: meta(), feedbacks: [feedback()] },
  sources: [source("agent0-identities"), source("agent0-attestations")], trustedValidators: [VALIDATOR] })
const eligible = () => ({ ...input(), verifiedProofs: [proof()] })

describe("synthesize evidence-policy assessment (all verification fixtures are simulated)", () => {
  it("never turns an off-chain full hash into settlement or allow", () => {
    const out = synthesize(input())
    expect(out.verdict).toBe("manual-review")
    expect(out.attesterSettledCount).toBe(0)
    expect(out.evidenceFlags).toContain("payment-proof-unverified")
    expect(out.sources.every((s) => s.costAtomic === null && s.paymentTx === null)).toBe(true)
  })

  it("allows only the complete policy fixture with separate trusted proof and validator inputs", () => {
    const args = eligible()
    const before = JSON.stringify(args)
    const out = synthesize(args)
    expect(out.verdict).toBe("allow")
    expect(out.identities).toEqual([{ agentId: ID, chainId: 8453, owner: ADDRESS, agentWallet: ADDRESS,
      name: "Fixture agent", active: true, x402Support: true, ens: null, supportedTrusts: [], validationsPassed: 1, validationsFailed: 0 }])
    expect(out.attesterSettledCount).toBe(1)
    expect(out.contradictions).toEqual([])
    expect(out.evidenceFlags).toEqual([])
    expect(JSON.stringify(args)).toBe(before)
    expect(JSON.stringify(out)).not.toContain("agent-service-settlement")
  })

  it("distinguishes a verified empty lookup from malformed and incomplete responses", () => {
    const empty = { address: ADDRESS, identities: { _meta: meta(), asWallet: [], asOwner: [] }, attestations: {}, sources: [source("agent0-identities")] }
    expect(synthesize(empty)).toMatchObject({ verdict: "refuse", contradictions: ["no-erc8004-identity"], attesterSettledCount: 0 })
    for (const identities of [null, {}, { _meta: meta(), asWallet: null, asOwner: [] }, { asWallet: [], asOwner: [] }]) {
      const out = synthesize({ ...empty, identities })
      expect(out.verdict).toBe("manual-review")
      expect(out.contradictions).not.toContain("no-erc8004-identity")
    }
  })

  it.each([
    null, { block: { number: 41 }, hasIndexingErrors: false },
    { block: { number: -1, hash: HASH }, hasIndexingErrors: false },
    { block: { number: 41, hash: HASH }, hasIndexingErrors: true },
    { block: { number: 41, hash: HASH } }
  ])("does not allow unknown or invalid metadata (%j)", (_meta) => {
    expect(synthesize({ ...eligible(), identities: { ...input().identities, _meta } }).verdict).toBe("manual-review")
  })

  it("requires equal block numbers and hashes across sources and both documents", () => {
    for (const _meta of [{ ...meta(), block: { number: 42, hash: HASH } }, { ...meta(), block: { number: 41, hash: TX } }]) {
      const out = synthesize({ ...eligible(), attestations: { ...input().attestations, _meta } })
      expect(out.verdict).toBe("manual-review")
      expect(out.evidenceFlags).toContain("metadata-inconsistent")
    }
    const args = eligible()
    expect(synthesize({ ...args, sources: [args.sources[0]!, { ...args.sources[1]!, blockHash: TX }] }).verdict).toBe("manual-review")
  })

  it.each([
    { id: "8453:07" }, { id: "1:7", chainId: "1" }, { agentId: "8" },
    { id: `8453:${2n ** 256n}`, agentId: String(2n ** 256n) },
    { owner: "not-an-address" }, { owner: OTHER, agentWallet: OTHER }
  ])("rejects noncanonical or unrelated identities (%j)", (over) => {
    const out = synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: [agent(over)], asOwner: [] } })
    expect(out.verdict).toBe("manual-review")
    expect(out.identities).toEqual([])
    expect(out.contradictions).not.toContain("no-erc8004-identity")
    expect(out.attesterSettledCount).toBe(0)
  })

  it("deduplicates identical alias matches but drops conflicting same-ID rows", () => {
    const args = eligible()
    expect(synthesize({ ...args, identities: { ...args.identities, asOwner: [agent()] } }).identities).toHaveLength(1)
    const out = synthesize({ ...args, identities: { ...args.identities, asOwner: [agent({ agentWallet: OTHER })] } })
    expect(out.identities).toEqual([])
    expect(out.evidenceFlags).toContain("identity-conflict")
    expect(out.verdict).toBe("manual-review")
  })

  it("flags a possible truncated page rather than calling capped evidence complete", () => {
    const args = eligible()
    for (const override of [
      { identities: { ...args.identities, asWallet: Array.from({ length: 25 }, () => agent()) } },
      { identities: { ...args.identities, asWallet: [agent({ validations: Array.from({ length: 25 }, () => validation()) })] } },
      { attestations: { ...args.attestations, feedbacks: Array.from({ length: 100 }, () => feedback()) } }
    ]) {
      const out = synthesize({ ...args, ...override })
      expect(out.verdict).toBe("manual-review")
      expect(out.evidenceFlags).toContain("evidence-incomplete")
    }
  })

  it("does not derive absent registration, validation or validator trust as a pass", () => {
    for (const over of [{ registrationFile: null }, { validations: [] }, { validations: [validation({ response: null })] },
      { validations: [validation({ status: "PENDING", response: 0 })] }, { validations: [validation({ response: 101 })] },
      { validations: [validation({ agent: { id: "8453:8" } })] }]) {
      expect(synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: [agent(over)], asOwner: [] } }).verdict).toBe("manual-review")
    }
    const out = synthesize({ ...eligible(), trustedValidators: [] })
    expect(out.verdict).toBe("manual-review")
    expect(out.evidenceFlags).toContain("validation-untrusted")
  })

  it("treats a completed zero score from a trusted validator as policy refusal, not pending", () => {
    const out = synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: [agent({ validations: [validation({ response: 0 })] })], asOwner: [] } })
    expect(out.verdict).toBe("refuse")
    expect(out.identities[0]?.validationsFailed).toBe(1)
    expect(out.contradictions).toContain("validation-failed")
  })

  it("does not count duplicate validation requests twice", () => {
    const out = synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: [agent({ validations: [validation(), validation()] })], asOwner: [] } })
    expect(out.identities[0]?.validationsPassed).toBe(1)
  })

  it("does not count self attestations, revoked feedback or unrelated feedback", () => {
    for (const f of [feedback({ isRevoked: true }), feedback({ clientAddress: ADDRESS }), feedback({ agent: { id: "8453:8", owner: ADDRESS, agentWallet: ADDRESS } })]) {
      const out = synthesize({ ...eligible(), attestations: { _meta: meta(), feedbacks: [f] } })
      expect(out.attesterSettledCount).toBe(0)
      expect(out.verdict).not.toBe("allow")
    }
  })

  it("deduplicates feedback, proofs and external payers even across distinct feedback IDs", () => {
    const otherId = `${ID}:${CLIENT}:1`
    const second = feedback({ id: otherId, feedbackIndex: "1", feedbackFile: { ...feedback().feedbackFile, feedbackId: otherId } })
    const out = synthesize({ ...eligible(), attestations: { _meta: meta(), feedbacks: [feedback(), feedback(), second] },
      verifiedProofs: [proof(), proof(), proof({ feedbackId: otherId })] })
    expect(out.attesterSettledCount).toBe(1)
  })

  it.each([
    { feedbackId: `${ID}:${CLIENT}:9` }, { agentId: "8453:8" }, { chain: "eip155:1" },
    { transactionHash: `0x${"01".repeat(32)}` }, { logIndex: -1 }, { logIndex: 1.5 },
    { payer: OTHER }, { payee: OTHER }, { token: OTHER }, { amountAtomic: "0" }, { amountAtomic: "01" },
    { amountAtomic: String(2n ** 256n) }, { blockNumber: 42 }, { blockHash: "0xdead" },
    { serviceBinding: { kind: "erc20-transfer", feedbackHash: FEEDBACK_HASH, agentRegistry: REGISTRY } },
    { serviceBinding: { kind: "agent-service-settlement", feedbackHash: TX, agentRegistry: REGISTRY } }
  ])("refuses to qualify an incorrectly bound verified-proof fixture (%j)", (over) => {
    const out = synthesize({ ...eligible(), verifiedProofs: [{ ...proof(), ...over }] as ReadonlyArray<VerifiedSettlementProof> })
    expect(out.attesterSettledCount).toBe(0)
    expect(out.verdict).toBe("manual-review")
    expect(out.evidenceFlags).toContain("payment-proof-invalid")
  })

  it("cannot qualify proof with missing or contradictory off-chain payer binding", () => {
    for (const from of [null, OTHER]) {
      const f = feedback({ feedbackFile: { ...feedback().feedbackFile, proofOfPaymentFromAddress: from } })
      expect(synthesize({ ...eligible(), attestations: { _meta: meta(), feedbacks: [f] } }).attesterSettledCount).toBe(0)
    }
  })

  it("does not accept same-event reuse or conflicting feedback records as extra evidence", () => {
    const otherId = `${ID}:${CLIENT}:1`
    const f = feedback({ id: otherId, feedbackIndex: "1", feedbackHash: TX, feedbackFile: { ...feedback().feedbackFile, feedbackId: otherId } })
    const p = proof({ feedbackId: otherId, serviceBinding: { ...proof().serviceBinding, feedbackHash: TX } })
    const out = synthesize({ ...eligible(), attestations: { _meta: meta(), feedbacks: [feedback(), f] }, verifiedProofs: [proof(), p] })
    expect(out.verdict).toBe("manual-review")
    expect(out.evidenceFlags).toContain("payment-proof-invalid")
    const conflicting = synthesize({ ...eligible(), attestations: { _meta: meta(), feedbacks: [feedback(), feedback({ isRevoked: true })] } })
    expect(conflicting.attesterSettledCount).toBe(0)
    expect(conflicting.verdict).toBe("manual-review")
  })

  it("sanitizes malformed source fields rather than echoing private URLs or inventing cost", () => {
    const out = synthesize({ ...eligible(), sources: [{ ...source("agent0-identities"), endpoint: "https://user:private-sentinel@example.invalid/?secret=value" }] })
    expect(out.verdict).toBe("manual-review")
    expect(out.evidenceFlags).toContain("source-invalid")
    expect(JSON.stringify(out)).not.toContain("private-sentinel")
    expect(synthesize({ ...eligible(), sources: [source("agent0-identities"), { ...source("agent0-attestations"), costAtomic: "-1" }] }).verdict).toBe("manual-review")
  })

  it("uses only bounded own data without invoking getters, toJSON or inherited evidence", () => {
    let calls = 0
    const hostile = Object.create({ asOwner: [] })
    Object.defineProperty(hostile, "asWallet", { get() { calls++; throw new Error("private-sentinel") } })
    hostile.toJSON = () => { calls++; throw new Error("private-sentinel") }
    const out = synthesize({ ...eligible(), identities: hostile })
    expect(out.verdict).toBe("manual-review")
    expect(calls).toBe(0)
    expect(JSON.stringify(out)).not.toContain("private-sentinel")
    const enormous = new Array(1_000_000)
    Object.defineProperty(enormous, "0", { get() { calls++; throw new Error("private-sentinel") } })
    expect(synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: enormous, asOwner: [] } }).verdict).toBe("manual-review")
    expect(calls).toBe(0)
  })

  it("returns stable, unique allowlisted flags and no extra evidence documents", () => {
    const out = synthesize({ ...input(), identities: {} })
    expect(out.evidenceFlags.every((f) => EVIDENCE_FLAGS.includes(f))).toBe(true)
    expect(new Set(out.evidenceFlags).size).toBe(out.evidenceFlags.length)
    expect(out.contradictions.every((c) => CONTRADICTION_CODES.includes(c))).toBe(true)
    expect(out).not.toHaveProperty("verifiedProofs")
  })

  it("emits the current manifest shape, including unique registration trust labels", () => {
    const schema: unknown = JSON.parse(readFileSync(new URL("../arcade.json", import.meta.url), "utf8")).outputSchema
    const repeated = agent({ registrationFile: { ...agent().registrationFile, supportedTrusts: ["reputation", "reputation"] } })
    const outputs = [synthesize(eligible()), synthesize(input()), synthesize({ ...eligible(), identities: null }),
      synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: [repeated], asOwner: [] } })]
    for (const out of outputs) {
      expect(validateJson(out, schema)).toBe(true)
      for (const identity of out.identities) expect(new Set(identity.supportedTrusts).size).toBe(identity.supportedTrusts.length)
    }
  })

  it("refuses same-height settlement proof on a different block hash", () => {
    const out = synthesize({ ...eligible(), verifiedProofs: [proof({ blockNumber: 41, blockHash: TX })] })
    expect(out.attesterSettledCount).toBe(0)
    expect(out.verdict).toBe("manual-review")
    expect(out.evidenceFlags).toContain("payment-proof-invalid")
  })

  it("does not turn partial GraphQL errors into complete evidence or expose their contents", () => {
    const out = synthesize({ ...eligible(), identities: { ...input().identities, errors: [{ message: "private-sentinel" }] } })
    expect(out.verdict).toBe("manual-review")
    expect(JSON.stringify(out)).not.toContain("private-sentinel")
  })

  it("handles revoked proxy inputs without executing accessors or throwing provider errors", () => {
    const revoked = Proxy.revocable([], {})
    revoked.revoke()
    expect(synthesize({ ...eligible(), identities: { _meta: meta(), asWallet: revoked.proxy, asOwner: [] } }).verdict).toBe("manual-review")
  })

  it("does not emit a settled count when query provenance is missing or inconsistent", () => {
    for (const _meta of [null, { ...meta(), block: { number: 42, hash: HASH } }]) {
      const out = synthesize({ ...eligible(), identities: { ...input().identities, _meta } })
      expect(out.attesterSettledCount).toBe(0)
      expect(out.verdict).toBe("manual-review")
    }
  })
})
