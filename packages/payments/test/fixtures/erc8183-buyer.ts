/** Source-shaped synthetic chain receipts; generated ephemeral keys, no RPC or sends. */
import { hashJson } from "@arcade/core"
import { encodeAbiParameters, encodeEventTopics, erc20Abi, keccak256, parseAbiParameters, type Abi, type Hex, type TransactionReceipt } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ERC8183_ABI } from "../../src/erc8183-abi.ts"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../../src/erc8183-codec.ts"
import { encodeSetBudgetRelay, packProviderNonce, setBudgetAuthorization } from "../../src/erc8183-auth.ts"
import { createEscrowBuyerIntent, prepareEscrowBuyerAction } from "../../src/erc8183-buyer-intent.ts"
import { assertEscrowBuyerSigned } from "../../src/erc8183-buyer-evidence.ts"
import { buildEscrowRequirements } from "../../src/erc8183-wire.ts"
export const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
export const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
export const buyer = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey()),
  evaluator = privateKeyToAccount(generatePrivateKey())
export async function buyerFixture(kind: "create" | "approve" | "fund" | "budget" = "create") {
  const identity = { chainId: 5042002, escrow: addr(10), implementation: addr(11), hook: addr(12),
    evaluator: evaluator.address.toLowerCase(), treasury: addr(4), token: "0x3600000000000000000000000000000000000000",
    proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const call = { chainId: 5042002, escrow: identity.escrow, hook: identity.hook, evaluator: identity.evaluator, token: identity.token,
    provider: provider.address.toLowerCase(), providerAgentId: 8n, amount: 300000n, method: "POST", skillId: "skill", skillVersion: "1.0.0",
    resource: "https://example.test/x/" + provider.address.toLowerCase() + "/skill", inputHash: hashJson({ fixture: true }), timeoutSeconds: 60 }
  const requirements = buildEscrowRequirements(identity, { priceAtomic: call.amount, resource: call.resource, payTo: call.provider,
    escrow: { skillId: call.skillId, skillVersion: call.skillVersion, inputHash: call.inputHash,
      providerAgentId: call.providerAgentId, timeoutSeconds: call.timeoutSeconds } }, 1800)
  const input = { identity, call, requirements, client: buyer.address, issuedAt: 1000, expiresInSeconds: 1800,
    capability: hash(77), maxAmountAtomic: 300000n, gasBudgetWei: 6000000n }, intent = createEscrowBuyerIntent(input)
  const deployment = { identity: intent.identity, chainId: 5042002 as const, escrow: identity.escrow,
    blockNumber: 50n, blockHash: hash(50), timestamp: 1000 }
  const job = { client: intent.client, provider: intent.call.provider, evaluator: intent.call.evaluator, hook: addr(12), providerAgentId: 8n,
    expiredAt: 2800, submittedAt: 0, settledAmount: 0n, payoutReceiver: ERC8183_ZERO, status: 0,
    budget: 300000n, paymentToken: intent.call.token, description: intent.description }
  const snapshot = { chainId: 5042002, escrow: identity.escrow, blockNumber: 50n, blockHash: hash(50), timestamp: 1000,
    jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job }
  const action = kind === "budget" ? undefined : prepareEscrowBuyerAction(intent, kind === "create" ? deployment : snapshot,
    kind === "create" ? { kind } : { kind, jobId: 7n, allowanceAtomic: kind === "approve" ? 0n : 300000n }, 1000)
  const auth = { chainId: 5042002, escrow: intent.call.escrow, signer: intent.call.provider, jobId: 7n, token: intent.call.token,
    amount: 300000n, nonce: 2n, deadline: 1600n }, signature = await provider.signTypedData(setBudgetAuthorization(auth, 1000))
  const budgetData = await encodeSetBudgetRelay(auth, signature, 1000)
  const transaction = { type: "eip1559" as const, chainId: 5042002, to: action?.to ?? intent.call.escrow,
    value: 0n, data: action?.data ?? budgetData, nonce: 3, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n }
  const terms = { nonce: 3, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n, gasCapWei: 2000000n }
  const signer = kind === "budget" ? evaluator : buyer, raw = await signer.signTransaction(transaction), txHash = keccak256(raw)
  const signed = action === undefined ? undefined : await assertEscrowBuyerSigned(action, raw, terms)
  const logs: TransactionReceipt["logs"] = []
  const event = (address: Hex, abi: Abi, eventName: string, args: Record<string, unknown>, data: Hex) => ({
    address, topics: encodeEventTopics({ abi, eventName, args }) as [Hex, ...Hex[]], data, logIndex: logs.length,
    blockNumber: 51n, blockHash: hash(51), transactionHash: txHash, transactionIndex: 0, removed: false
  })
  const amount = (value: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [value])
  const approval = (value: bigint) => event(intent.call.token, erc20Abi, "Approval", { owner: intent.client, spender: intent.call.escrow }, amount(value))
  if (kind === "create") logs.push(event(intent.call.escrow, ERC8183_ABI, "JobCreated", {
    jobId: 7n, client: intent.client, provider: intent.call.provider
  }, encodeAbiParameters(parseAbiParameters("address,uint48,address"), [intent.call.evaluator, 2800, intent.call.hook])))
  if (kind === "approve") logs.push(approval(300000n))
  if (kind === "fund") {
    logs.push(event(intent.call.token, erc20Abi, "Transfer", { from: intent.client, to: intent.call.escrow }, amount(300000n)))
    logs.push(event(intent.call.escrow, ERC8183_ABI, "JobFunded", { jobId: 7n, client: intent.client }, amount(300000n)))
  }
  if (kind === "budget") {
    logs.push(event(intent.call.escrow, ERC8183_ABI, "AuthorizationUsed", { signer: intent.call.provider,
      nonce: packProviderNonce(intent.call.provider, 2n) }, "0x"))
    logs.push(event(intent.call.escrow, ERC8183_ABI, "BudgetSet", { jobId: 7n, token: intent.call.token }, amount(300000n)))
  }
  const receipt: TransactionReceipt = { transactionHash: txHash, blockNumber: 51n, blockHash: hash(51), transactionIndex: 0,
    from: signer.address, to: transaction.to, status: "success", type: "eip1559", gasUsed: 100000n, effectiveGasPrice: 2n,
    cumulativeGasUsed: 100000n, contractAddress: null, logsBloom: "0x", logs }
  const tx = { hash: txHash, from: signer.address, to: transaction.to, input: transaction.data, value: 0n, nonce: 3,
    chainId: 5042002, blockNumber: 51n, blockHash: hash(51) }
  const after = { ...snapshot, blockNumber: 51n, blockHash: hash(51), timestamp: 1001, job: { ...job,
    status: kind === "fund" ? 1 : 0, budget: kind === "create" ? 0n : 300000n, paymentToken: kind === "create" ? ERC8183_ZERO : intent.call.token } }
  return { input, intent, action, transaction, terms, raw, signed, receipt, tx, after, snapshot, auth, approval,
    allowanceAtomic: kind === "approve" ? 300000n : kind === "fund" ? 0n : undefined }
}
