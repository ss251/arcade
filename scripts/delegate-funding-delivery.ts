/** Task5C delivery and reconciliation. Import-safe; no key lookup or auto-run. */
import { decodeEventLog, encodeEventTopics, keccak256, padHex, parseAbi, toHex,
  type Hex, type TransactionSerializableEIP1559 } from "viem"
import type { privateKeyToAccount } from "viem/accounts"
import { boundedFundingJson } from "../packages/buyer/src/gateway-funding-runtime.ts"
import { fundingRecord, parseFundingAmount } from "../packages/buyer/src/gateway-funding.ts"
import { createUnifiedRuntime } from "../packages/buyer/src/unified-balance-runtime.ts"
import { parseUnifiedFundingCommand } from "../packages/buyer/src/unified-balance-cli.ts"
import { assertUnifiedMint, captureUnifiedBurn, encodeUnifiedTransferSpec, type UnifiedBurn } from "../packages/buyer/src/unified-balance-guards.ts"
import { DELEGATE_PROOF as P, delegateProofPlan, assertDelegateMintLogs, assertProofSignedTransaction,
  proofCheck, proofFail, proofAddress, proofHash } from "./delegate-funding-proof.ts"
import type { DelegateProofChain } from "./delegate-funding-chain.ts"
import type { DelegateProofJournal } from "./delegate-funding-journal.ts"
type Account = ReturnType<typeof privateKeyToAccount>
const TRANSFER_URL = "https://gateway-api-testnet.circle.com/v1/transfer"
/** Pinned normal Gateway response schema, separately from the signed maximum fee. */
export function delegateActualFee(input: unknown, specHash: Hex, maxFee: bigint): bigint {
  // fundingRecord intentionally rejects arrays; capture this one schema array
  // without evaluating accessors or loosening the general funding codec.
  proofCheck(input && typeof input === "object" && !Array.isArray(input) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(input)))
  const r: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    proofCheck(typeof key === "string" && ["token", "total", "perIntent", "forwardingFee"].includes(key))
    const d = Object.getOwnPropertyDescriptor(input, key)
    proofCheck(d && d.enumerable && "value" in d); r[key] = d.value
  }
  proofCheck(r.token === "USDC" && Array.isArray(r.perIntent) && r.perIntent.length === 1 &&
    Object.getPrototypeOf(r.perIntent) === Array.prototype && Reflect.ownKeys(r.perIntent).length === 2)
  const item = Object.getOwnPropertyDescriptor(r.perIntent, "0")
  proofCheck(item && item.enumerable && "value" in item)
  const row = fundingRecord(item.value, ["transferSpecHash", "domain", "baseFee"], ["transferFee"])
  proofCheck(proofHash(row.transferSpecHash) === specHash && row.domain === 26)
  const actual = parseFundingAmount(r.total), base = parseFundingAmount(row.baseFee)
  const transfer = Object.hasOwn(row, "transferFee") ? parseFundingAmount(row.transferFee) : 0n
  proofCheck(actual === base + transfer && actual <= maxFee &&
    (!Object.hasOwn(r, "forwardingFee") || parseFundingAmount(r.forwardingFee) === 0n))
  return actual
}
const BURN_EVENTS = parseAbi(["event GatewayBurned(address indexed token,address indexed depositor,bytes32 indexed transferSpecHash,uint32 destinationDomain,bytes32 destinationRecipient,address signer,uint256 value,uint256 fee,uint256 fromAvailable,uint256 fromWithdrawing)",
  "event InsufficientBalance(address indexed token,address indexed depositor,uint256 expectedValue,uint256 available,uint256 withdrawing)"])
export function assertDelegateSourceLog(input: { address: Hex; topics: readonly Hex[]; data: Hex }, specHash: Hex, actualFee: bigint): void {
  proofCheck(proofAddress(input.address) === P.wallet && actualFee >= 0n && actualFee <= P.feeCapAtomic)
  const decoded = decodeEventLog({ abi: BURN_EVENTS, topics: input.topics as [Hex, ...Hex[]], data: input.data, strict: true })
  proofCheck(decoded.eventName === "GatewayBurned")
  const e = decoded.args
  proofCheck(proofAddress(e.token) === P.token && proofAddress(e.depositor) === P.owner && proofHash(e.transferSpecHash) === specHash &&
    e.destinationDomain === 26 && e.destinationRecipient.toLowerCase() === padHex(P.delegate, { size: 32 }) &&
    proofAddress(e.signer) === P.delegate && e.value === P.deliveryAtomic && e.fee === actualFee &&
    e.fromAvailable === P.deliveryAtomic + actualFee && e.fromWithdrawing === 0n)
}
/** Keyless reconciliation; absence of Circle's source batch is pending, not success. */
export async function inspectDelegateSource(chain: DelegateProofChain, specHash: Hex, actualFee: bigint, firstBlock: bigint) {
  const last = await chain.finalized()
  proofCheck(firstBlock > 0n && last.blockNumber >= firstBlock && last.blockNumber - firstBlock < 10000n)
  const topics = encodeEventTopics({ abi: BURN_EVENTS, eventName: "GatewayBurned", args: { token: P.token, depositor: P.owner, transferSpecHash: specHash } }) as Hex[]
  const raw = await chain.read("eth_getLogs", [{ address: P.wallet, fromBlock: toHex(firstBlock), toBlock: toHex(last.blockNumber), topics }])
  proofCheck(Array.isArray(raw) && raw.length <= 1)
  if (!raw.length) return Object.freeze({ sourceDebit: "pending" as const })
  const row = raw[0]
  proofCheck(row && row.removed === false && typeof row.blockNumber === "string" && /^0x[0-9a-f]+$/.test(row.blockNumber))
  assertDelegateSourceLog(row, specHash, actualFee)
  const hash = proofHash(row.transactionHash), blockNumber = BigInt(row.blockNumber), blockHash = proofHash(row.blockHash)
  proofCheck(blockNumber >= firstBlock && blockNumber <= last.blockNumber)
  const tx = await chain.client.getTransaction({ hash })
  proofCheck(tx.value === 0n && proofAddress(tx.to) === P.wallet)
  const proved = await chain.confirmed(hash, proofAddress(tx.from), P.wallet)
  proofCheck(proved.blockHash === blockHash && proved.blockNumber === blockNumber)
  const insufficientTopic = encodeEventTopics({ abi: BURN_EVENTS, eventName: "InsufficientBalance" })[0]
  let matches = 0
  for (const log of proved.receipt.logs) {
    if (proofAddress(log.address) !== P.wallet) continue
    proofCheck(log.topics[0] !== insufficientTopic)
    if (log.topics.length === topics.length && log.topics.every((t, i) => t.toLowerCase() === topics[i]?.toLowerCase()) &&
      log.data === row.data && log.logIndex === Number(BigInt(row.logIndex))) {
      assertDelegateSourceLog(log, specHash, actualFee); matches++
    }
  }
  proofCheck(matches === 1); await chain.identity(blockNumber); await chain.canonical(blockNumber, blockHash)
  return Object.freeze({ sourceDebit: "confirmed" as const, sourceTxHash: hash, blockNumber, blockHash })
}
export interface DelegateDeliveryOptions {
  readonly chain: DelegateProofChain; readonly journal: DelegateProofJournal; readonly fundJournalPath: string
  readonly maxBurnBlockDelta: bigint; readonly signal: AbortSignal; readonly deadlineMs: number
  readonly acquireDelegate: () => Promise<Account>; readonly fetch?: typeof fetch
}
export function createDelegateDelivery(options: DelegateDeliveryOptions) {
  const originalFetch = options.fetch ?? globalThis.fetch, plan = delegateProofPlan(), { chain, journal, signal, deadlineMs } = options
  const command = parseUnifiedFundingCommand(["fund", "--from-unified-balance", "--owner", P.owner, "--source", "Arc_Testnet",
    "--amount", "0.25", "--delegate", P.delegate, "--journal", options.fundJournalPath, "--max-burn-block-delta", String(options.maxBurnBlockDelta)])
  proofCheck(command.kind === "fund" && command.feeCapAtomic === P.feeCapAtomic && command.gasCapWei === P.perTransactionGasCapWei)
  const active = () => proofCheck(!signal.aborted && performance.now() < deadlineMs)
  let attempted = false, transferAttempted = false, burn: UnifiedBurn | undefined, specHash: Hex | undefined
  let actualFee: bigint | undefined, mintHash: Hex | undefined, beforeMintNative: bigint | undefined, mintSigned = false
  let signatureClaimed = false
  const readySnapshot = async () => {
    const s = await chain.snapshot(); active()
    proofCheck(s.authorized && s.allowance === 0n && s.ownerGatewayTotal === P.depositAtomic &&
      s.available === P.depositAtomic && s.pendingBatch === 0n && s.delegateNativeWei >= P.perTransactionGasCapWei)
    return s
  }
  const observedFetch = (async (input, init) => {
    if (String(input) !== TRANSFER_URL) return originalFetch(input, init)
    active(); proofCheck(!transferAttempted && burn && specHash && init?.method === "POST" && typeof init.body === "string")
    transferAttempted = true
    const raw = await boundedFundingJson(originalFetch, TRANSFER_URL, "POST", init.body, signal, deadlineMs)
    proofCheck(raw && typeof raw === "object" && !Array.isArray(raw))
    actualFee = delegateActualFee((raw as Record<string, unknown>).fees, specHash, burn.message.maxFee)
    active()
    // Preserve the SDK response in memory only. Never persist its attestation/signature.
    return Response.json(raw)
  }) as typeof fetch
  const runtime = () => createUnifiedRuntime({ env: { ARCADE_NETWORK: "arc-testnet" }, signal,
    deadlineMs: Math.min(deadlineMs, performance.now() + 300000), fetch: observedFetch,
    acquireAccount: async () => {
      await readySnapshot()
      const account = await options.acquireDelegate(); active(); proofCheck(proofAddress(account.address) === P.delegate)
      return { ...account,
        signTypedData: async input => {
          active(); proofCheck(!signatureClaimed); signatureClaimed = true
          const s = await readySnapshot()
          burn = captureUnifiedBurn(input, plan, { sourceBlock: s.blockNumber, withdrawalDelay: s.withdrawalDelay,
            maxFeeAtomic: P.feeCapAtomic, maxBurnBlockDelta: options.maxBurnBlockDelta })
          specHash = keccak256(encodeUnifiedTransferSpec(burn))
          await journal.append("burn_prepared", { specHash, maxFee: burn.message.maxFee, maxBlockHeight: burn.message.maxBlockHeight })
          active()
          return account.signTypedData(burn)
        },
        signTransaction: async input => {
          active(); proofCheck(!mintSigned && burn && specHash && actualFee !== undefined && transferAttempted)
          mintSigned = true
          const block = await chain.finalized(); await chain.identity(block.blockNumber)
          const tx = input as TransactionSerializableEIP1559
          assertUnifiedMint({ to: tx.to, data: tx.data, value: tx.value ?? 0n }, burn, block.blockNumber)
          beforeMintNative = await chain.client.getBalance({ address: P.delegate, blockNumber: block.blockNumber })
          proofCheck(beforeMintNative >= P.perTransactionGasCapWei)
          const raw = await account.signTransaction(tx); active()
          mintHash = await assertProofSignedTransaction(raw, tx, P.delegate)
          return raw
        }
      } as Account
    } })
  return Object.freeze({
    async status() { active(); return runtime().status(plan) },
    async deliver(depositBlock: bigint) {
      active(); proofCheck(!attempted); attempted = true
      try {
        await readySnapshot()
        const result = await runtime().execute(plan, command)
        active(); proofCheck(result.status === "sdk_returned" && mintHash && result.txHash === mintHash &&
          specHash && burn && actualFee !== undefined && beforeMintNative !== undefined)
        const proved = await chain.confirmed(mintHash, P.delegate, P.minter)
        proofCheck(proved.gasWei <= P.perTransactionGasCapWei)
        await chain.identity(proved.blockNumber)
        assertDelegateMintLogs(proved.receipt.logs, specHash)
        const afterNative = await chain.client.getBalance({ address: P.delegate, blockNumber: proved.blockNumber })
        proofCheck(afterNative - beforeMintNative === P.deliveryAtomic * 1000000000000n - proved.gasWei)
        await chain.canonical(proved.blockNumber, proved.blockHash)
        await journal.append("mint_confirmed", { txHash: mintHash, blockNumber: proved.blockNumber, blockHash: proved.blockHash,
          amount: P.deliveryAtomic, gasWei: proved.gasWei, specHash, actualFee })
        const source = await inspectDelegateSource(chain, specHash, actualFee, depositBlock)
        const after = await chain.snapshot()
        const expected = P.depositAtomic - P.deliveryAtomic - actualFee
        proofCheck(after.available === expected && after.ownerGatewayTotal ===
          (source.sourceDebit === "confirmed" ? expected : P.depositAtomic))
        await journal.append("source_checked", { ...source, specHash, actualFee, available: after.available, pendingBatch: after.pendingBatch })
        return Object.freeze({ txHash: mintHash, specHash, actualFee, mintGasWei: proved.gasWei,
          recipientBeforeWei: beforeMintNative, recipientAfterWei: afterNative,
          ...source, available: after.available, pendingBatch: after.pendingBatch })
      } catch { return proofFail() }
    },
    knownMintHash: () => mintHash,
    counts: () => ({ attempted, signatureClaimed, transferAttempted, mintSigned })
  })
}
