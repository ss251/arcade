import { formatPrice, NON_SETTLING, type Receipt } from "@arcade/core"
import { hasSessionMarker, receiptChildExplorer, receiptExplorer } from "./receipt-reference.ts"

const publicKind = (value: unknown): "onchain" | "gateway-transfer" | "test" | "unrecognized" =>
  value === "onchain" || value === "gateway-transfer" || value === "test" ? value : "unrecognized"

export interface PublicReceiptChild {
  readonly skillId: string
  readonly priceAtomic: string
  readonly price: string
  readonly settled: boolean
  readonly settleTx?: string
  readonly explorer: string | null
}

export interface PublicReceiptRow {
  readonly skillId: string
  readonly priceAtomic: string
  readonly sellerAtomic: string
  readonly feeAtomic: string
  readonly feeBps: number
  readonly price: string
  readonly sellerShare: string
  readonly fee: string
  readonly settled: boolean
  readonly reason: string
  readonly latencyMs: number
  readonly createdAtMs: number
  readonly settleTx?: string
  readonly explorer: string | null
  readonly hop: number
  readonly treeHash?: string
  /** Flat descendants recorded by the root ledger, NOT reconstructed direct edges. */
  readonly children: ReadonlyArray<PublicReceiptChild>
  // Explicit, safe compatibility fields from the existing /receipts API.
  readonly skillVersion: string
  readonly seller: string
  readonly rail: Receipt["rail"]
  readonly network: string
  readonly sellerCostUsd?: number
  readonly feeSweepTx?: string
  readonly treeCeilingAtomic?: string
  readonly treeCommittedAtomic?: string
  readonly canary?: boolean
  readonly session: boolean
  readonly settleRefKind?: "onchain" | "gateway-transfer" | "test" | "unrecognized"
}

const hash = (value: string | undefined): value is string =>
  value !== undefined && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value)
const reference = (rail: Receipt["rail"], value: string | undefined): value is string => hash(value) ||
  value !== undefined && (rail === "gateway" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value) ||
    rail === "test" && /^0xtest[0-9a-fA-F]{14,26}$/.test(value))

const reasons = new Set([
  "ok", "refused", "output is empty", "output failed the listing's outputSchema",
  "job status is queued", "job status is running", "job status is succeeded",
  ...Array.from(NON_SETTLING, status => `job status is ${status}`),
  "engine refused (stop_reason=refusal)", "engine refused (stop_reason=content_filter)",
  "engine refused (stop_reason=reasoning_extraction)",
  "settlement failed (SettlementFailed)", "settlement failed (RpcFailure)"
])

/**
 * The one public receipt whitelist. Never spread a private receipt: its job/session
 * capabilities, buyer, nonce, signature, ancestry and provider errors stay private,
 * including fields future versions add. Import-safe: this module never boots a hub.
 */
export const scrubReceipt = (r: Receipt): PublicReceiptRow => ({
  skillId: r.skillId,
  skillVersion: r.skillVersion,
  seller: r.seller,
  rail: r.rail,
  network: r.network,
  priceAtomic: r.priceAtomic.toString(),
  sellerAtomic: r.sellerAtomic.toString(),
  feeAtomic: r.feeAtomic.toString(),
  feeBps: r.feeBps,
  price: formatPrice(r.priceAtomic),
  sellerShare: formatPrice(r.sellerAtomic),
  fee: formatPrice(r.feeAtomic),
  settled: r.settled,
  reason: reasons.has(r.reason) ? r.reason : r.settled ? "settled" : "not settled",
  latencyMs: r.latencyMs,
  createdAtMs: r.createdAtMs,
  ...(r.settled && reference(r.rail, r.settleTx) ? { settleTx: r.settleTx } : {}),
  explorer: receiptExplorer(r),
  session: hasSessionMarker(r),
  ...(Object.hasOwn(r, "settleRefKind") ? { settleRefKind: publicKind(r.settleRefKind) } : {}),
  hop: r.hop ?? 0,
  ...(hash(r.treeHash) ? { treeHash: r.treeHash } : {}),
  ...(hash(r.feeSweepTx) ? { feeSweepTx: r.feeSweepTx } : {}),
  ...(r.sellerCostUsd !== undefined && Number.isFinite(r.sellerCostUsd) && r.sellerCostUsd >= 0
    ? { sellerCostUsd: r.sellerCostUsd } : {}),
  ...(r.treeCeilingAtomic === undefined ? {} : { treeCeilingAtomic: r.treeCeilingAtomic.toString() }),
  ...(r.treeCommittedAtomic === undefined ? {} : { treeCommittedAtomic: r.treeCommittedAtomic.toString() }),
  ...(r.canary === undefined ? {} : { canary: r.canary }),
  children: (r.children ?? []).map(c => ({
    // The pipeline's unresolved-child fallback is literally the private job id.
    skillId: c.skillId === c.jobId ? "unknown-skill" : c.skillId,
    priceAtomic: c.priceAtomic.toString(),
    price: formatPrice(c.priceAtomic),
    settled: c.settled,
    ...(c.settled && reference(r.rail, c.settleTx) ? { settleTx: c.settleTx } : {}),
    explorer: receiptChildExplorer(r, c)
  }))
})

/** Existing import compatibility; never a second projection. */
export const publicReceipt = scrubReceipt
