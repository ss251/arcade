import { keccak256, toHex } from "viem"
import { ARC_CHAIN_ID } from "./chain.ts"

/**
 * Arc ERC-8004 ABI subset, checked 2026-09-05 against:
 * https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-8004.md
 * https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 * The ERC supplies the full signatures/events; Arc's deployed-contract tutorial confirms
 * the registry calls and addresses. One shared const ABI keeps seller and hub encodings
 * identical. getSummary is deliberately absent: trust reads must filter our own writers.
 */


export const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true }
    ]
  },
  {
    // The tutorial recovers the minted id from Transfer; the ERC also emits Registered.
    // Both are pinned so the runner can read whichever the deployed contract emits.
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true }
    ]
  }
] as const

export const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "readAllFeedback",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "includeRevoked", type: "bool" }
    ],
    outputs: [
      { name: "clients", type: "address[]" },
      { name: "feedbackIndexes", type: "uint64[]" },
      { name: "values", type: "int128[]" },
      { name: "valueDecimals", type: "uint8[]" },
      { name: "tag1s", type: "string[]" },
      { name: "tag2s", type: "string[]" },
      { name: "revokedStatuses", type: "bool[]" }
    ]
  },
  {
    type: "function",
    name: "getLastIndex",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" }
    ],
    outputs: [{ name: "", type: "uint64" }]
  },
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false }
    ]
  }
] as const

export const VALIDATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "validationRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestURI", type: "string" },
      { name: "requestHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "validationResponse",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requestHash", type: "bytes32" },
      { name: "response", type: "uint8" },
      { name: "responseURI", type: "string" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getValidationStatus",
    stateMutability: "view",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "response", type: "uint8" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" },
      { name: "lastUpdate", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "getAgentValidations",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32[]" }]
  },
  {
    type: "event",
    name: "ValidationRequest",
    inputs: [
      { name: "validatorAddress", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "requestURI", type: "string", indexed: false },
      { name: "requestHash", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "ValidationResponse",
    inputs: [
      { name: "validatorAddress", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "requestHash", type: "bytes32", indexed: true },
      { name: "response", type: "uint8", indexed: false },
      { name: "responseURI", type: "string", indexed: false },
      { name: "responseHash", type: "bytes32", indexed: false },
      { name: "tag", type: "string", indexed: false }
    ]
  }
] as const

/** Filter on every feedback this hub writes and reads; never use an aggregate. */
export const ARCADE_FEEDBACK_TAG1 = "arcade-settled" as const
export const ARCADE_VALIDATION_TAG = "arcade-settle" as const
export const ARCADE_SUPPORTED_TRUST = "arcade-validation" as const
export const DEFAULT_ERC8004_CHAIN_ID = ARC_CHAIN_ID

function invalid(): never { throw new Error("Invalid ERC-8004 document input") }
function originOf(value: string): string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value)) invalid()
  let url: URL
  try { url = new URL(value) } catch { return invalid() }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !/^\/*$/.test(url.pathname)) invalid()
  return url.origin
}
function pathId(value: string): string {
  if (typeof value !== "string" || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid()
  return encodeURIComponent(value)
}
function addressOf(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) invalid()
  return value
}
function chainOf(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) invalid()
  return value
}
function agentIdOf(value: string): string {
  if (typeof value !== "string" || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value) ||
      BigInt(value) >= 1n << 256n) invalid()
  return value
}
function hashOf(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) invalid()
  return value
}
function isoDate(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) invalid()
  return new Date(value).toISOString()
}
function textOf(value: string): string {
  if (typeof value !== "string" || value.length > 65_536) invalid()
  return value
}
function booleanOf(value: boolean): boolean {
  if (typeof value !== "boolean") invalid()
  return value
}

export const agentRegistrationUrl = (origin: string, skillId: string): string =>
  `${originOf(origin)}/listings/${pathId(skillId)}/agent-registration.json`
export const validationRequestUrl = (origin: string, jobId: string): string =>
  `${originOf(origin)}/receipts/${pathId(jobId)}/validation-request.json`
export const validationResponseUrl = (origin: string, jobId: string): string =>
  `${originOf(origin)}/receipts/${pathId(jobId)}/validation-response.json`
export const feedbackUrl = (origin: string, jobId: string): string =>
  `${originOf(origin)}/receipts/${pathId(jobId)}/feedback.json`

/** CAIP-10, retaining the caller's address case without a lossy chain/id conversion. */
export const caip10 = (chainId: number, address: string): string =>
  `eip155:${chainOf(chainId)}:${addressOf(address)}`

/**
 * Compact JSON bytes, matching JSON.stringify for plain JSON data in property order.
 * Never call user toJSON/getters, coerce invalid values to null, or drop invalid fields.
 * Non-enumerable data (notably registration.input) is deliberately not on the wire.
 * Depth, node and output bounds limit hostile JSON expansion; repeated references are
 * fine, but cyclic structures and exotic prototypes are not JSON.
 */
export function docBytes(doc: unknown): string {
  const active = new WeakSet<object>()
  const chunks: string[] = []
  let nodes = 0, chars = 0
  const emit = (part: string): void => {
    chars += part.length
    if (chars > 8_388_608) invalid()
    chunks.push(part)
  }
  const quoted = (value: string): void => {
    if (value.length > 8_388_608) invalid()
    emit(JSON.stringify(value))
  }
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 64) invalid()
    if (value === null) { emit("null"); return }
    if (typeof value === "string") { quoted(value); return }
    if (typeof value === "boolean") { emit(value ? "true" : "false"); return }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) invalid()
      emit(JSON.stringify(value)); return
    }
    if (typeof value !== "object" || active.has(value)) invalid()
    const array = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) invalid()
    const length = array ? Object.getOwnPropertyDescriptor(value, "length")?.value : 0
    if (array && (!Number.isSafeInteger(length) || length < 0 || length > 100_000)) invalid()
    const keys = Reflect.ownKeys(value)
    if (keys.length > 100_001 || keys.some(key => typeof key !== "string")) invalid()
    active.add(value)
    if (array) {
      if (keys.length !== length + 1) invalid()
      emit("[")
      for (let n = 0; n < length; n++) {
        const field = Object.getOwnPropertyDescriptor(value, String(n))
        if (!field || !("value" in field)) invalid()
        if (n > 0) emit(",")
        visit(field.value, depth + 1)
      }
      emit("]")
    } else {
      emit("{")
      let count = 0
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(value, key)
        if (!field || !("value" in field)) invalid()
        if (key === "toJSON" && typeof field.value === "function") invalid()
        if (!field.enumerable) continue
        if (count++ > 0) emit(",")
        quoted(String(key)); emit(":"); visit(field.value, depth + 1)
      }
      emit("}")
    }
    active.delete(value)
  }
  try {
    visit(doc, 0)
    return chunks.join("")
  } catch {
    // Reflection on a hostile proxy can throw arbitrary private text too.
    throw new Error("Cannot commit unsupported or oversized JSON")
  }
}
export const docHash = (doc: unknown): `0x${string}` => keccak256(toHex(docBytes(doc)))
/** An absent top-level job payload intentionally commits to JSON null, never missing bytes. */
export const hashJson = (value: unknown): `0x${string}` => docHash(value === undefined ? null : value)

export interface AgentRegistrationInput {
  readonly origin: string
  readonly skillId: string
  readonly serviceName: string
  readonly description: string
  readonly seller: string
  readonly chainId: number
  readonly identityRegistry: string
  readonly active: boolean
  readonly ens?: string | undefined
  /** Omit before mint; a decimal string preserves the full uint256 range. */
  readonly agentId?: string | undefined
}
export interface AgentEndpoint {
  readonly name: string
  readonly endpoint: string
  readonly version: string
}
export interface AgentRegistrationDoc {
  readonly type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
  readonly version: "1"
  readonly name: string
  readonly description: string
  readonly active: boolean
  readonly x402Support: true
  readonly agentRegistry: string
  readonly agentAddress: string
  readonly services: ReadonlyArray<AgentEndpoint>
  /** Compatibility alias for existing ARCADE consumers. */
  readonly endpoints: ReadonlyArray<AgentEndpoint>
  readonly supportedTrust: ReadonlyArray<string>
  /** Compatibility alias for existing ARCADE consumers. */
  readonly supportedTrusts: ReadonlyArray<string>
  readonly registrations: ReadonlyArray<{ readonly agentId: string; readonly agentRegistry: string }>
  readonly ens?: string
  /** Not serialized: builder arguments retained for explicit rebuilds. */
  readonly input: AgentRegistrationInput
}

/** Current ERC registration-v1 plus ARCADE's backwards-compatible extension fields. */
export const buildAgentRegistration = (input: AgentRegistrationInput): AgentRegistrationDoc => {
  const origin = originOf(input.origin), skill = pathId(input.skillId), seller = addressOf(input.seller)
  const agentRegistry = caip10(input.chainId, input.identityRegistry)
  // The buyer MCP server is local stdio; the hub has no HTTP /mcp endpoint.
  const services = [
    { name: "x402", endpoint: `${origin}/x/${seller}/${skill}`, version: "2" },
    { name: "openapi", endpoint: `${origin}/openapi.json`, version: "3.1.0" },
    { name: "web", endpoint: `${origin}/skill/${skill}`, version: "1" }
  ]
  const supportedTrust = [ARCADE_SUPPORTED_TRUST]
  const doc: AgentRegistrationDoc = {
    input,
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const,
    version: "1" as const,
    name: textOf(input.serviceName),
    description: textOf(input.description),
    active: booleanOf(input.active),
    x402Support: true as const,
    agentRegistry,
    agentAddress: caip10(input.chainId, seller),
    services,
    endpoints: services,
    supportedTrust,
    supportedTrusts: supportedTrust,
    registrations: input.agentId === undefined ? [] : [{ agentId: agentIdOf(input.agentId), agentRegistry }],
    ...(input.ens === undefined ? {} : { ens: textOf(input.ens) })
  }
  return Object.defineProperty(doc, "input", { value: input, enumerable: false })
}

export interface ValidationRequestInput {
  readonly origin: string
  readonly jobId: string
  readonly agentId: string
  readonly skillId: string
  readonly skillVersion: string
  readonly input: unknown
  readonly output: unknown
  readonly outputSchema: unknown
  readonly status: string
  readonly stopReason?: string | undefined
  readonly settled: boolean
  readonly reason: string
  readonly priceAtomic: bigint
  readonly settleTx?: string | undefined
  readonly createdAtMs: number
}
export interface ValidationRequestDoc {
  readonly type: "ArcadeValidationRequest"
  readonly version: "1"
  readonly jobId: string
  readonly agentId: string
  readonly skillId: string
  readonly skillVersion: string
  readonly inputHash: `0x${string}`
  readonly outputHash: `0x${string}`
  readonly outputSchemaHash: `0x${string}`
  readonly outcome: { readonly status: string; readonly stopReason: string | null; readonly settled: boolean; readonly reason: string }
  readonly priceAtomic: string
  readonly settleTx: string | null
  readonly receipt: string
  readonly createdAt: string
}
const statuses = new Set(["queued", "running", "succeeded", "refused", "invalid", "timeout",
  "bounds_exceeded", "rejected", "runner_lost", "failed"])
const publicStops = new Set(["end_turn", "refusal", "bounds_exceeded", "error", "incomplete",
  "timeout", "rejected", "max_tokens", "tool_use", "stop_sequence"])
const publicReason = (settled: boolean): string => settled ? "ok" : "not settled"

/**
 * Public chain commitments contain hashes, never raw input/output/schema or arbitrary
 * diagnostic strings. These reasons attest settlement only, not seller/provider claims.
 */
export const buildValidationRequest = (i: ValidationRequestInput): ValidationRequestDoc => {
  if (!statuses.has(i.status) || typeof i.priceAtomic !== "bigint" || i.priceAtomic < 0n) invalid()
  const jobId = pathId(i.jobId), settled = booleanOf(i.settled)
  return {
    type: "ArcadeValidationRequest",
    version: "1",
    jobId,
    agentId: agentIdOf(i.agentId),
    skillId: pathId(i.skillId),
    skillVersion: textOf(i.skillVersion),
    inputHash: hashJson(i.input),
    outputHash: hashJson(i.output),
    outputSchemaHash: hashJson(i.outputSchema),
    outcome: {
      status: i.status,
      stopReason: i.stopReason !== undefined && publicStops.has(i.stopReason) ? i.stopReason : null,
      settled,
      reason: publicReason(settled)
    },
    priceAtomic: i.priceAtomic.toString(),
    settleTx: i.settleTx === undefined ? null : hashOf(i.settleTx),
    receipt: `${originOf(i.origin)}/jobs/${jobId}/result`,
    createdAt: isoDate(i.createdAtMs)
  }
}
export interface ValidationResponseInput {
  readonly jobId: string
  readonly requestHash: string
  readonly settled: boolean
  readonly reason: string
  readonly decidedAtMs: number
}
export interface ValidationResponseDoc {
  readonly type: "ArcadeValidationResponse"
  readonly version: "1"
  readonly jobId: string
  readonly requestHash: string
  readonly response: number
  readonly tag: string
  readonly reason: string
  readonly decidedAt: string
}
/** Binary facts, not a made-up quality score. Untrusted reasons never enter this document. */
export const buildValidationResponse = (i: ValidationResponseInput): ValidationResponseDoc => ({
  type: "ArcadeValidationResponse",
  version: "1",
  jobId: pathId(i.jobId),
  requestHash: hashOf(i.requestHash),
  response: booleanOf(i.settled) ? 100 : 0,
  tag: ARCADE_VALIDATION_TAG,
  reason: publicReason(i.settled),
  decidedAt: isoDate(i.decidedAtMs)
})
export interface FeedbackInput {
  readonly origin: string
  readonly jobId: string
  readonly agentId: string
  readonly skillId: string
  readonly seller: string
  readonly buyer: string
  /** Actual settlement destination, including a splitter when present. */
  readonly payTo: string
  readonly settleTx: string
  readonly chainId: number
  readonly identityRegistry: string
  readonly attester: string
  readonly createdAtMs: number
}
export interface FeedbackDoc {
  readonly agentRegistry: string
  readonly agentId: string
  readonly clientAddress: string
  readonly createdAt: string
  readonly value: 1
  readonly valueDecimals: 0
  readonly tag1: string
  readonly tag2: string
  readonly endpoint: string
  readonly proofOfPayment: {
    readonly fromAddress: string
    readonly toAddress: string
    readonly chainId: string
    readonly txHash: string
  }
  readonly receipt: string
}
/** Payment proof uses the actual payer and payTo already disclosed by its transaction. */
export const buildFeedback = (i: FeedbackInput): FeedbackDoc => ({
  agentRegistry: caip10(i.chainId, i.identityRegistry),
  agentId: agentIdOf(i.agentId),
  clientAddress: caip10(i.chainId, i.attester),
  createdAt: isoDate(i.createdAtMs),
  value: 1,
  valueDecimals: 0,
  tag1: ARCADE_FEEDBACK_TAG1,
  tag2: pathId(i.skillId),
  endpoint: `${originOf(i.origin)}/x/${addressOf(i.seller)}/${pathId(i.skillId)}`,
  proofOfPayment: {
    fromAddress: addressOf(i.buyer),
    toAddress: addressOf(i.payTo),
    chainId: String(chainOf(i.chainId)),
    txHash: hashOf(i.settleTx)
  },
  receipt: `${originOf(i.origin)}/jobs/${pathId(i.jobId)}/result`
})
