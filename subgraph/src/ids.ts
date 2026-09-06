import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Splitter } from "../generated/schema"

export const ARC_CHAIN_ID = BigInt.fromI32(5042002)

/** Preserve the historical concatI32 identity, without truncating synthetic indices. */
export function occurrenceId(transaction: Bytes, logIndex: BigInt): Bytes {
  assert(logIndex.ge(BigInt.zero()) && logIndex.le(BigInt.fromI32(2147483647)), "Invalid event log index")
  return transaction.concatI32(logIndex.toI32())
}

/** First observed discovery only: neither complete history nor listing authority. */
export function splitterFor(address: Bytes, source: string, block: BigInt): Splitter {
  let splitter = Splitter.load(address)
  if (splitter == null) {
    splitter = new Splitter(address)
    splitter.source = source
    splitter.firstSeenBlock = block
    splitter.settlementCount = BigInt.zero()
    splitter.settledVolumeAtomic = BigInt.zero()
    splitter.save()
  }
  return splitter as Splitter
}

export function agentEntityId(chainId: BigInt, agentId: BigInt): string {
  return chainId.toString() + ":" + agentId.toString()
}
