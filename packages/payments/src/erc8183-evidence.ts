/** Offline, source-shaped transaction/log proofs; no RPC, retries or broadcasting. */
import { encodeAbiParameters, keccak256, parseAbiParameters, parseTransaction, recoverTransactionAddress, toHex,
  type Hex, type TransactionReceipt } from "viem"
import { type PreparedEscrowAction } from "./erc8183-actions.ts"
import { captureEscrowJob, escrowAddress, escrowBytes32, escrowCheck, escrowFeeQuote, escrowRecord, escrowSeconds, escrowUint,
  EscrowFactsRefused, ERC8183_ZERO, ERC8183_ZERO_HASH } from "./erc8183-codec.ts"
import type { EscrowSnapshot } from "./erc8183-request.ts"
export interface EscrowTransactionTerms {
  readonly nonce: number; readonly gas: bigint; readonly maxFeePerGas: bigint
  readonly maxPriorityFeePerGas: bigint; readonly gasCapWei: bigint
}
export function captureEscrowTransactionTerms(input: unknown): EscrowTransactionTerms {
  try {
    const t = escrowRecord(input, ["nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasCapWei"])
    escrowCheck(typeof t.nonce === "number" && Number.isSafeInteger(t.nonce) && t.nonce >= 0)
    const gas = escrowUint(t.gas), maxFeePerGas = escrowUint(t.maxFeePerGas),
      maxPriorityFeePerGas = escrowUint(t.maxPriorityFeePerGas), gasCapWei = escrowUint(t.gasCapWei)
    escrowCheck(gas > 0n && maxFeePerGas > 0n && maxPriorityFeePerGas <= maxFeePerGas && gas * maxFeePerGas <= gasCapWei)
    return Object.freeze({ nonce: t.nonce, gas, maxFeePerGas, maxPriorityFeePerGas, gasCapWei })
  } catch { throw new EscrowFactsRefused() }
}
export async function assertEscrowSignedAction(action: PreparedEscrowAction, raw: unknown, terms: EscrowTransactionTerms) {
  return assertEscrowSignedTransaction(action, raw, terms)
}
/** Shared exact wire proof for separately prepared evaluator or buyer transactions.
 * No signing authority is inferred from this narrow intent; caller owns preparation. */
export async function assertEscrowSignedTransaction(action: Pick<PreparedEscrowAction, "sender" | "to" | "data">,
  raw: unknown, terms: EscrowTransactionTerms) {
  try {
    const own = (key: "sender" | "to" | "data") => {
      const d = Object.getOwnPropertyDescriptor(action, key); escrowCheck(d && "value" in d); return d.value as unknown
    }
    const sender = escrowAddress(own("sender")), to = escrowAddress(own("to")), data = own("data")
    escrowCheck(typeof data === "string" && /^0x(?:[0-9a-f]{2}){1,65535}$/.test(data))
    terms = captureEscrowTransactionTerms(terms)
    escrowCheck(typeof raw === "string" && /^0x02(?:[0-9a-fA-F]{2}){1,65535}$/.test(raw) &&
      Number.isSafeInteger(terms.nonce) && terms.nonce >= 0)
    const gas = escrowUint(terms.gas), maxFee = escrowUint(terms.maxFeePerGas), priority = escrowUint(terms.maxPriorityFeePerGas)
    escrowCheck(gas > 0n && maxFee > 0n && priority <= maxFee && gas * maxFee <= escrowUint(terms.gasCapWei))
    const serialized = raw.toLowerCase() as `0x02${string}`, tx = parseTransaction(serialized)
    escrowCheck(tx.type === "eip1559" && tx.chainId === 5042002 && tx.nonce === terms.nonce &&
      tx.gas === gas && tx.maxFeePerGas === maxFee && (tx.maxPriorityFeePerGas ?? 0n) === priority &&
      (tx.value ?? 0n) === 0n && escrowAddress(tx.to) === to && tx.data === data &&
      (tx.accessList === undefined || tx.accessList.length === 0) &&
      escrowAddress(await recoverTransactionAddress({ serializedTransaction: serialized })) === sender)
    return Object.freeze({ hash: keccak256(serialized), serialized, nonce: terms.nonce,
      gas, maxFeePerGas: maxFee, maxPriorityFeePerGas: priority, gasCapWei: terms.gasCapWei })
  } catch { throw new EscrowFactsRefused() }
}
export type EscrowSignedAction = Awaited<ReturnType<typeof assertEscrowSignedAction>>
const uint = (n: bigint) => toHex(escrowUint(n), { size: 32 })
const addressTopic = (a: Hex) => uint(BigInt(escrowAddress(a)))
const amountData = (n: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [n])
function event(address: Hex, signature: string, indexed: readonly Hex[], data: Hex) {
  return { address, topics: [keccak256(toHex(signature)), ...indexed], data }
}
function expectedLogs(a: PreparedEscrowAction) {
  const c = a.context, id = uint(c.jobId), token = c.call.token, escrow = c.call.escrow, provider = c.call.provider
  const transfer = (to: Hex, amount: bigint) => event(token, "Transfer(address,address,uint256)",
    [addressTopic(escrow), addressTopic(to)], amountData(amount))
  if (a.kind === "budget" || a.kind === "submit") {
    const authorization = event(escrow, "AuthorizationUsed(address,bytes32)",
      [addressTopic(provider), escrowBytes32(a.providerNonce, false)], "0x")
    return [authorization, a.kind === "budget"
      ? event(escrow, "BudgetSet(uint256,address,uint256)", [id, addressTopic(token)], amountData(c.call.amount))
      : event(escrow, "JobSubmitted(uint256,address,bytes32)", [id, addressTopic(provider)], escrowBytes32(a.outputHash, false))]
  }
  const reason = escrowBytes32(a.reason, false)
  if (a.kind === "reject") return [transfer(c.client, c.call.amount),
    event(escrow, "Refunded(uint256,address,uint256)", [id, addressTopic(c.client)], amountData(c.call.amount)),
    event(escrow, "JobRejected(uint256,address,bytes32)", [id, addressTopic(c.call.evaluator)], reason),
    event(c.call.hook, "ArcadeRefused(uint256,bytes32)", [id], reason)]
  escrowCheck(a.receipt !== undefined)
  const fee = escrowFeeQuote(c.call.amount), tree = a.receipt.tree
  return [...(fee.feeAtomic > 0n ? [transfer(c.treasury, fee.feeAtomic),
    event(escrow, "PlatformFeePaid(uint256,address,uint256)", [id, addressTopic(c.treasury)], amountData(fee.feeAtomic))] : []),
    transfer(provider, fee.sellerAtomic),
    event(escrow, "PaymentReleased(uint256,address,uint256)", [id, addressTopic(provider)], amountData(fee.sellerAtomic)),
    event(escrow, "JobCompleted(uint256,address,bytes32)", [id, addressTopic(c.call.evaluator)], reason),
    event(c.call.hook, "ArcadeSettled(uint256,bytes32,uint32,uint256,bytes32)", [id],
      encodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"),
        [tree.treeHash, tree.childCount, tree.childTotalAtomic, a.receipt.hash]))]
}
export interface EscrowMinedTransaction {
  readonly hash: Hex; readonly from: Hex; readonly to: Hex | null; readonly input: Hex; readonly value: bigint
  readonly nonce: number; readonly chainId: number; readonly blockHash: Hex | null; readonly blockNumber: bigint | null
}
/** after MUST be independently identity-checked at this receipt's canonical finalized block
 * (reader.readJobAt). The transaction is fetched separately, not inferred from the receipt.
 * This proof does not itself fetch either input or establish RPC honesty/finality. */
export function assertEscrowActionReceipt(action: PreparedEscrowAction, signed: EscrowSignedAction,
  tx: EscrowMinedTransaction, receipt: TransactionReceipt, after: EscrowSnapshot) {
  try {
    const hash = escrowBytes32(signed.hash, false), blockHash = escrowBytes32(receipt.blockHash, false)
    escrowSeconds(after.timestamp)
    escrowCheck(receipt.type === "eip1559" && receipt.status === "success" && escrowBytes32(receipt.transactionHash, false) === hash &&
      escrowUint(receipt.blockNumber) > 0n && Number.isSafeInteger(receipt.transactionIndex) && receipt.transactionIndex >= 0 &&
      escrowAddress(receipt.from) === action.sender && escrowAddress(receipt.to) === action.to &&
      tx.chainId === 5042002 && escrowBytes32(tx.hash, false) === hash && escrowAddress(tx.from) === action.sender &&
      escrowAddress(tx.to) === action.to && tx.input === action.data && tx.value === 0n && tx.nonce === signed.nonce &&
      tx.blockNumber === receipt.blockNumber && escrowBytes32(tx.blockHash, false) === blockHash &&
      after.chainId === 5042002 && after.escrow === action.to && after.jobId === action.context.jobId &&
      after.blockNumber === receipt.blockNumber && after.blockHash === blockHash)
    const gasUsed = escrowUint(receipt.gasUsed), gasPrice = escrowUint(receipt.effectiveGasPrice)
    escrowCheck(gasUsed > 0n && gasUsed <= signed.gas && gasPrice <= signed.maxFeePerGas &&
      gasUsed * gasPrice <= signed.gasCapWei && Array.isArray(receipt.logs) && receipt.logs.length <= 128)
    const scoped = new Set([action.to, action.context.call.hook, action.context.call.token])
    const logs: ReturnType<typeof event>[] = []
    let last = -1
    for (const log of receipt.logs) {
      escrowCheck(log.removed === false && log.blockNumber === receipt.blockNumber &&
        escrowBytes32(log.blockHash, false) === blockHash && escrowBytes32(log.transactionHash, false) === hash &&
        Number.isSafeInteger(log.logIndex) && log.logIndex !== null && log.logIndex > last &&
        log.transactionIndex === receipt.transactionIndex)
      last = log.logIndex
      const address = escrowAddress(log.address)
      if (scoped.has(address)) {
        escrowCheck(Array.isArray(log.topics) && log.topics.length <= 4 &&
          typeof log.data === "string" && /^0x(?:[0-9a-fA-F]{2}){0,4096}$/.test(log.data))
        logs.push({ address, topics: log.topics.map(topic => escrowBytes32(topic)), data: log.data.toLowerCase() as Hex })
      }
    }
    escrowCheck(JSON.stringify(logs) === JSON.stringify(expectedLogs(action)))
    const c = action.context, job = captureEscrowJob(after.job)
    escrowCheck(job.status === ({ budget: 0, submit: 2, complete: 3, reject: 4 } as const)[action.kind] &&
      job.client === c.client && job.provider === c.call.provider && job.evaluator === c.call.evaluator &&
      job.hook === c.call.hook && job.budget === c.call.amount && job.paymentToken === c.call.token &&
      job.providerAgentId === c.call.providerAgentId && job.expiredAt === c.expiredAt &&
      job.description === "arcade:erc8183:request:v1:" + c.requestHash &&
      job.settledAmount === 0n && escrowBytes32(after.pendingClaimHash) === ERC8183_ZERO_HASH &&
      (job.payoutReceiver === ERC8183_ZERO || job.payoutReceiver === c.call.provider) &&
      (action.kind === "budget" ? job.submittedAt === 0 : action.kind === "submit" ? job.submittedAt === after.timestamp :
        action.kind === "complete" ? job.submittedAt > 0 && job.submittedAt <= after.timestamp : job.submittedAt <= after.timestamp))
    const fee = escrowFeeQuote(c.call.amount)
    return Object.freeze({ kind: action.kind, txHash: hash, blockHash, blockNumber: receipt.blockNumber,
      blockTimestamp: after.timestamp, submittedAt: job.submittedAt,
      gasWei: gasUsed * gasPrice, feeAtomic: action.kind === "complete" ? fee.feeAtomic : 0n,
      sellerAtomic: action.kind === "complete" ? fee.sellerAtomic : 0n, refundAtomic: action.kind === "reject" ? c.call.amount : 0n })
  } catch { throw new EscrowFactsRefused() }
}
