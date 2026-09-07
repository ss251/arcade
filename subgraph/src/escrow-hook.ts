import { BigInt } from "@graphprotocol/graph-ts"
import { ArcadeSettled, ArcadeRefused } from "../generated/templates/ArcadeJobHook/ArcadeJobHook"
import { begin, binding, bytes, known, unsigned } from "./escrow-events"

export function handleArcadeSettled(event: ArcadeSettled): void {
  const p = event.params; bytes(p.treeHash, 32); bytes(p.receiptHash, 32)
  unsigned(p.childCount, BigInt.fromString("4294967295")); unsigned(p.childTotalAtomic)
  const record = begin(event, "arcade_settled", p.jobId, true); if (record == null) return
  record.treeHash = p.treeHash; record.receiptHash = p.receiptHash
  record.childCount = p.childCount; record.childTotalAtomic = p.childTotalAtomic
  const job = known(record), pins = binding()!
  if (job != null) {
    assert(job.hook.equals(pins.hook) && job.evaluator.equals(pins.evaluator), "Unexpected hook job binding")
    job.save()
  }
  // Supplied metadata only: never manufacture a Settlement or verified receipt Tree.
  record.save()
}
export function handleArcadeRefused(event: ArcadeRefused): void {
  const p = event.params; bytes(p.reason, 32)
  const record = begin(event, "arcade_refused", p.jobId, true); if (record == null) return
  record.hash = p.reason
  const job = known(record), pins = binding()!
  if (job != null) {
    assert(job.hook.equals(pins.hook) && job.evaluator.equals(pins.evaluator), "Unexpected hook job binding")
    job.save()
  }
  // A hook refusal is not a refund; only the separate Refunded observation says that.
  record.save()
}
