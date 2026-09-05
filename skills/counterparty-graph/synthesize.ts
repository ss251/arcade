/**
 * Pure, bounded evidence-policy synthesis, not a financial-safety guarantee.
 * Graph rows are untrusted indexed claims. Only a separate local verifier may supply
 * verifiedProofs; this module checks their binding, not RPC receipts or signatures.
 * No production verifier is implemented here. Omitted proofs/trusted validators
 * cannot establish policy eligibility. sources likewise come from local G12 query
 * records: unknown observed cost/payment stays null, never a quoted-price constant.
 */
export interface Identity {
  readonly agentId: string
  readonly chainId: number
  readonly owner: string
  readonly agentWallet: string | null
  readonly name: string | null
  readonly active: boolean | null
  readonly x402Support: boolean | null
  readonly ens: string | null
  readonly supportedTrusts: ReadonlyArray<string>
  readonly validationsPassed: number
  readonly validationsFailed: number
}

export interface Source {
  readonly name: string
  readonly endpoint: string
  readonly subgraphId: string
  readonly block: number | null
  readonly blockHash: string | null
  readonly chain: string
  readonly costAtomic: string | null
  readonly paymentTx?: string | null
}

/** Local verifier output only. A query row's `verified: true` is never an input here. */
export interface VerifiedSettlementProof {
  readonly feedbackId: string
  readonly agentId: string
  readonly chain: string
  readonly transactionHash: string
  readonly logIndex: number
  readonly payer: string
  readonly payee: string
  readonly token: string
  readonly amountAtomic: string
  readonly blockNumber: number
  readonly blockHash: string
  readonly serviceBinding: {
    readonly kind: "agent-service-settlement"
    readonly feedbackHash: string
    readonly agentRegistry: string
  }
}

export const CONTRADICTION_CODES = [
  "no-erc8004-identity", "validation-failed", "registration-inactive", "x402-unsupported",
  "wallet-differs-from-owner", "feedback-revoked", "self-attested", "unattested-no-proof-of-payment"
] as const
export const EVIDENCE_FLAGS = [
  "malformed-evidence", "source-invalid", "metadata-missing", "metadata-inconsistent", "evidence-incomplete",
  "identity-conflict", "relationship-mismatch", "registration-missing", "validation-unknown",
  "validation-untrusted", "payment-proof-unverified", "payment-proof-invalid"
] as const
type Flag = typeof EVIDENCE_FLAGS[number]
type Contradiction = typeof CONTRADICTION_CODES[number]
export interface Assessment {
  readonly address: string
  readonly verdict: "allow" | "manual-review" | "refuse"
  readonly identities: ReadonlyArray<Identity>
  readonly attesterSettledCount: number
  readonly contradictions: ReadonlyArray<Contradiction>
  readonly sources: ReadonlyArray<Source>
  readonly evidenceFlags: ReadonlyArray<Flag>
}

const CHAIN = "eip155:8453"
const TOKEN = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const ENDPOINT = `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`
const MAX_UINT = (1n << 256n) - 1n
const INVALID = Symbol("invalid-own-data")
const integrityFlags: ReadonlyArray<Flag> = ["malformed-evidence", "source-invalid", "metadata-missing",
  "metadata-inconsistent", "evidence-incomplete", "identity-conflict", "relationship-mismatch"]

function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  try { if (Array.isArray(value)) return false; const p: unknown = Object.getPrototypeOf(value); return p === Object.prototype || p === null }
  catch { return false }
}
function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return INVALID
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor === undefined ? undefined : "value" in descriptor ? descriptor.value : INVALID
  } catch { return INVALID }
}
function string(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
}
function address(value: unknown): string | null {
  return typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value) ? value.toLowerCase() : null
}
function hash(value: unknown): string | null {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value) ? value.toLowerCase() : null
}
function uint(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) <= MAX_UINT
}
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 }
function agentId(value: unknown): value is string { return typeof value === "string" && value.startsWith("8453:") && uint(value.slice(5)) }
function feedbackId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) return false
  const parts = value.split(":")
  return parts.length === 4 && parts[0] === "8453" && uint(parts[1]) && address(parts[2]) === parts[2] && uint(parts[3])
}
function registry(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(`${CHAIN}:`)) return null
  const result = address(value.slice(CHAIN.length + 1))
  return result === null ? null : `${CHAIN}:${result}`
}
function list(value: unknown, max: number, flags: Set<Flag>, page = false): ReadonlyArray<unknown> | null {
  try { if (!Array.isArray(value)) { flags.add("malformed-evidence"); return null } }
  catch { flags.add("malformed-evidence"); return null }
  const length = own(value, "length")
  if (!integer(length)) { flags.add("malformed-evidence"); return null }
  if (length > max) { flags.add("evidence-incomplete"); return null }
  if (page && length === max) flags.add("evidence-incomplete")
  const result: Array<unknown> = []
  for (let i = 0; i < length; i++) {
    const item = own(value, String(i))
    if (item === undefined || item === INVALID) { flags.add("malformed-evidence"); return null }
    result.push(item)
  }
  return result
}

interface Meta { readonly number: number; readonly hash: string }
function metadata(root: unknown, flags: Set<Flag>): Meta | null {
  if (own(root, "errors") !== undefined) flags.add("evidence-incomplete")
  const meta = own(root, "_meta")
  const block = own(meta, "block")
  if (!object(meta) || !object(block)) { flags.add("metadata-missing"); return null }
  const number = own(block, "number"), digest = hash(own(block, "hash")), errors = own(meta, "hasIndexingErrors")
  if (!integer(number) || digest === null || typeof errors !== "boolean") { flags.add("metadata-missing"); return null }
  if (errors) flags.add("evidence-incomplete")
  return { number, hash: digest }
}
function sourcesOf(value: unknown, flags: Set<Flag>): ReadonlyArray<Source> {
  const result: Array<Source> = []
  const rows = list(value, 2, flags)
  if (rows === null) { flags.add("source-invalid"); return result }
  for (const row of rows) {
    const name = own(row, "name"), block = own(row, "block"), rawHash = own(row, "blockHash")
    const cost = own(row, "costAtomic"), tx = own(row, "paymentTx")
    if (!object(row) || !string(name, 64) || own(row, "endpoint") !== ENDPOINT || own(row, "subgraphId") !== SUBGRAPH ||
      own(row, "chain") !== CHAIN || !(block === null || integer(block)) || !(rawHash === null || hash(rawHash) !== null) ||
      !(cost === null || uint(cost)) || !(tx === undefined || tx === null || hash(tx) !== null)) {
      flags.add("source-invalid"); continue
    }
    result.push({ name, endpoint: ENDPOINT, subgraphId: SUBGRAPH, chain: CHAIN, block,
      blockHash: rawHash === null ? null : hash(rawHash), costAtomic: cost, paymentTx: tx == null ? null : hash(tx) })
  }
  return result
}

interface Validation { readonly id: string; readonly validator: string; readonly status: string; readonly response: number | null }
interface ParsedIdentity { readonly value: Identity; readonly validations: ReadonlyArray<Validation>; readonly fingerprint: string }
function identityOf(row: unknown, alias: "asWallet" | "asOwner", subject: string, flags: Set<Flag>): ParsedIdentity | null {
  const id = own(row, "id"), number = own(row, "agentId"), owner = address(own(row, "owner"))
  const rawWallet = own(row, "agentWallet"), wallet = address(rawWallet)
  if (!object(row) || !agentId(id) || !uint(number) || id !== `8453:${number}` || own(row, "chainId") !== "8453" ||
    owner === null || !(rawWallet === null || wallet !== null)) { flags.add("malformed-evidence"); return null }
  if ((alias === "asWallet" ? wallet : owner) !== subject) { flags.add("relationship-mismatch"); return null }
  const file = own(row, "registrationFile")
  let name: string | null = null, ens: string | null = null, active: boolean | null = null, x402Support: boolean | null = null
  const supportedTrusts: Array<string> = []
  if (!object(file)) flags.add("registration-missing")
  else {
    const n = own(file, "name"), e = own(file, "ens"), a = own(file, "active"), x = own(file, "x402Support")
    if (n === null || string(n, 256)) name = n; else flags.add("registration-missing")
    if (e === null || string(e, 253)) ens = e; else flags.add("registration-missing")
    if (typeof a === "boolean") active = a; else flags.add("registration-missing")
    if (typeof x === "boolean") x402Support = x; else flags.add("registration-missing")
    for (const trust of list(own(file, "supportedTrusts"), 16, flags) ?? []) {
      if (string(trust, 128)) { if (!supportedTrusts.includes(trust)) supportedTrusts.push(trust) }
      else flags.add("malformed-evidence")
    }
    supportedTrusts.sort()
  }
  const validations = new Map<string, Validation>(), conflicting = new Set<string>()
  for (const v of list(own(row, "validations"), 25, flags, true) ?? []) {
    const key = hash(own(v, "id")), validator = address(own(v, "validatorAddress")), status = own(v, "status"), response = own(v, "response")
    if (!object(v) || key === null || validator === null || own(own(v, "agent"), "id") !== id ||
      (status !== "COMPLETED" && status !== "PENDING" && status !== "EXPIRED") ||
      !(response === null || (integer(response) && response <= 100)) || (status === "COMPLETED" && response === null)) {
      flags.add("validation-unknown"); continue
    }
    const parsed = { id: key, validator, status, response }
    const previous = validations.get(key)
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(parsed)) { conflicting.add(key); flags.add("validation-unknown") }
    else validations.set(key, parsed)
  }
  for (const key of conflicting) validations.delete(key)
  const completed = [...validations.values()].filter((v) => v.status === "COMPLETED")
  if (completed.length === 0 || [...validations.values()].some((v) => v.status !== "COMPLETED")) flags.add("validation-unknown")
  const value: Identity = { agentId: id, chainId: 8453, owner, agentWallet: wallet, name, active, x402Support, ens,
    supportedTrusts, validationsPassed: completed.filter((v) => v.response !== null && v.response >= 50).length,
    validationsFailed: completed.filter((v) => v.response !== null && v.response < 50).length }
  const ordered = [...validations.values()].sort((a, b) => a.id.localeCompare(b.id))
  return { value, validations: ordered, fingerprint: JSON.stringify([value, ordered]) }
}

interface Feedback {
  readonly id: string; readonly agent: string; readonly client: string; readonly revoked: boolean
  readonly hash: string | null; readonly registry: string | null; readonly payer: string | null
  readonly payee: string | null; readonly chain: string | null; readonly tx: string | null
}
function feedbackOf(row: unknown, agents: ReadonlyMap<string, ParsedIdentity>, flags: Set<Flag>): Feedback | null {
  const id = own(row, "id"), index = own(row, "feedbackIndex"), client = address(own(row, "clientAddress"))
  const agent = own(own(row, "agent"), "id"), revoked = own(row, "isRevoked")
  if (!object(row) || !feedbackId(id) || !agentId(agent) || !uint(index) || client === null || id !== `${agent}:${client}:${index}` || typeof revoked !== "boolean") {
    flags.add("relationship-mismatch"); return null
  }
  const identity = agents.get(agent)?.value
  const relation = own(row, "agent"), rawWallet = own(relation, "agentWallet")
  if (identity === undefined || address(own(relation, "owner")) !== identity.owner ||
    !(rawWallet === null || address(rawWallet) !== null) || address(rawWallet) !== identity.agentWallet) {
    flags.add("relationship-mismatch"); return null
  }
  const file = own(row, "feedbackFile")
  const result: Feedback = { id, agent, client, revoked, hash: hash(own(row, "feedbackHash")),
    registry: null, payer: null, payee: null, chain: null, tx: null }
  if (file === null || file === undefined) return result
  if (!object(file) || own(file, "feedbackId") !== id || own(file, "agentId") !== agent.slice(5) || address(own(file, "clientAddress")) !== client) {
    flags.add("relationship-mismatch"); return null
  }
  const chain = own(file, "proofOfPaymentChainId")
  return { ...result, registry: registry(own(file, "agentRegistry")), payer: address(own(file, "proofOfPaymentFromAddress")),
    payee: address(own(file, "proofOfPaymentToAddress")), chain: chain === "8453" || chain === CHAIN ? CHAIN : null,
    tx: hash(own(file, "proofOfPaymentTxHash")) }
}
function proofOf(value: unknown, flags: Set<Flag>): VerifiedSettlementProof | null {
  const f = own(value, "feedbackId"), a = own(value, "agentId"), tx = hash(own(value, "transactionHash"))
  const payer = address(own(value, "payer")), payee = address(own(value, "payee")), token = address(own(value, "token"))
  const amount = own(value, "amountAtomic"), block = own(value, "blockNumber"), blockHash = hash(own(value, "blockHash")), index = own(value, "logIndex")
  const binding = own(value, "serviceBinding"), feedbackHash = hash(own(binding, "feedbackHash")), agentRegistry = registry(own(binding, "agentRegistry"))
  if (!object(value) || !feedbackId(f) || !agentId(a) || own(value, "chain") !== CHAIN || tx === null || !integer(index) ||
    payer === null || payee === null || token !== TOKEN || !uint(amount) || amount === "0" || !integer(block) || blockHash === null ||
    !object(binding) || own(binding, "kind") !== "agent-service-settlement" || feedbackHash === null || agentRegistry === null) {
    flags.add("payment-proof-invalid"); return null
  }
  return { feedbackId: f, agentId: a, chain: CHAIN, transactionHash: tx, logIndex: index, payer, payee,
    token, amountAtomic: amount, blockNumber: block, blockHash,
    serviceBinding: { kind: "agent-service-settlement", feedbackHash, agentRegistry } }
}

export function synthesize(args: {
  readonly address: string
  readonly identities: unknown
  readonly attestations: unknown
  readonly sources: ReadonlyArray<Source>
  readonly verifiedProofs?: ReadonlyArray<VerifiedSettlementProof>
  readonly trustedValidators?: ReadonlyArray<string>
}): Assessment {
  const subject = address(own(args, "address"))
  if (subject === null) throw new Error("counterparty address is invalid")
  const flags = new Set<Flag>(), contradictions = new Set<Contradiction>()
  const sources = sourcesOf(own(args, "sources"), flags)
  const idRoot = own(args, "identities"), attRoot = own(args, "attestations")
  const firstMeta = metadata(idRoot, flags)
  if (!object(idRoot)) flags.add("malformed-evidence")
  const agents = new Map<string, ParsedIdentity>(), conflicts = new Set<string>()
  let completeEmpty = true
  for (const alias of ["asWallet", "asOwner"] as const) {
    const rows = list(own(idRoot, alias), 25, flags, true)
    if (rows === null || rows.length > 0) completeEmpty = false
    for (const row of rows ?? []) {
      const parsed = identityOf(row, alias, subject, flags)
      if (parsed === null) continue
      const id = parsed.value.agentId, previous = agents.get(id)
      if (previous !== undefined && previous.fingerprint !== parsed.fingerprint) { conflicts.add(id); flags.add("identity-conflict") }
      else agents.set(id, parsed)
    }
  }
  for (const id of conflicts) agents.delete(id)
  const identities = [...agents.values()].map((i) => i.value).sort((a, b) => a.agentId.localeCompare(b.agentId))
  const secondMeta = completeEmpty ? null : metadata(attRoot, flags)
  const expectedSources = completeEmpty ? 1 : 2
  if (sources.length !== expectedSources || sources[0]?.name !== "agent0-identities" || (!completeEmpty && sources[1]?.name !== "agent0-attestations")) flags.add("source-invalid")
  for (const [index, meta] of [firstMeta, secondMeta].entries()) {
    if (meta !== null && (sources[index]?.block !== meta.number || sources[index]?.blockHash !== meta.hash)) flags.add("metadata-inconsistent")
  }
  if (firstMeta !== null && secondMeta !== null && (firstMeta.number !== secondMeta.number || firstMeta.hash !== secondMeta.hash)) flags.add("metadata-inconsistent")

  const selves = new Set([subject])
  for (const identity of identities) {
    selves.add(identity.owner)
    if (identity.agentWallet !== null) selves.add(identity.agentWallet)
    if (identity.active === false) contradictions.add("registration-inactive")
    if (identity.x402Support === false) contradictions.add("x402-unsupported")
    if (identity.agentWallet !== null && identity.agentWallet !== identity.owner) contradictions.add("wallet-differs-from-owner")
  }
  const trusted = new Set<string>()
  for (const v of list(own(args, "trustedValidators") ?? [], 32, flags) ?? []) {
    const validator = address(v)
    if (validator !== null && !selves.has(validator)) trusted.add(validator); else flags.add("validation-untrusted")
  }
  let trustedFailures = 0
  for (const identity of agents.values()) {
    let trustedPasses = 0
    for (const validation of identity.validations) {
      if (validation.status !== "COMPLETED" || validation.response === null) continue
      if (!trusted.has(validation.validator)) { flags.add("validation-untrusted"); continue }
      if (validation.response < 50) { trustedFailures++; contradictions.add("validation-failed") }
      else trustedPasses++
    }
    if (trustedPasses === 0 && identity.value.validationsFailed === 0) flags.add("validation-unknown")
  }

  const feedbacks = new Map<string, Feedback>(), conflictingFeedback = new Set<string>()
  if (!completeEmpty) {
    for (const row of list(own(attRoot, "feedbacks"), 100, flags, true) ?? []) {
      const parsed = feedbackOf(row, agents, flags)
      if (parsed === null) continue
      const previous = feedbacks.get(parsed.id)
      if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(parsed)) { conflictingFeedback.add(parsed.id); flags.add("payment-proof-invalid") }
      else feedbacks.set(parsed.id, parsed)
    }
  }
  for (const id of conflictingFeedback) feedbacks.delete(id)
  const proofs = new Map<string, VerifiedSettlementProof>(), conflictingProofs = new Set<string>()
  const events = new Map<string, string>(), conflictingEvents = new Set<string>()
  for (const raw of list(own(args, "verifiedProofs") ?? [], 100, flags) ?? []) {
    const proof = proofOf(raw, flags)
    if (proof === null) continue
    const event = `${proof.chain}:${proof.transactionHash}:${proof.logIndex}`
    const binding = JSON.stringify([proof.agentId, proof.payer, proof.payee, proof.token, proof.amountAtomic,
      proof.blockNumber, proof.blockHash, proof.serviceBinding])
    const previousEvent = events.get(event)
    if (previousEvent !== undefined && previousEvent !== binding) { conflictingEvents.add(event); flags.add("payment-proof-invalid") }
    else events.set(event, binding)
    const previous = proofs.get(proof.feedbackId)
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(proof)) { conflictingProofs.add(proof.feedbackId); flags.add("payment-proof-invalid") }
    else proofs.set(proof.feedbackId, proof)
    if (!feedbacks.has(proof.feedbackId)) flags.add("payment-proof-invalid")
  }
  for (const id of conflictingProofs) proofs.delete(id)

  const clients = new Set<string>(), backedAgents = new Set<string>()
  for (const f of feedbacks.values()) {
    if (f.revoked) { contradictions.add("feedback-revoked"); continue }
    if (selves.has(f.client)) { contradictions.add("self-attested"); continue }
    const proof = proofs.get(f.id)
    if (proof === undefined) { flags.add("payment-proof-unverified"); continue }
    const identity = agents.get(f.agent)?.value
    if (identity === undefined || proof.agentId !== f.agent || proof.chain !== f.chain || proof.transactionHash !== f.tx ||
      proof.payer !== f.client || proof.payer !== f.payer || proof.payee !== f.payee || proof.payee !== (identity.agentWallet ?? identity.owner) ||
      proof.serviceBinding.feedbackHash !== f.hash || proof.serviceBinding.agentRegistry !== f.registry ||
      secondMeta === null || proof.blockNumber > secondMeta.number ||
      (proof.blockNumber === secondMeta.number && proof.blockHash !== secondMeta.hash) ||
      conflictingEvents.has(`${proof.chain}:${proof.transactionHash}:${proof.logIndex}`)) {
      flags.add("payment-proof-invalid"); continue
    }
    clients.add(f.client)
    backedAgents.add(f.agent)
  }
  if (identities.some((i) => !backedAgents.has(i.agentId))) flags.add("payment-proof-unverified")
  if (identities.length > 0 && (clients.size === 0 || flags.has("payment-proof-unverified") || flags.has("payment-proof-invalid"))) contradictions.add("unattested-no-proof-of-payment")
  const incomplete = integrityFlags.some((flag) => flags.has(flag))
  if (completeEmpty && !incomplete) contradictions.add("no-erc8004-identity")
  const verdict = incomplete ? "manual-review" : completeEmpty || trustedFailures > 0 ? "refuse" :
    flags.size > 0 || contradictions.size > 0 || identities.length === 0 || clients.size === 0 ? "manual-review" : "allow"
  return { address: subject, verdict, identities, attesterSettledCount: incomplete ? 0 : clients.size,
    contradictions: CONTRADICTION_CODES.filter((c) => contradictions.has(c)), sources,
    evidenceFlags: EVIDENCE_FLAGS.filter((f) => flags.has(f)) }
}
