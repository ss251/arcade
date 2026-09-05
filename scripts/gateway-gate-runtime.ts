/** F1 trusted IO adapter. All mutation is explicit, private-journaled and single-attempt. */
import { constants } from "node:fs"
import { open, lstat, realpath } from "node:fs/promises"
import { dirname, isAbsolute, normalize } from "node:path"
import { createPublicClient, createWalletClient, custom, encodeFunctionData, erc20Abi,
  keccak256, parseAbi, type Hex } from "viem"
import { arcTestnet } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { CHAIN_CONFIGS, GATEWAY_DOMAINS } from "@circle-fin/x402-batching/client"
import { loadChainConfig } from "@arcade/core"
import { GATE, GatewayGateError, fetchArcRpc, fetchGatewayJson, isAddress, isHash, record, same,
  makeGatewayPayment, type GateDependencies, type GateOptions, type GateFetch, type GateStage } from "./gateway-gate.ts"

const refused = (stage: GateStage = "journal") => new GatewayGateError({ stage, reason: "refused" })
function insist(v: unknown, stage: GateStage = "journal"): asserts v { if (!v) throw refused(stage) }
const amounts = new Set(["depositAtomic", "paymentAtomic", "amountAtomic", "gatewayAtomic", "gatewayAfterAtomic",
  "validAfter", "validBefore"])
const hashes = new Set(["txHash", "blockHash", "nonce", "depositTxHash", "batchTxHash"])
const events = new Set(["started", "deposit-intent", "approval-prepared", "approval-confirmed", "deposit-prepared",
  "deposit-confirmed", "authorization-intent", "verify-confirmed", "settle-intent", "settle-accepted", "completed"])
const safeEvidence = (value: Record<string, unknown>) => {
  insist(events.has(String(value["event"])))
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === "event") insist(typeof v === "string" && events.has(v))
    else if (k === "buyer" || k === "payTo" || k === "payer") insist(isAddress(v))
    else if (k === "network") insist(v === GATE.network)
    else if (amounts.has(k)) insist(typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v))
    else if (hashes.has(k)) insist((k === "batchTxHash" && v === null) || isHash(v))
    else if (k === "blockNumber") insist(typeof v === "number" && Number.isSafeInteger(v) && v > 0)
    else if (k === "transferId") insist(typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))
    else if (k === "decision") insist(v === "PASS")
    else if (k === "settlementKind") insist(v === "gateway-transfer")
    else if (k === "status") insist(["received", "batched", "confirmed", "completed"].includes(String(v)))
    else throw refused()
    safe[k] = v
  }
  return `${JSON.stringify(safe)}\n`
}
export interface GateJournal { append(value: Record<string, unknown>): Promise<void>; close(): Promise<void> }
/** Never overwrite or auto-resume, even if the previous run ended before sending.
 * The caller prepares an owned 0700 parent. Crash/unknown state is retained for reconciliation. */
export const openGateJournal = async (path: string): Promise<GateJournal> => {
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    insist(isAbsolute(path) && normalize(path) === path && path.endsWith(".jsonl") && path.length < 2048 &&
      !/[\u0000-\u001f\u007f]/.test(path))
    const parentPath = dirname(path), parent = await lstat(parentPath)
    insist(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0 &&
      (process.getuid === undefined || parent.uid === process.getuid()))
    insist(await realpath(parentPath) === parentPath ||
      // macOS exposes /private/tmp and /private/var/folders through these system aliases.
      await realpath(parentPath) === `/private${parentPath}`)
    file = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await file.sync()
    const folder = await open(parentPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { await folder.sync() } finally { await folder.close() }
    const owned = file; let closed = false, poisoned = false
    let tail: Promise<void> = Promise.resolve()
    return {
      append(value) {
        let bytes: string
        try { insist(!closed && !poisoned); bytes = safeEvidence(value); insist(bytes.length <= 2048) }
        catch { return Promise.reject(refused()) }
        const operation = tail.then(async () => {
          insist(!closed && !poisoned)
          try { await owned.writeFile(bytes); await owned.sync() }
          catch { poisoned = true; throw refused() }
        })
        tail = operation.catch(() => {})
        return operation
      },
      async close() {
        if (closed) return
        await tail; closed = true
        try { await owned.close() } catch { throw refused() }
      }
    }
  } catch { if (file) await file.close().catch(() => {}); throw refused() }
}

/** Circle balance strings are decimal USDC, while transfer.amount is atomic USDC. */
export const readGatewayBalance = (value: unknown, buyer: string): bigint => {
  const r = record(value, "balance"), rows = r["balances"]
  insist((r["token"] === undefined || r["token"] === "USDC") && Array.isArray(rows) && rows.length === 1, "balance")
  const row = record(rows[0], "balance")
  insist(same(row["depositor"], buyer) && row["domain"] === GATE.domain, "balance")
  const balance = row["balance"]
  insist(typeof balance === "string" && /^(0|[1-9][0-9]{0,60})(\.[0-9]{1,6})?$/.test(balance), "balance")
  const [whole, fraction = ""] = balance.split(".")
  return BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, "0"))
}
const walletAbi = parseAbi(["function deposit(address token, uint256 value)",
  "function totalBalance(address token, address depositor) view returns (uint256)"])

export const createGateRuntime = (
  o: GateOptions, key: string, signal: AbortSignal, fetchImpl: GateFetch = fetch
): { dependencies: GateDependencies; close(): Promise<void> } => {
  let account: ReturnType<typeof privateKeyToAccount>
  try { insist(isHash(key), "configuration"); account = privateKeyToAccount(key) }
  catch { throw refused("configuration") }
  insist(same(account.address, o.buyer) && isAddress(o.payTo) && !same(o.buyer, o.payTo), "configuration")
  const cfg = loadChainConfig("arc-testnet"), sdk = CHAIN_CONFIGS.arcTestnet
  insist(cfg.chainId === GATE.chainId && cfg.caip2 === GATE.network && sdk.chain.id === GATE.chainId &&
    same(cfg.usdc.address, GATE.usdc) && same(sdk.usdc, GATE.usdc) &&
    same(cfg.gateway?.wallet, GATE.wallet) && same(sdk.gatewayWallet, GATE.wallet) &&
    cfg.gateway?.domain === GATE.domain && GATEWAY_DOMAINS.arcTestnet === GATE.domain &&
    cfg.gateway?.facilitatorUrl === GATE.facilitator && cfg.gateway?.minValiditySeconds === GATE.validitySeconds,
  "configuration")
  const rpc = (method: string, params: readonly unknown[] = []) => fetchArcRpc(method, params, fetchImpl, signal)
  const transport = custom({ request: ({ method, params }) => rpc(method, params as readonly unknown[] | undefined) }, { retryCount: 0 })
  const publicClient = createPublicClient({ chain: arcTestnet, transport })
  const wallet = createWalletClient({ account, chain: arcTestnet, transport })
  let journal: GateJournal | undefined
  let depositStarted = false, authorizationSigned = false
  const checkpoint = async (value: Record<string, unknown>) => { insist(journal); await journal.append(value) }
  const balance = async () => readGatewayBalance(await fetchGatewayJson("/v1/balances", {
    token: "USDC", sources: [{ depositor: account.address, domain: GATE.domain }]
  }, fetchImpl, signal), account.address)
  const pause = (ms: number) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const stop = () => { clearTimeout(timer); reject(refused("transport")) }
    const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve() }, ms)
    signal.addEventListener("abort", stop, { once: true })
  })
  const poll = async <A>(read: () => Promise<A | undefined>, stage: GateStage): Promise<A> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      signal.throwIfAborted()
      let result: A | undefined
      try { result = await read() } catch { /* only this bounded read is retried */ }
      if (result !== undefined) return result
      if (attempt < 11) await pause(Math.min(1500 * 2 ** attempt, 5000))
    }
    throw refused(stage)
  }
  const send = async (kind: "approval" | "deposit", to: Hex, data: Hex) => {
    signal.throwIfAborted()
    insist(await publicClient.getChainId() === GATE.chainId, "deposit")
    const prepared = await wallet.prepareTransactionRequest({ account, to, data, value: 0n,
      gas: 120000n, chain: arcTestnet })
    // Bound gas authorization too. Arc gas is native 18-decimal USDC, distinct from ERC20 amounts.
    const maxFee = prepared.maxFeePerGas ?? prepared.gasPrice
    insist(prepared.chainId === GATE.chainId && same(prepared.to, to) && prepared.data === data &&
      prepared.value === 0n && prepared.gas === 120000n && typeof maxFee === "bigint" && maxFee > 0n &&
      maxFee * 120000n <= 100000000000000000n, "deposit") // <= 0.1 native USDC per transaction
    const raw = await wallet.signTransaction(prepared), txHash = keccak256(raw)
    await checkpoint({ event: `${kind}-prepared`, txHash, amountAtomic: String(o.depositAtomic) })
    signal.throwIfAborted()
    // Known hash persisted before this one send. No wallet send helper or operation retry.
    const submitted = await rpc("eth_sendRawTransaction", [raw])
    insist(same(submitted, txHash), "deposit")
    const receipt = await poll(async () => {
      const v = await rpc("eth_getTransactionReceipt", [txHash])
      return v === null ? undefined : record(v, "deposit")
    }, "deposit")
    insist(receipt["status"] === "0x1" && same(receipt["transactionHash"], txHash) &&
      same(receipt["from"], account.address) && same(receipt["to"], to) && isHash(receipt["blockHash"]), "deposit")
    const block = receipt["blockNumber"]
    insist(typeof block === "string" && /^0x[0-9a-f]+$/i.test(block) && BigInt(block) <= BigInt(Number.MAX_SAFE_INTEGER), "deposit")
    const transaction = record(await rpc("eth_getTransactionByHash", [txHash]), "deposit")
    insist(same(transaction["hash"], txHash) && same(transaction["from"], account.address) &&
      same(transaction["to"], to) && same(transaction["input"], data) &&
      transaction["value"] === "0x0" && same(transaction["blockHash"], receipt["blockHash"]), "deposit")
    if (kind === "approval") await checkpoint({ event: "approval-confirmed", txHash,
      blockHash: receipt["blockHash"], blockNumber: Number(BigInt(block)) })
    return { txHash, blockHash: receipt["blockHash"], blockNumber: Number(BigInt(block)) }
  }
  const dependencies: GateDependencies = {
    supported: () => fetchGatewayJson("/v1/x402/supported", undefined, fetchImpl, signal),
    async claim() { insist(journal === undefined); journal = await openGateJournal(o.journal) },
    checkpoint,
    async preflight() {
      const chainId = await publicClient.getChainId()
      insist(chainId === GATE.chainId, "preflight")
      const decimals = await publicClient.readContract({ address: GATE.usdc, abi: erc20Abi, functionName: "decimals" })
      const code = await publicClient.getCode({ address: GATE.wallet })
      insist(code !== undefined && code !== "0x", "preflight")
      const walletAtomic = await publicClient.readContract({ address: GATE.usdc, abi: erc20Abi,
        functionName: "balanceOf", args: [account.address] })
      const onchain = await publicClient.readContract({ address: GATE.wallet, abi: walletAbi,
        functionName: "totalBalance", args: [GATE.usdc, account.address] })
      insist(onchain === 0n, "preflight")
      return { buyer: account.address, chainId, decimals, walletAtomic, gatewayAtomic: await balance() }
    },
    async deposit() {
      // Retain the latch even on a pre-send or uncertain failure. Reconciliation is
      // read-only; a caller cannot turn this adapter into an operation retry loop.
      insist(!depositStarted && journal !== undefined, "deposit"); depositStarted = true
      const allowance = await publicClient.readContract({ address: GATE.usdc, abi: erc20Abi,
        functionName: "allowance", args: [account.address, GATE.wallet] })
      if (allowance < o.depositAtomic) await send("approval", GATE.usdc, encodeFunctionData({
        abi: erc20Abi, functionName: "approve", args: [GATE.wallet, o.depositAtomic] }))
      const proof = await send("deposit", GATE.wallet, encodeFunctionData({
        abi: walletAbi, functionName: "deposit", args: [GATE.usdc, o.depositAtomic] }))
      const onchain = await publicClient.readContract({ address: GATE.wallet, abi: walletAbi,
        functionName: "totalBalance", args: [GATE.usdc, account.address] })
      insist(onchain === o.depositAtomic, "deposit")
      const gatewayAtomic = await poll(async () => {
        const value = await balance(); return value === o.depositAtomic ? value : undefined
      }, "deposit")
      return { ...proof, amountAtomic: o.depositAtomic, gatewayAtomic }
    },
    async sign(payment) {
      signal.throwIfAborted(); insist(!authorizationSigned && journal !== undefined, "sign")
      const now = Math.floor(Date.now() / 1000), started = Number(payment.message.validAfter) + 600
      insist(Number.isSafeInteger(started) && started <= now && now - started <= 30, "sign")
      const permitted = makeGatewayPayment(o, started, payment.message.nonce)
      insist(payment.primaryType === permitted.primaryType && payment.domain.name === permitted.domain.name &&
        payment.domain.version === permitted.domain.version && payment.domain.chainId === permitted.domain.chainId &&
        same(payment.domain.verifyingContract, GATE.wallet) && same(payment.message.from, o.buyer) &&
        same(payment.message.to, o.payTo) && payment.message.value === o.paymentAtomic &&
        payment.message.validAfter === permitted.message.validAfter && payment.message.validBefore === permitted.message.validBefore,
      "sign")
      const types = payment.types.TransferWithAuthorization
      insist(Array.isArray(types) && types.length === 6 && types.every((t, i) =>
        t.name === permitted.types.TransferWithAuthorization[i]!.name &&
        t.type === permitted.types.TransferWithAuthorization[i]!.type), "sign")
      authorizationSigned = true
      // Sign freshly constructed local data, not caller-owned mutable objects.
      return account.signTypedData(permitted)
    },
    verify: body => fetchGatewayJson("/v1/x402/verify", body, fetchImpl, signal),
    settle: body => fetchGatewayJson("/v1/x402/settle", body, fetchImpl, signal),
    transfer: id => poll(async () => await fetchGatewayJson(`/v1/x402/transfers/${id}`, undefined, fetchImpl, signal), "transfer"),
    afterBalance: () => poll(async () => {
      const value = await balance(); return value === o.depositAtomic - o.paymentAtomic ? value : undefined
    }, "balance"),
    now: () => Math.floor(Date.now() / 1000),
    nonce: () => `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`
  }
  return { dependencies, async close() { if (journal) await journal.close() } }
}
