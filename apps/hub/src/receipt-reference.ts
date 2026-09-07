import { loadChainConfig } from "../../../packages/core/src/chain-config.ts"
import { escrowReceiptView } from "./escrow-receipt-view.ts"

const ABSENT = Symbol("absent"), INVALID = Symbol("invalid")
/** Only recorded own data conveys authority; inherited/accessor values do not. */
const field = (record: unknown, key: string): unknown => {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return INVALID
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)
    if (descriptor === undefined) return key in record ? INVALID : ABSENT
    return descriptor.enumerable && "value" in descriptor ? descriptor.value : INVALID
  } catch { return INVALID }
}

// Explicit manifests only: importing this helper never selects from process.env.
const explorers = new Map<string, string>()
for (const id of ["arc-testnet", "arc-mainnet"] as const) {
  try {
    const config = loadChainConfig(id)
    if (config.status !== "ready" || !Number.isSafeInteger(config.chainId) || config.chainId <= 0 ||
      config.caip2 !== `eip155:${config.chainId}`) continue
    const url = new URL(config.explorerBaseUrl)
    if (url.protocol !== "https:" || url.origin !== config.explorerBaseUrl ||
      url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") continue
    explorers.set(config.caip2, url.origin)
  } catch { /* An unavailable manifest supplies no reference-link authority. */ }
}

const reference = (context: unknown, value: unknown): string | null => {
  const kind = field(context, "settleRefKind"), network = field(context, "network"), tx = field(value, "settleTx")
  if (field(context, "rail") !== "eip3009" || field(value, "settled") !== true ||
    kind !== ABSENT && kind !== "onchain" || typeof network !== "string" || typeof tx !== "string" ||
    tx.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(tx) || /^0x0{64}$/.test(tx)) return null
  const explorer = explorers.get(network)
  return explorer === undefined ? null : `${explorer}/tx/${tx}`
}

/** A recorded reference for inspection, not a fresh mining/status verification. */
export const receiptExplorer = (receipt: unknown): string | null => {
  const escrow = escrowReceiptView(receipt)
  if (escrow === undefined) return reference(receipt, receipt)
  const explorer = explorers.get("eip155:5042002")
  return escrow?.state === "settled" && explorer !== undefined ? `${explorer}/tx/${escrow.txHash}` : null
}

/** A recorded refund is distinct from a successful settlement/result release. */
export const receiptRefundExplorer = (receipt: unknown): string | null => {
  const escrow = escrowReceiptView(receipt), explorer = explorers.get("eip155:5042002")
  return escrow?.state === "refunded" && explorer !== undefined ? `${explorer}/tx/${escrow.txHash}` : null
}

/** Compact descendants lack provenance fields: use the original root context,
 * but the child's own settled/reference fields, independent of root success. */
export const receiptChildExplorer = (root: unknown, child: unknown): string | null =>
  escrowReceiptView(root) === undefined ? reference(root, child) : null

/** Expose only provenance, never the private correlation identifier itself. */
export const hasSessionMarker = (receipt: unknown): boolean => {
  const id = field(receipt, "sessionId")
  return typeof id === "string" && id.length === 36 && /^ses_[0-9a-f]{32}$/.test(id)
}
