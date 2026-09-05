import { Settled } from "../generated/FeeSplitterSmoke/FeeSplitter"
import { Settlement } from "../generated/schema"

export function handleSettled(event: Settled): void {
  const s = new Settlement(event.transaction.hash.concatI32(event.logIndex.toI32()))
  s.buyer = event.params.buyer
  s.totalAtomic = event.params.total
  s.sellerAtomic = event.params.sellerAmount
  s.feeAtomic = event.params.feeAmount
  s.nonce = event.params.nonce
  s.blockNumber = event.block.number
  s.timestamp = event.block.timestamp
  s.txHash = event.transaction.hash
  s.save()
}
