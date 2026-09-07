import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Abi, type Hex, type TransactionReceipt } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ERC8183_ABI, ARCADE_JOB_HOOK_ABI } from "../../src/erc8183-abi.ts"
import { parseAbi } from "viem"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../../src/erc8183-codec.ts"
import { escrowActionContext, prepareEscrowAction, type PreparedEscrowAction } from "../../src/erc8183-actions.ts"
import { assertEscrowActionReceipt, assertEscrowSignedAction } from "../../src/erc8183-evidence.ts"
import { setBudgetAuthorization, submitAuthorization } from "../../src/erc8183-auth.ts"
import { escrowRequestDescription } from "../../src/erc8183-request.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
const evaluator = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey())
const tokenAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"])
const amountData = (n: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [n])
async function fixture(kind: PreparedEscrowAction["kind"] = "complete", amount = 300000n,
  options: { capability?: Hex; submittedAt?: number; timestamp?: number; blockNumber?: bigint; nonce?: number;
    inputHash?: Hex; outputHash?: Hex; hubJobId?: string;
    receiptTree?: { treeHash: Hex; childCount: number; childTotalAtomic: bigint } } = {}) {
  const now = options.timestamp ?? 1000, block = options.blockNumber ?? 50n, nonce = options.nonce ?? 3
  const afterBlock = block + 1n, afterHash = hash(Number(afterBlock))
  let context = escrowActionContext({ call: { chainId: 5042002, escrow: addr(10), hook: addr(4), evaluator: evaluator.address,
    token: "0x3600000000000000000000000000000000000000", provider: provider.address, providerAgentId: 8n,
    amount, resource: "https://example.test/x/seller/skill", method: "POST", skillId: "skill",
    skillVersion: "1.0.0", inputHash: options.inputHash ?? hash(99), timeoutSeconds: 60 },
    jobId: 7n, client: addr(1), expiredAt: 2000, requestHash: hash(88), treasury: addr(5) })
  if (options.capability !== undefined) context = escrowActionContext({ ...context,
    requestHash: escrowRequestDescription(context.call, context.client, context.expiredAt, options.capability)
      .slice("arcade:erc8183:request:v1:".length) })
  const c = context.call
  const snapshot = { chainId: 5042002, escrow: c.escrow, blockNumber: block, blockHash: hash(Number(block)), timestamp: now,
    jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job: { client: context.client, status: kind === "budget" ? 0 : kind === "complete" ? 2 : 1,
      provider: c.provider, expiredAt: 2000, evaluator: c.evaluator, submittedAt: kind === "complete" ? (options.submittedAt ?? 900) : 0,
      budget: kind === "budget" ? 0n : amount, hook: c.hook, paymentToken: kind === "budget" ? ERC8183_ZERO : c.token,
      providerAgentId: 8n, description: "arcade:erc8183:request:v1:" + context.requestHash, settledAmount: 0n, payoutReceiver: ERC8183_ZERO } }
  const base = { chainId: 5042002, escrow: c.escrow, signer: provider.address, jobId: 7n, nonce: 2n, deadline: BigInt(now + 600) }
  const input = kind === "budget" ? { kind, nonce: 2n, deadline: base.deadline,
    signature: await provider.signTypedData(setBudgetAuthorization({ ...base, token: c.token, amount }, now)) } :
    kind === "submit" ? { kind, nonce: 2n, deadline: base.deadline, outputHash: options.outputHash ?? hash(9),
      signature: await provider.signTypedData(submitAuthorization({ ...base, deliverable: options.outputHash ?? hash(9) }, now)) } :
    kind === "reject" ? { kind, reason: "output_invalid" } : { kind, receipt: { hubJobId: options.hubJobId ?? "job_" + "a".repeat(32),
      outputHash: options.outputHash ?? hash(9), ...(options.receiptTree ?? { treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n }) } }
  const action = await prepareEscrowAction(context, snapshot, input, now)
  const transaction = { type: "eip1559" as const, chainId: 5042002, to: c.escrow, value: 0n,
    data: action.data, nonce, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n }
  const terms = { nonce, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n, gasCapWei: 2000000n }
  const raw = await evaluator.signTransaction(transaction), signed = await assertEscrowSignedAction(action, raw, terms)
  const logs: TransactionReceipt["logs"] = []
  const event = (address: Hex, abi: Abi, eventName: string, args: Record<string, unknown>, data: Hex) => logs.push({
    address, topics: encodeEventTopics({ abi, eventName, args }) as [Hex, ...Hex[]], data, logIndex: logs.length,
    blockNumber: afterBlock, blockHash: afterHash, transactionHash: signed.hash, transactionIndex: 0, removed: false
  })
  const transfer = (to: Hex, n: bigint) => event(c.token, tokenAbi, "Transfer", { from: c.escrow, to }, amountData(n))
  if (kind === "budget" || kind === "submit") {
    event(c.escrow, ERC8183_ABI, "AuthorizationUsed", { signer: c.provider, nonce: action.providerNonce }, "0x")
    if (kind === "budget") event(c.escrow, ERC8183_ABI, "BudgetSet", { jobId: 7n, token: c.token }, amountData(amount))
    else event(c.escrow, ERC8183_ABI, "JobSubmitted", { jobId: 7n, provider: c.provider }, options.outputHash ?? hash(9))
  } else if (kind === "reject") {
    transfer(context.client, amount)
    event(c.escrow, ERC8183_ABI, "Refunded", { jobId: 7n, client: context.client }, amountData(amount))
    event(c.escrow, ERC8183_ABI, "JobRejected", { jobId: 7n, rejector: c.evaluator }, action.reason!)
    event(c.hook, ARCADE_JOB_HOOK_ABI, "ArcadeRefused", { jobId: 7n }, action.reason!)
  } else {
    const fee = amount * 500n / 10000n
    if (fee > 0n) {
      transfer(context.treasury, fee)
      event(c.escrow, ERC8183_ABI, "PlatformFeePaid", { jobId: 7n, treasury: context.treasury }, amountData(fee))
    }
    transfer(c.provider, amount - fee)
    event(c.escrow, ERC8183_ABI, "PaymentReleased", { jobId: 7n, recipient: c.provider }, amountData(amount - fee))
    event(c.escrow, ERC8183_ABI, "JobCompleted", { jobId: 7n, evaluator: c.evaluator }, action.reason!)
    event(c.hook, ARCADE_JOB_HOOK_ABI, "ArcadeSettled", { jobId: 7n },
      encodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"), [action.receipt!.tree.treeHash,
        action.receipt!.tree.childCount, action.receipt!.tree.childTotalAtomic, action.receipt!.hash]))
  }
  const receipt: TransactionReceipt = { transactionHash: signed.hash, blockNumber: afterBlock, blockHash: afterHash, transactionIndex: 0,
    from: c.evaluator, to: c.escrow, status: "success", type: "eip1559", gasUsed: 100000n, effectiveGasPrice: 2n,
    cumulativeGasUsed: 100000n, contractAddress: null, logsBloom: "0x", logs }
  const mined = { hash: signed.hash, from: c.evaluator, to: c.escrow, input: action.data, value: 0n, nonce,
    chainId: 5042002, blockNumber: afterBlock, blockHash: afterHash }
  const after = { ...snapshot, blockNumber: afterBlock, blockHash: afterHash, timestamp: now + 1,
    job: { ...snapshot.job, budget: amount, paymentToken: c.token,
      status: ({ budget: 0, submit: 2, complete: 3, reject: 4 } as const)[kind],
      submittedAt: kind === "submit" ? now + 1 : snapshot.job.submittedAt } }
  return { context, action, transaction, terms, raw, signed, logs, receipt, mined, after, snapshot, input }
}

export { fixture, addr, hash, evaluator, provider, amountData }
