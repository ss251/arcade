import { checkedPublicEscrow } from "../lib/public-escrow.ts"
import { formatPrice } from "../../../../packages/core/src/money.ts"

/** Recheck direct props; no generic tx-link widening, RPC, storage, wallet or recovery. */
export function EscrowRecord({ receipt }: { readonly receipt: unknown }) {
  const view = checkedPublicEscrow(receipt)
  if (view === null) return <div><p className="skill-state is-unresolved">Escrow evidence unavailable</p>
    <p>No terminal movement established. Missing evidence is not a confirmed refund.</p></div>
  const e = view.escrow
  const tx = e.state === "refunded" ? e.refundTx : view.settleTx
  const target = e.state === "refunded" ? e.refundExplorer : view.explorer
  return <div>
    <p className={`skill-state${e.state === "settled" ? " is-settled" : " is-unresolved"}`}>Hub reports escrow {e.state}</p>
    <p>Escrow job <span className="skill-code">#{e.escrowJobId}</span> · contract <a className="skill-code skill-address"
      href={view.contractExplorer} target="_blank" rel="noreferrer">{e.contract}</a></p>
    {e.state === "settled" ? <p>Reported seller payment {formatPrice(BigInt(e.sellerPaidAtomic))}; reported fee {formatPrice(BigInt(e.feePaidAtomic))}.</p>
      : e.state === "refunded" ? <p>Reported principal refund {formatPrice(BigInt(e.refundAtomic))}. This does not establish recovery of gas or other costs.</p>
        : <p>No terminal movement established. This is neither zero charge nor a confirmed refund.</p>}
    {tx === undefined ? null : <p className="skill-reference">{e.state === "refunded" ? "Refund" : "Completion"} reference {target === null
      ? <code className="skill-code">{tx}</code> : <a className="skill-code" href={target} target="_blank" rel="noreferrer">{tx}</a>}</p>}
    <p className="skill-note">Hub-reported evidence and navigational links, not independently verified chain receipts, balances, contract configuration or execution.</p>
  </div>
}
