import { BigInt, Bytes, crypto, dataSource, DataSourceContext, ethereum, ValueKind } from "@graphprotocol/graph-ts"
import { EscrowEvent, EscrowJob } from "../generated/schema"
import { ARC_CHAIN_ID, occurrenceId } from "./ids"

const UINT256 = BigInt.fromString("115792089237316195423570985008687907853269984665640564039457584007913129639935")
export function unsigned(value: BigInt, max: BigInt = UINT256): void {
  assert(value.ge(BigInt.zero()) && value.le(max), "Invalid escrow event integer")
}
export function bytes(value: Bytes, length: i32): void { assert(value.length == length, "Invalid escrow event bytes") }
export function nonzero(value: Bytes): bool {
  for (let i = 0; i < value.length; i++) if (value[i] != 0) return true
  return false
}
export class EscrowBinding {
  constructor(public proxy: Bytes, public hook: Bytes, public evaluator: Bytes) {}
}
function contextAddress(context: DataSourceContext, key: string): Bytes | null {
  const value = context.get(key)
  if (value == null || value.kind != ValueKind.BYTES) return null
  const address = value.toBytes()
  return address.length == 20 && nonzero(address) ? address : null
}
/** Local deployment context only. No handler or metadata path instantiates a source. */
export function binding(): EscrowBinding | null {
  if (dataSource.network() != "arc-testnet") return null
  const context = dataSource.context()
  const proxy = contextAddress(context, "escrow"), hook = contextAddress(context, "hook")
  const evaluator = contextAddress(context, "evaluator")
  if (proxy === null || hook === null || evaluator === null) return null
  if (proxy.equals(hook) || proxy.equals(evaluator) || hook.equals(evaluator)) return null
  return new EscrowBinding(proxy, hook, evaluator)
}
export function jobKey(proxy: Bytes, jobId: BigInt): string {
  unsigned(jobId); assert(jobId.gt(BigInt.zero()), "Invalid escrow job ID")
  return ARC_CHAIN_ID.toString() + ":" + proxy.toHexString() + ":" + jobId.toString()
}
function payload(event: ethereum.Event): Bytes {
  assert(event.parameters.length > 0 && event.parameters.length <= 6, "Invalid escrow event arity")
  const values = new ethereum.Tuple()
  for (let i = 0; i < event.parameters.length; i++) values.push(event.parameters[i].value)
  const encoded = ethereum.encode(ethereum.Value.fromTuple(values))
  assert(encoded !== null, "Invalid escrow event payload")
  assert((encoded as Bytes).length <= 192, "Invalid escrow event payload")
  return Bytes.fromByteArray(crypto.keccak256(encoded as Bytes))
}
/** Exact replay is harmless; a conflicting occurrence aborts before any summary change. */
export function begin(event: ethereum.Event, kind: string, jobId: BigInt, hook: bool = false): EscrowEvent | null {
  const pins = binding()
  if (pins == null) return null
  assert(event.address.equals(hook ? pins.hook : pins.proxy) && event.address.equals(dataSource.address()), "Unexpected escrow emitter")
  bytes(event.transaction.hash, 32); unsigned(event.block.number); unsigned(event.block.timestamp)
  const key = jobKey(pins.proxy, jobId), id = occurrenceId(event.transaction.hash, event.logIndex)
  const digest = payload(event), old = EscrowEvent.load(id)
  if (old != null) {
    assert(old.escrow.equals(pins.proxy) && old.emitter.equals(event.address) && old.kind == kind &&
      old.jobId.equals(jobId) && old.payloadHash.equals(digest) && old.blockNumber.equals(event.block.number) &&
      old.timestamp.equals(event.block.timestamp) && old.txHash.equals(event.transaction.hash) &&
      old.logIndex.equals(event.logIndex), "Conflicting escrow occurrence")
    return null
  }
  const record = new EscrowEvent(id)
  record.escrow = pins.proxy; record.emitter = event.address; record.kind = kind; record.jobId = jobId
  record.payloadHash = digest; record.blockNumber = event.block.number; record.timestamp = event.block.timestamp
  record.txHash = event.transaction.hash; record.logIndex = event.logIndex
  if (EscrowJob.load(key) != null) record.job = key
  return record
}
/** Canonical Graph event order; no backfill/reorder buffer or current-state RPC claim. */
export function known(record: EscrowEvent): EscrowJob | null {
  const key = record.job
  if (key === null) return null
  const job = EscrowJob.load(key)
  assert(job != null, "Missing observed escrow job")
  assert(record.blockNumber.ge(job!.updatedBlock) && record.timestamp.ge(job!.updatedAt) &&
    (!record.blockNumber.equals(job!.updatedBlock) || record.logIndex.gt(job!.updatedLogIndex)), "Out-of-order escrow event")
  job!.updatedBlock = record.blockNumber; job!.updatedAt = record.timestamp; job!.updatedLogIndex = record.logIndex
  return job
}
