/** Offline buyer wire/receipt proofs. No RPC, keys, sends, journal or execution authority. */
import { decodeFunctionData, encodeAbiParameters, keccak256, parseAbiParameters, parseTransaction, toHex, type Hex } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { encodeSetBudgetRelay, packProviderNonce } from "./erc8183-auth.ts"
import { captureOriginalEscrowBuyerAction, captureOriginalEscrowBuyerIntent, type EscrowBuyerIntent,
  type PreparedEscrowBuyerAction } from "./erc8183-buyer-intent.ts"
import { captureEscrowJob, escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint,
  EscrowFactsRefused, ERC8183_ZERO, ERC8183_ZERO_HASH } from "./erc8183-codec.ts"
import { assertEscrowSignedTransaction, captureEscrowTransactionTerms, type EscrowSignedAction,
  type EscrowTransactionTerms } from "./erc8183-evidence.ts"
const proven = new WeakMap<object, PreparedEscrowBuyerAction>()
/** Re-run from private raw bytes after durable reconstruction; a copied proof is not authority. */
export async function assertEscrowBuyerSigned(input: PreparedEscrowBuyerAction, raw: unknown, terms: EscrowTransactionTerms) {
  try {
    const action = captureOriginalEscrowBuyerAction(input), t = captureEscrowTransactionTerms(terms)
    escrowCheck(t.gasCapWei <= action.intent.gasBudgetWei)
    const signed = await assertEscrowSignedTransaction(action, raw, t)
    proven.set(signed, action); return signed
  } catch { throw new EscrowFactsRefused() }
}
function own(input: unknown, key: string): unknown {
  escrowCheck(input && typeof input === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(input)))
  const d = Object.getOwnPropertyDescriptor(input, key); escrowCheck(d && d.enumerable && "value" in d); return d.value
}
function index(input: unknown): number {
  escrowCheck(typeof input === "number" && Number.isSafeInteger(input) && input >= 0); return input
}
function array(input: unknown, bound: number): readonly unknown[] {
  escrowCheck(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && input.length <= bound &&
    Reflect.ownKeys(input).length === input.length + 1)
  return Array.from({ length: input.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i)); escrowCheck(d && d.enumerable && "value" in d); return d.value as unknown
  })
}
function bytes(input: unknown): Hex {
  escrowCheck(typeof input === "string" && /^0x(?:[0-9a-fA-F]{2}){0,4096}$/.test(input)); return input.toLowerCase() as Hex
}
const uint = (n: bigint) => toHex(escrowUint(n), { size: 32 })
const addressTopic = (a: Hex) => uint(BigInt(escrowAddress(a)))
const amountData = (n: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [n])
function event(address: Hex, signature: string, indexed: readonly Hex[], data: Hex) {
  return Object.freeze({ address, topics: Object.freeze([keccak256(toHex(signature)), ...indexed]), data })
}
function captureReceipt(input: unknown) {
  escrowCheck(own(input, "type") === "eip1559" && own(input, "status") === "success" && own(input, "contractAddress") === null)
  const hash = escrowBytes32(own(input, "transactionHash"), false), blockHash = escrowBytes32(own(input, "blockHash"), false),
    blockNumber = escrowUint(own(input, "blockNumber")), transactionIndex = index(own(input, "transactionIndex")),
    from = escrowAddress(own(input, "from")), to = escrowAddress(own(input, "to")),
    gasUsed = escrowUint(own(input, "gasUsed")), gasPrice = escrowUint(own(input, "effectiveGasPrice"))
  escrowCheck(blockNumber > 0n && gasUsed > 0n)
  let last = -1
  const logs = array(own(input, "logs"), 128).map(log => {
    const logIndex = index(own(log, "logIndex"))
    escrowCheck(own(log, "removed") === false && own(log, "blockNumber") === blockNumber &&
      escrowBytes32(own(log, "blockHash"), false) === blockHash && escrowBytes32(own(log, "transactionHash"), false) === hash &&
      index(own(log, "transactionIndex")) === transactionIndex && logIndex > last)
    last = logIndex
    return Object.freeze({ address: escrowAddress(own(log, "address")),
      topics: Object.freeze(array(own(log, "topics"), 4).map(t => escrowBytes32(t))), data: bytes(own(log, "data")) })
  })
  return Object.freeze({ hash, blockHash, blockNumber, transactionIndex, from, to, gasUsed, gasPrice, logs: Object.freeze(logs) })
}
type Receipt = ReturnType<typeof captureReceipt>
function captureTransaction(input: unknown) {
  escrowCheck(own(input, "chainId") === 5042002 && own(input, "value") === 0n)
  return Object.freeze({ hash: escrowBytes32(own(input, "hash"), false), from: escrowAddress(own(input, "from")),
    to: escrowAddress(own(input, "to")), input: bytes(own(input, "input")), nonce: index(own(input, "nonce")),
    blockNumber: escrowUint(own(input, "blockNumber")), blockHash: escrowBytes32(own(input, "blockHash"), false) })
}
function captureSnapshot(input: unknown) {
  const r = escrowRecord(input, ["chainId", "escrow", "blockNumber", "blockHash", "timestamp", "jobId", "pendingClaimHash", "job"])
  escrowCheck(r.chainId === 5042002)
  return Object.freeze({ escrow: escrowAddress(r.escrow), blockNumber: escrowUint(r.blockNumber), blockHash: escrowBytes32(r.blockHash, false),
    timestamp: escrowSeconds(r.timestamp), jobId: escrowUint(r.jobId), pendingClaimHash: escrowBytes32(r.pendingClaimHash), job: captureEscrowJob(r.job) })
}
type Snapshot = ReturnType<typeof captureSnapshot>
function receiptMatches(r: Receipt, signed: EscrowSignedAction, sender: Hex, to: Hex) {
  escrowCheck(r.hash === signed.hash && r.from === sender && r.to === to && r.gasUsed <= signed.gas &&
    r.gasPrice <= signed.maxFeePerGas && r.gasUsed * r.gasPrice <= signed.gasCapWei)
}
function transactionMatches(tx: ReturnType<typeof captureTransaction>, r: Receipt, signed: EscrowSignedAction, data: Hex) {
  escrowCheck(tx.hash === signed.hash && tx.from === r.from && tx.to === r.to && tx.input === data && tx.nonce === signed.nonce &&
    tx.blockNumber === r.blockNumber && tx.blockHash === r.blockHash)
}
const scopedLogs = (r: Receipt, i: EscrowBuyerIntent) => r.logs.filter(l =>
  [i.call.escrow, i.call.token, i.call.hook].includes(l.address))
const sameLogs = (a: readonly ReturnType<typeof event>[], b: readonly ReturnType<typeof event>[]) => JSON.stringify(a) === JSON.stringify(b)
function createLog(i: EscrowBuyerIntent, jobId: bigint) {
  return event(i.call.escrow, "JobCreated(uint256,address,address,address,uint48,address)",
    [uint(jobId), addressTopic(i.client), addressTopic(i.call.provider)],
    encodeAbiParameters(parseAbiParameters("address,uint48,address"), [i.call.evaluator, i.expiredAt, i.call.hook]))
}
function createdId(i: EscrowBuyerIntent, r: Receipt): bigint {
  const logs = scopedLogs(r, i); escrowCheck(logs.length === 1 && logs[0]!.topics.length === 4)
  const id = escrowUint(BigInt(escrowBytes32(logs[0]!.topics[1], false)))
  escrowCheck(id > 0n && sameLogs(logs, [createLog(i, id)])); return id
}
/** Provisional lookup hint ONLY. Full canonical getJob readback must still prove the
 * description and providerAgentId omitted from JobCreated before budget/approval. */
export function escrowBuyerCreatedJobId(input: PreparedEscrowBuyerAction, signed: EscrowSignedAction, receipt: unknown): bigint {
  try {
    const a = captureOriginalEscrowBuyerAction(input); escrowCheck(a.kind === "create" && proven.get(signed) === a)
    const r = captureReceipt(receipt); receiptMatches(r, signed, a.sender, a.to); return createdId(a.intent, r)
  } catch { throw new EscrowFactsRefused() }
}
function jobMatches(i: EscrowBuyerIntent, s: Snapshot, r: Receipt, jobId: bigint, kind: "create" | "approve" | "fund" | "budget") {
  const j = s.job, c = i.call
  escrowCheck(jobId > 0n && s.jobId === jobId && s.escrow === c.escrow && s.blockNumber === r.blockNumber && s.blockHash === r.blockHash &&
    s.timestamp >= i.issuedAt && s.timestamp <= i.fundBy && s.pendingClaimHash === ERC8183_ZERO_HASH &&
    j.client === i.client && j.provider === c.provider && j.evaluator === c.evaluator && j.hook === c.hook &&
    j.providerAgentId === c.providerAgentId && j.description === i.description && j.expiredAt === i.expiredAt &&
    j.status === (kind === "fund" ? 1 : 0) && j.budget === (kind === "create" ? 0n : c.amount) &&
    j.paymentToken === (kind === "create" ? ERC8183_ZERO : c.token) && j.submittedAt === 0 && j.settledAmount === 0n &&
    (kind === "create" ? j.payoutReceiver === ERC8183_ZERO : j.payoutReceiver === ERC8183_ZERO || j.payoutReceiver === c.provider))
}
function proof(kind: "create" | "approve" | "fund" | "budget", i: EscrowBuyerIntent, jobId: bigint, r: Receipt, s: Snapshot) {
  return Object.freeze({ kind, chainId: 5042002 as const, escrow: i.call.escrow, intentId: i.id, jobId, txHash: r.hash,
    blockHash: r.blockHash, blockNumber: r.blockNumber, blockTimestamp: s.timestamp, gasWei: r.gasUsed * r.gasPrice,
    gasPayer: r.from, fundedAtomic: kind === "fund" ? i.call.amount : 0n })
}
/** after and allowance must be read independently at the receipt's identity-checked
 * canonical finalized block. This helper does not establish RPC honesty or finality. */
export function assertEscrowBuyerReceipt(input: PreparedEscrowBuyerAction, signed: EscrowSignedAction,
  transaction: unknown, receipt: unknown, after: unknown, allowanceAtomic?: bigint) {
  try {
    const a = captureOriginalEscrowBuyerAction(input); escrowCheck(proven.get(signed) === a)
    const i = a.intent, r = captureReceipt(receipt), tx = captureTransaction(transaction), s = captureSnapshot(after)
    receiptMatches(r, signed, a.sender, a.to); transactionMatches(tx, r, signed, a.data)
    const jobId = a.kind === "create" ? createdId(i, r) : escrowUint(a.jobId)
    jobMatches(i, s, r, jobId, a.kind)
    const logs = scopedLogs(r, i)
    const approval = (amount: bigint) => event(i.call.token, "Approval(address,address,uint256)",
      [addressTopic(i.client), addressTopic(i.call.escrow)], amountData(amount))
    if (a.kind === "create") escrowCheck(allowanceAtomic === undefined)
    else if (a.kind === "approve") escrowCheck(escrowUint(allowanceAtomic) === i.call.amount && sameLogs(logs, [approval(i.call.amount)]))
    else {
      escrowCheck(escrowUint(allowanceAtomic) === 0n)
      const transfer = event(i.call.token, "Transfer(address,address,uint256)",
        [addressTopic(i.client), addressTopic(i.call.escrow)], amountData(i.call.amount)),
        funded = event(i.call.escrow, "JobFunded(uint256,address,uint256)", [uint(jobId), addressTopic(i.client)], amountData(i.call.amount))
      // ERC-20 transferFrom may emit the exact consumed-allowance update. No arbitrary
      // token/hook/escrow event or native/system-emitter transfer can substitute.
      escrowCheck(sameLogs(logs, [transfer, funded]) || sameLogs(logs, [approval(0n), transfer, funded]) ||
        sameLogs(logs, [transfer, approval(0n), funded]))
    }
    return proof(a.kind, i, jobId, r, s)
  } catch { throw new EscrowFactsRefused() }
}
/** The signed relay bytes must be reconstructed from the independently fetched mined
 * transaction (not supplied as authority by the hub). Verify historical provider validity
 * at the receipt block, never use this as current signing permission. */
export async function assertEscrowBuyerBudgetReceipt(input: EscrowBuyerIntent, rawJobId: bigint, raw: unknown,
  transaction: unknown, receipt: unknown, after: unknown) {
  try {
    const i = captureOriginalEscrowBuyerIntent(input), jobId = escrowUint(rawJobId), tx = captureTransaction(transaction),
      r = captureReceipt(receipt), s = captureSnapshot(after)
    jobMatches(i, s, r, jobId, "budget")
    escrowCheck(typeof raw === "string" && /^0x02(?:[0-9a-fA-F]{2}){1,65535}$/.test(raw))
    const serialized = raw.toLowerCase() as `0x02${string}`, parsed = parseTransaction(serialized)
    escrowCheck(parsed.type === "eip1559" && parsed.data !== undefined)
    const decoded = decodeFunctionData({ abi: ERC8183_ABI, data: parsed.data })
    escrowCheck(decoded.functionName === "setBudgetWithAuthorization")
    const [id, token, amount, opts, auth] = decoded.args
    escrowCheck(id === jobId && escrowAddress(token) === i.call.token && amount === i.call.amount && opts === "0x" &&
      escrowAddress(auth.signer) === i.call.provider)
    const terms = captureEscrowTransactionTerms({ nonce: parsed.nonce, gas: parsed.gas, maxFeePerGas: parsed.maxFeePerGas,
      maxPriorityFeePerGas: parsed.maxPriorityFeePerGas ?? 0n, gasCapWei: escrowUint(parsed.gas) * escrowUint(parsed.maxFeePerGas) })
    // Everything used after these asynchronous cryptographic checks was already captured.
    const data = await encodeSetBudgetRelay({ chainId: 5042002, escrow: i.call.escrow, signer: i.call.provider,
      jobId, token: i.call.token, amount: i.call.amount, nonce: auth.nonce, deadline: auth.deadline }, auth.sig, s.timestamp)
    escrowCheck(data === parsed.data)
    const signed = await assertEscrowSignedTransaction({ sender: i.call.evaluator, to: i.call.escrow, data }, serialized, terms)
    receiptMatches(r, signed, i.call.evaluator, i.call.escrow); transactionMatches(tx, r, signed, data)
    const authorization = event(i.call.escrow, "AuthorizationUsed(address,bytes32)",
      [addressTopic(i.call.provider), packProviderNonce(i.call.provider, auth.nonce)], "0x"),
      budget = event(i.call.escrow, "BudgetSet(uint256,address,uint256)", [uint(jobId), addressTopic(i.call.token)], amountData(i.call.amount))
    escrowCheck(sameLogs(scopedLogs(r, i), [authorization, budget]))
    return proof("budget", i, jobId, r, s)
  } catch { throw new EscrowFactsRefused() }
}
