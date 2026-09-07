import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { Settled } from "../generated/FeeSplitterSmoke/FeeSplitter"
import { SettledTree } from "../generated/templates/FeeSplitterV2/FeeSplitterV2"
import { Settlement, Tree, TreeOccurrence } from "../generated/schema"
import { occurrenceId, splitterFor } from "./ids"

/** Only explicit common event facts cross this helper; never reinterpret a tree event. */
function record(
  event: ethereum.Event, id: Bytes, buyer: Bytes, total: BigInt,
  sellerAmount: BigInt, feeAmount: BigInt, nonce: Bytes
): Settlement {
  const splitter = splitterFor(event.address, "static", event.block.number)
  const settlement = new Settlement(id)
  settlement.rail = "eip3009"
  settlement.splitter = splitter.id
  settlement.buyer = buyer
  settlement.totalAtomic = total
  settlement.sellerAtomic = sellerAmount
  settlement.feeAtomic = feeAmount
  settlement.nonce = nonce
  settlement.blockNumber = event.block.number
  settlement.timestamp = event.block.timestamp
  settlement.txHash = event.transaction.hash
  splitter.settlementCount = splitter.settlementCount.plus(BigInt.fromI32(1))
  splitter.settledVolumeAtomic = splitter.settledVolumeAtomic.plus(total)
  splitter.save()
  return settlement
}

/** The pilot v1 and inactive V2 template share this exact five-field Settled ABI. */
export function handleSettled(event: Settled): void {
  const id = occurrenceId(event.transaction.hash, event.logIndex)
  if (Settlement.load(id) != null) return
  const params = event.params
  const settlement = record(event, id, params.buyer, params.total, params.sellerAmount, params.feeAmount, params.nonce)
  settlement.save()
}

export function handleSettledTree(event: SettledTree): void {
  const id = occurrenceId(event.transaction.hash, event.logIndex)
  if (Settlement.load(id) != null) return
  const params = event.params
  const settlement = record(event, id, params.buyer, params.total, params.sellerAmount, params.feeAmount, params.nonce)

  let tree = Tree.load(params.treeHash)
  if (tree == null) {
    tree = new Tree(params.treeHash)
    tree.root = id
    if (params.childCount.le(BigInt.fromI32(2147483647))) tree.childCount = params.childCount.toI32()
    else tree.unset("childCount")
    tree.childTotalAtomic = params.childTotalAtomic
    tree.blockNumber = event.block.number
    tree.timestamp = event.block.timestamp
    tree.txHash = event.transaction.hash
    tree.occurrenceCount = BigInt.fromI32(1)
    tree.ambiguous = false
  } else {
    // A hash is not an event identity: preserve first facts and never choose another root.
    tree.root = null
    tree.ambiguous = true
    tree.occurrenceCount = tree.occurrenceCount.plus(BigInt.fromI32(1))
  }
  tree.save()

  const occurrence = new TreeOccurrence(id)
  occurrence.treeHash = params.treeHash
  occurrence.root = id
  occurrence.splitter = event.address
  occurrence.childCount = params.childCount
  occurrence.childTotalAtomic = params.childTotalAtomic
  occurrence.blockNumber = event.block.number
  occurrence.timestamp = event.block.timestamp
  occurrence.txHash = event.transaction.hash
  occurrence.logIndex = event.logIndex
  occurrence.save()
  settlement.tree = tree.id
  settlement.save()
}
