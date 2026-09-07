/** Token authentication remains in the route. This only decides escrow delivery. */
import { assertOutputSize, shouldSettle } from "@arcade/core"
import { decodeEscrowJob, decodeEscrowReceipt, escrowJobWire, escrowReceiptWire } from "./escrow-terminal.ts"
import { escrowReceiptView } from "./escrow-receipt-view.ts"
import type { Job, Receipt } from "@arcade/core"
export type EscrowResult = { readonly kind: "unavailable" } | { readonly kind: "withheld"; readonly detail: string } |
  { readonly kind: "delivered"; readonly output: unknown }
/** undefined preserves the legacy branch. Invalid escrow can NEVER take that branch. */
export function escrowResultDelivery(rawReceipt: unknown, rawJob: unknown): EscrowResult | undefined {
  const evidence = escrowReceiptView(rawReceipt)
  if (evidence === undefined) return undefined
  if (evidence === null) return { kind: "unavailable" }
  if (evidence.state !== "settled") return { kind: "withheld", detail: evidence.state === "refunded"
    ? "escrow refund confirmed; no result is released" : "escrow outcome uncertain; reconciliation required; no result is released" }
  try {
    // Current-disk Store has already validated the terminal proof/binding. Snapshot
    // exact data again so a malformed getter, changed job or missing output cannot
    // turn a valid-looking receipt into delivery of somebody else's result.
    const receipt = decodeEscrowReceipt(escrowReceiptWire(rawReceipt as Receipt)), job = decodeEscrowJob(escrowJobWire(rawJob as Job))
    if (job.id !== receipt.jobId || job.skillId !== receipt.skillId || job.buyer !== receipt.buyer || job.seller !== receipt.seller ||
      job.priceAtomic !== receipt.priceAtomic || job.rootJobId !== job.id || job.parentJobId !== undefined || job.hop !== 0 || job.ancestors?.length !== 0 ||
      job.status !== "succeeded" || job.outcome === undefined || !shouldSettle(job.outcome, true).settle) return { kind: "unavailable" }
    assertOutputSize(job.outcome.output)
    return { kind: "delivered", output: job.outcome.output }
  } catch { return { kind: "unavailable" } }
}
