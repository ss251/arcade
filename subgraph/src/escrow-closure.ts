import { BigInt, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts"
import { EscrowEvent, EscrowJob, Settlement } from "../generated/schema"
import { ArcadeSettled } from "../generated/templates/ArcadeJobHook/ArcadeJobHook"
import { binding, closureTreasury, nonzero } from "./escrow-events"

const USDC = Bytes.fromHexString("0x3600000000000000000000000000000000000000")
const TRANSFER = topic("Transfer(address,address,uint256)")
const PAYMENT = topic("PaymentReleased(uint256,address,uint256)")
const FEE = topic("PlatformFeePaid(uint256,address,uint256)")
const COMPLETE = topic("JobCompleted(uint256,address,bytes32)")
const HOOK = topic("ArcadeSettled(uint256,bytes32,uint32,uint256,bytes32)")
function topic(signature: string): Bytes { return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(signature))) }
function uint(word: Bytes): BigInt | null {
  if (word.length != 32) return null
  const value = ethereum.decode("uint256", word)
  return value === null ? null : value.toBigInt()
}
function address(word: Bytes): Bytes | null {
  if (word.length != 32) return null
  // Indexed address words must have exactly twelve zero padding bytes.
  for (let i = 0; i < 12; i++) if (word[i] != 0) return null
  const value = ethereum.decode("address", word)
  return value === null ? null : value.toAddress()
}
class Transfer {
  constructor(public recipient: Bytes, public amount: BigInt, public index: BigInt) {}
}
class Paid {
  constructor(public seller: BigInt, public fee: BigInt) {}
}
/** Whole receipt, including later logs; partial prefixes never become money evidence. */
function paid(event: ArcadeSettled, job: EscrowJob, treasury: Bytes): Paid | null {
  const receipt = event.receipt, pins = binding()
  if (receipt === null || pins === null) return null
  if (treasury.equals(pins.proxy) || treasury.equals(pins.hook)) return null
  if (receipt.transactionHash.length != 32 || !nonzero(receipt.transactionHash) ||
    receipt.blockHash.length != 32 || !nonzero(receipt.blockHash) ||
    !receipt.blockNumber.gt(BigInt.zero()) || !receipt.transactionIndex.ge(BigInt.zero())) return null
  if (!receipt.status.equals(BigInt.fromI32(1)) || !receipt.transactionHash.equals(event.transaction.hash) ||
    !receipt.transactionIndex.equals(event.transaction.index) || !receipt.blockHash.equals(event.block.hash) ||
    !receipt.blockNumber.equals(event.block.number) || receipt.logs.length < 6 || receipt.logs.length > 128) return null
  const outgoing = new Array<Transfer>()
  let seller: BigInt | null = null, fee: BigInt | null = null
  let paymentIndex: BigInt | null = null, feeIndex: BigInt | null = null, completeIndex: BigInt | null = null
  let hookIndex: BigInt | null = null, previous = BigInt.fromI32(-1), size = 0
  const tuple = new ethereum.Tuple(), p = event.params
  tuple.push(ethereum.Value.fromFixedBytes(p.treeHash)); tuple.push(ethereum.Value.fromUnsignedBigInt(p.childCount))
  tuple.push(ethereum.Value.fromUnsignedBigInt(p.childTotalAtomic)); tuple.push(ethereum.Value.fromFixedBytes(p.receiptHash))
  const hookData = ethereum.encode(ethereum.Value.fromTuple(tuple))
  if (hookData === null) return null
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i]
    if (log.address.length != 20 || !nonzero(log.address) || log.topics.length > 4 || log.data.length > 65536 ||
      !log.transactionHash.equals(receipt.transactionHash) || !log.blockHash.equals(receipt.blockHash) ||
      !log.transactionIndex.equals(receipt.transactionIndex) || !log.transactionLogIndex.equals(BigInt.fromI32(i)) ||
      !log.logIndex.gt(previous) || log.logIndex.gt(BigInt.fromI32(2147483647))) return null
    if (log.removed !== null && log.removed!.inner) return null
    previous = log.logIndex; size += log.data.length + log.topics.length * 32
    if (size > 65536) return null
    for (let n = 0; n < log.topics.length; n++) if (log.topics[n].length != 32) return null
    if (log.address.equals(USDC) && log.topics.length > 0 && log.topics[0].equals(TRANSFER)) {
      if (log.topics.length != 3) return null
      const from = address(log.topics[1]), to = address(log.topics[2]), amount = uint(log.data)
      if (from === null || to === null || amount === null) return null
      if (from.equals(pins.proxy)) {
        if (outgoing.length == 2) return null
        outgoing.push(new Transfer(to, amount, log.logIndex))
      }
    } else if (log.address.equals(pins.proxy)) {
      if (log.topics.length != 3 || log.data.length != 32) return null
      const id = uint(log.topics[1]), actor = address(log.topics[2])
      if (id === null || actor === null || !id.equals(job.jobId)) return null
      if (log.topics[0].equals(PAYMENT)) {
        if (paymentIndex !== null || !actor.equals(job.provider)) return null
        seller = uint(log.data); paymentIndex = log.logIndex
      } else if (log.topics[0].equals(FEE)) {
        if (feeIndex !== null || !actor.equals(treasury)) return null
        fee = uint(log.data); feeIndex = log.logIndex
      } else if (log.topics[0].equals(COMPLETE)) {
        if (completeIndex !== null || !actor.equals(job.evaluator)) return null
        completeIndex = log.logIndex
      } else return null
    } else if (log.address.equals(pins.hook)) {
      if (hookIndex !== null || log.topics.length != 2 || !log.topics[0].equals(HOOK) ||
        !log.logIndex.equals(event.logIndex) || !log.transactionLogIndex.equals(event.transactionLogIndex) ||
        !log.data.equals(hookData)) return null
      const id = uint(log.topics[1]); if (id === null || !id.equals(job.jobId)) return null
      hookIndex = log.logIndex
    }
  }
  if (outgoing.length != 2 || seller === null || fee === null || paymentIndex === null ||
    feeIndex === null || completeIndex === null || hookIndex === null) return null
  const funded = job.fundedAtomic
  if (funded === null || !seller.plus(fee).equals(funded) || !seller.gt(BigInt.zero())) return null
  if (!outgoing[0].recipient.equals(treasury) || !outgoing[0].amount.equals(fee) ||
    !outgoing[1].recipient.equals(job.provider) || !outgoing[1].amount.equals(seller)) return null
  if (!outgoing[0].index.lt(feeIndex) || !feeIndex.lt(outgoing[1].index) || !outgoing[1].index.lt(paymentIndex) ||
    !paymentIndex.lt(completeIndex) || !completeIndex.lt(hookIndex)) return null
  return new Paid(seller, fee)
}

/** Indexer-observed full paid footprint, not RPC/administrative/execution verification. */
export function correlatePaid(event: ArcadeSettled, record: EscrowEvent, job: EscrowJob): void {
  const treasury = closureTreasury(), token = job.paymentToken, funded = job.fundedAtomic
  if (treasury === null || token === null || funded === null || !token.equals(USDC) ||
    !job.closureEligible || job.status != "COMPLETED" || job.completeTx !== null) return
  const footprint = paid(event, job, treasury)
  if (footprint === null) return
  const settlement = new Settlement(record.id)
  settlement.rail = "erc8183"; settlement.escrowJob = job.id; settlement.buyer = job.client
  settlement.totalAtomic = funded; settlement.sellerAtomic = footprint.seller; settlement.feeAtomic = footprint.fee
  settlement.blockNumber = record.blockNumber; settlement.timestamp = record.timestamp; settlement.txHash = record.txHash
  settlement.save()
  job.completedAt = record.timestamp; job.completeTx = record.txHash
  job.treeHash = event.params.treeHash; job.receiptHash = event.params.receiptHash; job.save()
}
