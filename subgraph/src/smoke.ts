import { Settled } from "../generated/FeeSplitterSmoke/FeeSplitter"
import { BigInt } from "@graphprotocol/graph-ts"
import { Settlement, Splitter } from "../generated/schema"

/** Temporary G2 adapter for the unchanged pilot-only manifest, not the G4 ledger mapping. */
export function handleSettled(event: Settled): void {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  // The immutable occurrence owns counter changes; repeated delivery must not count twice.
  if (Settlement.load(id) != null) return

  let splitter = Splitter.load(event.address)
  if (splitter == null) {
    splitter = new Splitter(event.address)
    splitter.source = "static"
    splitter.firstSeenBlock = event.block.number
    splitter.settlementCount = BigInt.zero()
    splitter.settledVolumeAtomic = BigInt.zero()
  }
  splitter.settlementCount = splitter.settlementCount.plus(BigInt.fromI32(1))
  splitter.settledVolumeAtomic = splitter.settledVolumeAtomic.plus(event.params.total)
  splitter.save()

  const s = new Settlement(id)
  s.rail = "eip3009"
  s.splitter = splitter.id
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
