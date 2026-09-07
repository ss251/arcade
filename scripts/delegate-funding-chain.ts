/** Bounded Arc-only chain driver for the owned J5C proof. No key lookup on import. */
import { createPublicClient, custom, defineChain, erc20Abi, parseAbi, TransactionReceiptNotFoundError, type Hex,
  type TransactionReceipt, type TransactionSerializableEIP1559 } from "viem"
import type { privateKeyToAccount } from "viem/accounts"
import { boundedFundingJson } from "../packages/buyer/src/gateway-funding-runtime.ts"
import { fundingDeployment } from "../packages/buyer/src/gateway-funding.ts"
import { assertDelegateProofIdentity, assertFreshDelegateProof, assertProofSignedTransaction, assertOwnerProofLogs, DELEGATE_PROOF as P,
  ownerProofCall, proofAddress, proofCheck, proofFail, proofHash, readDelegateAvailable,
  type DelegateProofSnapshot, type OwnerProofStep } from "./delegate-funding-proof.ts"

type Account = ReturnType<typeof privateKeyToAccount>
const ABI = parseAbi(["function totalBalance(address token,address depositor) view returns(uint256)",
  "function withdrawalDelay() view returns(uint256)", "function isAuthorizedForBalance(address token,address depositor,address addr) view returns(bool)",
  "function tokenMintAuthority(address token) view returns(address)", "function isMinter(address account) view returns(bool)",
  "function owner() view returns(address)", "function paused() view returns(bool)", "function domain() view returns(uint32)",
  "function isTokenSupported(address token) view returns(bool)"])
const READ = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt", "eth_call",
  "eth_getBalance", "eth_blockNumber", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getTransactionCount",
  "eth_estimateGas", "eth_gasPrice", "eth_getLogs"])
const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [P.rpc] } } })
export interface ProofChainOptions {
  readonly signal: AbortSignal; readonly deadlineMs: number
  readonly fetch?: typeof fetch
  /** Trusted offline clock seam; production uses Date.now. */
  readonly wallNow?: () => number
}
export interface OwnerProofReceipt {
  readonly txHash: Hex; readonly blockHash: Hex; readonly blockNumber: bigint; readonly gasWei: bigint
  readonly receipt: TransactionReceipt
}
export function createDelegateProofChain(options: ProofChainOptions) {
  const request = options.fetch ?? globalThis.fetch, wallNow = options.wallNow ?? Date.now
  const { signal, deadlineMs } = options
  proofCheck(Number.isFinite(deadlineMs) && deadlineMs > performance.now() && deadlineMs <= performance.now() + 600000)
  let requests = 0, requestId = 0, ownerStepIndex = 0, ownerBusy = false, ownerPoisoned = false
  const sent = new Set<Hex>()
  const active = () => proofCheck(!signal.aborted && performance.now() < deadlineMs)
  async function wire(method: string, params: readonly unknown[], mutation = false): Promise<unknown> {
    active(); proofCheck(++requests <= 800 && (mutation ? method === "eth_sendRawTransaction" : READ.has(method)))
    const id = ++requestId
    const raw = await boundedFundingJson(request, P.rpc, "POST", JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal, deadlineMs)
    active()
    const response = raw as { id?: unknown; jsonrpc?: unknown; result?: unknown; error?: unknown }
    proofCheck(response && typeof response === "object" && response.id === id && response.jsonrpc === "2.0" &&
      Object.hasOwn(response, "result") && !Object.hasOwn(response, "error"))
    return response.result
  }
  const client = createPublicClient({ chain, cacheTime: 0, batch: { multicall: false }, transport: custom({
    request: ({ method, params }) => wire(method, (params ?? []) as readonly unknown[])
  }, { retryCount: 0 }) })
  async function finalized() {
    proofCheck(await client.getChainId() === 5042002)
    const block = await client.getBlock({ blockTag: "finalized", includeTransactions: false })
    active()
    proofCheck(block.number !== null && block.hash !== null && block.number > 0n &&
      Number.isSafeInteger(wallNow()) && block.timestamp * 1000n >= BigInt(wallNow() - 30000) &&
      block.timestamp * 1000n <= BigInt(wallNow() + 5000))
    return { blockNumber: block.number, blockHash: proofHash(block.hash), timestamp: block.timestamp }
  }
  async function canonical(blockNumber: bigint, blockHash: Hex) {
    const block = await client.getBlock({ blockNumber, includeTransactions: false }); active()
    proofCheck(block.number === blockNumber && block.hash?.toLowerCase() === blockHash)
  }
  async function identity(blockNumber: bigint) {
    for (const role of ["wallet", "minter"] as const) {
      const proxy = P[role], proxyCode = await client.getCode({ address: proxy, blockNumber })
      const slot = await client.getStorageAt({ address: proxy, slot: fundingDeployment.implementationSlot, blockNumber })
      proofCheck(slot && /^0x0{24}[0-9a-fA-F]{40}$/.test(slot))
      const implementation = proofAddress("0x" + slot.slice(-40))
      const code = await client.getCode({ address: implementation, blockNumber })
      assertDelegateProofIdentity(role, proxyCode, slot, code)
      proofCheck(await client.readContract({ address: proxy, abi: ABI, functionName: "domain", blockNumber }) === 26 &&
        !await client.readContract({ address: proxy, abi: ABI, functionName: "paused", blockNumber }) &&
        await client.readContract({ address: proxy, abi: ABI, functionName: "isTokenSupported", args: [P.token], blockNumber }))
    }
    proofCheck(await client.readContract({ address: P.minter, abi: ABI, functionName: "tokenMintAuthority", args: [P.token], blockNumber }) === "0x" + "00".repeat(20) &&
      await client.readContract({ address: P.token, abi: ABI, functionName: "isMinter", args: [P.minter], blockNumber }) &&
      proofAddress(await client.readContract({ address: P.minter, abi: ABI, functionName: "owner", blockNumber })))
    active()
  }
  async function available() {
    const raw = await boundedFundingJson(request, "https://gateway-api-testnet.circle.com/v1/balances", "POST",
      JSON.stringify({ token: "USDC", sources: [{ domain: 26, depositor: P.owner }] }), signal, deadlineMs)
    active(); return readDelegateAvailable(raw)
  }
  async function snapshot(): Promise<DelegateProofSnapshot> {
    const block = await finalized(); await identity(block.blockNumber)
    const at = { blockNumber: block.blockNumber }
    const ownerNativeWei = await client.getBalance({ address: P.owner, ...at })
    const delegateNativeWei = await client.getBalance({ address: P.delegate, ...at })
    const allowance = await client.readContract({ address: P.token, abi: erc20Abi, functionName: "allowance", args: [P.owner, P.wallet], ...at })
    const ownerGatewayTotal = await client.readContract({ address: P.wallet, abi: ABI, functionName: "totalBalance", args: [P.token, P.owner], ...at })
    const authorized = await client.readContract({ address: P.wallet, abi: ABI, functionName: "isAuthorizedForBalance", args: [P.token, P.owner, P.delegate], ...at })
    const withdrawalDelay = await client.readContract({ address: P.wallet, abi: ABI, functionName: "withdrawalDelay", ...at })
    const balance = await available()
    await canonical(block.blockNumber, block.blockHash)
    return Object.freeze({ ...block, ownerNativeWei, delegateNativeWei, allowance, ownerGatewayTotal, authorized, withdrawalDelay, ...balance })
  }
  async function pause(ms: number) {
    active(); proofCheck(Number.isSafeInteger(ms) && ms >= 0 && ms <= 1000)
    await new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); signal.removeEventListener("abort", stop); reject(Error("proof_cancelled")) }
      const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve() }, ms)
      signal.addEventListener("abort", stop, { once: true }); if (signal.aborted) stop()
    })
    active()
  }
  async function confirmed(txHash: Hex, sender: Hex, to: Hex): Promise<OwnerProofReceipt> {
    proofCheck(proofHash(txHash) === txHash && proofAddress(sender) === sender && proofAddress(to) === to)
    for (let count = 0; count < 60; count++) {
      let receipt: TransactionReceipt
      try { receipt = await client.getTransactionReceipt({ hash: txHash }) }
      catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; await pause(1000); continue }
      proofCheck(receipt.status === "success" && proofHash(receipt.transactionHash) === txHash &&
        proofAddress(receipt.from) === sender && proofAddress(receipt.to) === to && receipt.logs.length <= 128 &&
        receipt.gasUsed > 0n && receipt.effectiveGasPrice > 0n)
      const final = await finalized()
      if (receipt.blockNumber > final.blockNumber) { await pause(1000); continue }
      const blockHash = proofHash(receipt.blockHash)
      for (const log of receipt.logs) proofCheck(log.removed === false && proofHash(log.blockHash) === blockHash &&
        log.blockNumber === receipt.blockNumber && proofHash(log.transactionHash) === txHash)
      await canonical(receipt.blockNumber, blockHash)
      const tx = await client.getTransaction({ hash: txHash })
      proofCheck(proofHash(tx.hash) === txHash && proofAddress(tx.from) === sender && proofAddress(tx.to) === to &&
        tx.chainId === 5042002 && tx.blockNumber === receipt.blockNumber && proofHash(tx.blockHash) === blockHash)
      active()
      return Object.freeze({ txHash, blockHash, blockNumber: receipt.blockNumber,
        gasWei: receipt.gasUsed * receipt.effectiveGasPrice, receipt })
    }
    return proofFail()
  }
  async function ownerStep(step: OwnerProofStep, acquire: () => Promise<Account>,
    prepared: (txHash: Hex, transaction: TransactionSerializableEIP1559) => Promise<void>): Promise<OwnerProofReceipt> {
    proofCheck(!ownerBusy && !ownerPoisoned && ["grant", "approval", "deposit"][ownerStepIndex] === step)
    ownerBusy = true; ownerStepIndex++
    try {
      const before = await snapshot()
      if (step === "grant") assertFreshDelegateProof(before)
      else proofCheck(before.authorized && before.ownerGatewayTotal === 0n && before.available === 0n &&
        before.pendingBatch === 0n && before.allowance === (step === "approval" ? 0n : P.depositAtomic))
      const call = ownerProofCall(step)
      const gas = (await client.estimateGas({ account: P.owner, ...call }) * 12n + 9n) / 10n
      const maxFeePerGas = await client.getGasPrice() * 2n
      proofCheck(gas > 0n && maxFeePerGas > 0n && gas * maxFeePerGas <= P.perTransactionGasCapWei &&
        before.ownerNativeWei >= gas * maxFeePerGas + (step === "deposit" ? P.depositAtomic * 1000000000000n : 0n))
      const nonce = await client.getTransactionCount({ address: P.owner, blockTag: "pending" })
      const transaction: TransactionSerializableEIP1559 = { type: "eip1559", chainId: 5042002, ...call,
        nonce, gas, maxFeePerGas, maxPriorityFeePerGas: 0n }
      const account = await acquire(); active(); proofCheck(proofAddress(account.address) === P.owner)
      const signingBlock = await finalized(); await identity(signingBlock.blockNumber)
      proofCheck(await client.getTransactionCount({ address: P.owner, blockTag: "pending" }) === nonce)
      const raw = await account.signTransaction(transaction); active()
      const txHash = await assertProofSignedTransaction(raw, transaction, P.owner)
      await prepared(txHash, transaction); active()
      // A slow journal/signing callback must not send against a changed nonce or deployment.
      const sendingBlock = await finalized(); await identity(sendingBlock.blockNumber)
      proofCheck(await client.getTransactionCount({ address: P.owner, blockTag: "pending" }) === nonce)
      proofCheck(!sent.has(txHash) && sent.size < 3); sent.add(txHash)
      proofCheck(proofHash(await wire("eth_sendRawTransaction", [raw], true)) === txHash)
      const result = await confirmed(txHash, P.owner, call.to)
      proofCheck(result.gasWei <= P.perTransactionGasCapWei)
      assertOwnerProofLogs(step, result.receipt.logs)
      const at = { blockNumber: result.blockNumber }
      proofCheck(await client.readContract({ address: P.wallet, abi: ABI, functionName: "isAuthorizedForBalance", args: [P.token, P.owner, P.delegate], ...at }))
      proofCheck(await client.readContract({ address: P.token, abi: erc20Abi, functionName: "allowance", args: [P.owner, P.wallet], ...at }) ===
        (step === "approval" ? P.depositAtomic : 0n))
      proofCheck(await client.readContract({ address: P.wallet, abi: ABI, functionName: "totalBalance", args: [P.token, P.owner], ...at }) ===
        (step === "deposit" ? P.depositAtomic : 0n))
      const afterNative = await client.getBalance({ address: P.owner, ...at })
      proofCheck(before.ownerNativeWei - afterNative === result.gasWei + (step === "deposit" ? P.depositAtomic * 1000000000000n : 0n))
      await canonical(result.blockNumber, result.blockHash)
      return result
    } catch { ownerPoisoned = true; return proofFail() }
    finally { ownerBusy = false }
  }
  return Object.freeze({ client, snapshot, identity, finalized, canonical, available, confirmed, ownerStep, pause,
    read: (method: string, params: readonly unknown[]) => wire(method, params),
    counts: () => ({ rpcReadsAndSends: requests, ownerBroadcasts: sent.size }) })
}
export type DelegateProofChain = ReturnType<typeof createDelegateProofChain>
