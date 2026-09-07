/** Coherence of bounded hub-reported public data, NOT chain verification or payment authority. */
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"
import { formatPrice } from "../../../../packages/core/src/money.ts"

interface Base { readonly escrowJobId: string; readonly contract: string; readonly amountAtomic: string }
export type PublicEscrow = Base & (
  { readonly state: "settled"; readonly sellerPaidAtomic: string; readonly feePaidAtomic: string } |
  { readonly state: "refunded"; readonly refundAtomic: string; readonly refundTx: string; readonly refundExplorer: string | null } |
  { readonly state: "uncertain" })
export interface PublicEscrowView {
  readonly escrow: PublicEscrow; readonly contractExplorer: string
  readonly settleTx?: string; readonly explorer: string | null
}
const invalid = (): never => { throw Error("Public escrow evidence unavailable") }
const record = (value: unknown): object => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) ? value : invalid()
const data = (value: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(value, key)
  if (d === undefined) return key in value ? invalid() : undefined
  return d.enumerable && "value" in d ? d.value : invalid()
}
const uint = (v: unknown, positive = false): string => typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) &&
  BigInt(v) < (1n << 256n) && (!positive || BigInt(v) > 0n) ? v : invalid()
const hex = (v: unknown, digits: 40 | 64): string => typeof v === "string" && v.length === digits + 2 &&
  /^0x[0-9a-f]+$/.test(v) && BigInt(v) > 0n ? v : invalid()

/** Missing/malformed escrow stays unavailable. Fixed own data reads never serialize unknown fields. */
export function checkedPublicEscrow(value: unknown): PublicEscrowView | null {
  try {
    const r = record(value), config = loadChainConfig("arc-testnet")
    if (config.status !== "ready" || data(r, "rail") !== "erc8183" || data(r, "network") !== config.caip2 ||
      data(r, "hop") !== 0 || data(r, "session") !== false || data(r, "feeSweepTx") !== undefined || data(r, "feeBps") !== 500) return null
    hex(data(r, "seller"), 40)
    const e = record(data(r, "escrow")), state = data(e, "state")
    const allowed = ["state", "escrowJobId", "contract", "amountAtomic", ...(state === "settled" ? ["sellerPaidAtomic", "feePaidAtomic"] :
      state === "refunded" ? ["refundAtomic", "refundTx", "refundExplorer"] : state === "uncertain" ? [] : invalid())]
    const keys = Reflect.ownKeys(e)
    if (keys.length > allowed.length || keys.some(k => typeof k !== "string" || !allowed.includes(k))) return null
    const base = { escrowJobId: uint(data(e, "escrowJobId"), true), contract: hex(data(e, "contract"), 40), amountAtomic: uint(data(e, "amountAtomic"), true) }
    const amount = BigInt(base.amountAtomic), fee = amount * 500n / 10_000n, seller = amount - fee
    if (data(r, "priceAtomic") !== base.amountAtomic || data(r, "sellerAtomic") !== seller.toString() || data(r, "feeAtomic") !== fee.toString() ||
      data(r, "price") !== formatPrice(amount) || data(r, "sellerShare") !== formatPrice(seller) || data(r, "fee") !== formatPrice(fee)) return null
    const explorerBase = config.explorerBaseUrl.replace(/\/$/, "")
    const contractExplorer = `${explorerBase}/address/${base.contract}`
    const link = (tx: string, reported: unknown) => reported === `${explorerBase}/tx/${tx}` ? reported as string : null
    let escrow: PublicEscrow
    if (state === "settled") {
      if (data(r, "settled") !== true || data(r, "settleRefKind") !== "onchain" ||
        data(e, "sellerPaidAtomic") !== seller.toString() || data(e, "feePaidAtomic") !== fee.toString()) return null
      const settleTx = hex(data(r, "settleTx"), 64)
      escrow = Object.freeze({ ...base, state, sellerPaidAtomic: seller.toString(), feePaidAtomic: fee.toString() })
      return Object.freeze({ escrow, contractExplorer, settleTx, explorer: link(settleTx, data(r, "explorer")) })
    }
    if (data(r, "settled") !== false || data(r, "settleTx") !== undefined || data(r, "settleRefKind") !== undefined || data(r, "explorer") !== null) return null
    if (state === "refunded") {
      if (data(e, "refundAtomic") !== base.amountAtomic) return null
      const refundTx = hex(data(e, "refundTx"), 64)
      escrow = Object.freeze({ ...base, state, refundAtomic: base.amountAtomic, refundTx, refundExplorer: link(refundTx, data(e, "refundExplorer")) })
    } else escrow = Object.freeze({ ...base, state: "uncertain" })
    return Object.freeze({ escrow, contractExplorer, explorer: null })
  } catch { return null }
}
export const publicEscrowReason = (view: PublicEscrowView | null): string => view === null ? "escrow evidence unavailable" :
  view.escrow.state === "settled" ? "ok" : view.escrow.state === "refunded" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required"
