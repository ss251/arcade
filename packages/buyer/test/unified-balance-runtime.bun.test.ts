import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeFunctionData, encodeAbiParameters, keccak256, parseAbi, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { createUnifiedRuntime } from "../src/unified-balance-runtime.ts"
import { parseUnifiedFundingCommand } from "../src/unified-balance-cli.ts"
import { captureUnifiedFundingPlan } from "../src/unified-balance-funding.ts"
import { captureUnifiedBurn, encodeUnifiedTransferSpec, unifiedCoordinates } from "../src/unified-balance-guards.ts"
import { GATEWAY_BURN_TYPES } from "../src/gateway-withdrawal.ts"
import { readUnifiedFundingJournal } from "../src/gateway-funding-journal.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const abi = parseAbi(["function domain() view returns(uint32)", "function paused() view returns(bool)",
  "function isTokenSupported(address token) view returns(bool)", "function withdrawalDelay() view returns(uint256)",
  "function isAuthorizedForBalance(address token,address depositor,address addr) view returns(bool)",
  "function gatewayMint(bytes attestation,bytes signature)"])
const word = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n])
const fixture = async (mode: "ready" | "none" | "pending" | "fee" | "transfer-lost" | "send-lost" | "gas" | "no-gas" | "wrong-chain" | "receipt-pending" | "receipt-lost" | "pending-batch" | "pending-only" | "malformed-pending" | "unknown-balance-field" = "ready") => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "arcade-unified-runtime-"))); await chmod(dir, 0o700); roots.push(dir)
  const account = privateKeyToAccount(generatePrivateKey()), owner = `0x${"11".repeat(20)}` as const
  const plan = captureUnifiedFundingPlan({ owner, recipient: account.address, sourceChain: "Arc_Testnet", amount: "0.25" })
  const c = unifiedCoordinates("Arc_Testnet"), journalPath = join(dir, "fund.jsonl")
  const command = parseUnifiedFundingCommand(["fund", "--from-unified-balance", "--owner", owner, "--source", "Arc_Testnet",
    "--amount", "0.25", "--delegate", plan.recipient, "--journal", journalPath, "--max-burn-block-delta", "200"])
  if (command.kind === "help") throw Error("fixture")
  const observed: string[] = []
  let keys = 0, transfers = 0, broadcasts = 0, receipts = 0, prepared: Hex | undefined
  const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
  const request = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url === c.rpc) {
      const body = JSON.parse(init!.body as string), { method, params } = body
      observed.push(method)
      let result: unknown
      if (method === "eth_chainId") result = mode === "wrong-chain" ? "0x1" : "0x" + c.chainId.toString(16)
      else if (method === "eth_getCode") result = params[0].toLowerCase() === plan.recipient ? "0x" : "0x6000"
      else if (method === "eth_blockNumber") result = "0x3e8"
      else if (method === "eth_call") {
        const decoded = decodeFunctionData({ abi, data: params[0].data })
        observed.push(decoded.functionName)
        if (decoded.functionName === "gatewayMint") result = "0x"
        else if (decoded.functionName === "domain") result = word(26n)
        else if (decoded.functionName === "paused") result = word(0n)
        else if (decoded.functionName === "withdrawalDelay") result = word(100n)
        else if (decoded.functionName === "isAuthorizedForBalance") result = word(mode === "none" || mode === "pending" && params[1] !== "latest" ? 0n : 1n)
        else result = word(1n)
      } else if (method === "eth_estimateGas") result = mode === "gas" ? "0xffffffffffffffffff" : "0x186a0"
      else if (method === "eth_gasPrice") result = "0x3b9aca00"
      else if (method === "eth_getBalance") result = mode === "no-gas" ? "0x0" : "0xde0b6b3a7640000"
      else if (method === "eth_getTransactionCount") result = "0x0"
      else if (method === "eth_sendRawTransaction") {
        broadcasts++
        prepared = keccak256(params[0])
        const saved = await readUnifiedFundingJournal(journalPath, plan)
        expect(saved.events.at(-1)).toEqual({ stage: "mint_prepared", plan, txHash: prepared })
        if (mode === "send-lost") throw Error("PRIVATE_SEND_LOST")
        result = prepared
      } else if (method === "eth_getTransactionReceipt") {
        receipts++
        if (mode === "receipt-lost") throw Error("PRIVATE_RECEIPT_LOST")
        if (mode === "receipt-pending" && receipts === 1) return response({ jsonrpc: "2.0", id: body.id, result: null })
        result = { transactionHash: prepared, transactionIndex: "0x0", blockHash: `0x${"66".repeat(32)}`, blockNumber: "0x3e9",
          from: plan.recipient, to: c.minter, cumulativeGasUsed: "0x186a0", gasUsed: "0x186a0", contractAddress: null,
          logs: [], logsBloom: `0x${"00".repeat(256)}`, status: "0x1", effectiveGasPrice: "0x3b9aca00", type: "0x2" }
      } else throw Error("Unexpected fixture RPC: " + method)
      return response({ jsonrpc: "2.0", id: body.id, result })
    }
    const path = new URL(url).pathname; observed.push(path)
    expect(new URL(url).origin).toBe("https://gateway-api-testnet.circle.com")
    if (path === "/v1/info") return response({ version: 1, domains: [{ chain: "Arc", network: "testnet", domain: 26,
      processedHeight: "1000", burnIntentExpirationHeight: "1200" }] })
    const body = JSON.parse(init!.body as string)
    if (path === "/v1/balances") return response({ token: "USDC", balances: [{ domain: 26, depositor: owner,
      balance: mode === "pending-only" ? "0" : "0.500000",
      ...(mode === "pending-batch" || mode === "pending-only" ? { pendingBatch: "0.500000" } : {}),
      ...(mode === "malformed-pending" ? { pendingBatch: "not-an-amount" } : {}),
      ...(mode === "unknown-balance-field" ? { unexpectedCredit: "0.500000" } : {}) }] })
    if (path === "/v1/estimate") return response([{ burnIntentSet: { intents: body[0].intents.map((row: { spec: unknown }) => ({
      spec: row.spec, maxBlockHeight: "1150", maxFee: mode === "fee" ? "50001" : "1000"
    })) } }])
    if (path === "/v1/transfer") {
      transfers++
      if (mode === "transfer-lost") throw Error("PRIVATE_TRANSFER_LOST")
      const raw = body[0].burnIntent
      const burn = captureUnifiedBurn({ domain: { name: "GatewayWallet", version: "1" }, types: GATEWAY_BURN_TYPES, primaryType: "BurnIntent",
        message: { maxBlockHeight: BigInt(raw.maxBlockHeight), maxFee: BigInt(raw.maxFee),
          spec: { ...raw.spec, value: BigInt(raw.spec.value), hookData: raw.spec.hookData ?? "0x" } } }, plan,
      { maxFeeAtomic: 50000n, sourceBlock: 1000n, withdrawalDelay: 100n, maxBurnBlockDelta: 200n })
      return response({ attestation: `0xff6fb334${1200n.toString(16).padStart(64, "0")}00000154${encodeUnifiedTransferSpec(burn).slice(2)}`,
        signature: `0x${"55".repeat(65)}` })
    }
    throw Error("Unexpected fixture Gateway path: " + path)
  }
  const runtime = createUnifiedRuntime({ env: {}, signal: new AbortController().signal, deadlineMs: performance.now() + 20000,
    fetch: request as typeof fetch, acquireAccount: async () => { keys++; return account } })
  return { plan, command, runtime, journalPath, observed, counts: () => ({ keys, transfers, broadcasts, receipts }) }
}
describe("actual Kit1.6.0 and Viem1.17.1 owned runtime", () => {
  test("accepts observed pendingBatch metadata without treating it as available credit", async () => {
    const f = await fixture("pending-batch")
    expect(await f.runtime.execute(f.plan, f.command)).toMatchObject({ status: "sdk_returned" })
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 1, receipts: 1 })
  })
  test("pending-only, malformed metadata and unknown balance fields refuse before keys", async () => {
    for (const mode of ["pending-only", "malformed-pending", "unknown-balance-field"] as const) {
      const f = await fixture(mode)
      await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
      expect(f.counts()).toEqual({ keys: 0, transfers: 0, broadcasts: 0, receipts: 0 })
    }
  })
  test("a wrong chain or absent destination gas refuses before key acquisition", async () => {
    for (const mode of ["wrong-chain", "no-gas"] as const) {
      const f = await fixture(mode)
      await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
      expect(f.counts()).toEqual({ keys: 0, transfers: 0, broadcasts: 0, receipts: 0 })
    }
  })
  test("a pending receipt gets exactly one read per tick with no replacement search", async () => {
    const f = await fixture("receipt-pending")
    expect(await f.runtime.execute(f.plan, f.command)).toMatchObject({ status: "sdk_returned" })
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 1, receipts: 2 })
    expect(f.observed.filter(method => method === "eth_getBlockByNumber")).toHaveLength(0)
  })
  test("a failed receipt read is uncertain and never triggers a second mint", async () => {
    const f = await fixture("receipt-lost")
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 1, receipts: 1 })
    expect((await readUnifiedFundingJournal(f.journalPath, f.plan)).events.at(-1)?.stage).toBe("uncertain")
  })
  test("owner readiness reads are keyless and never send", async () => {
    for (const mode of ["none", "pending", "ready"] as const) {
      const f = await fixture(mode)
      expect(await f.runtime.status(f.plan)).toBe(mode)
      expect(f.counts()).toEqual({ keys: 0, transfers: 0, broadcasts: 0, receipts: 0 })
    }
  })
  test("actual SDK spend uses one lazy signer/transfer/mint and records prepared hash first", async () => {
    const f = await fixture()
    let result: unknown, error = false
    try { result = await f.runtime.execute(f.plan, f.command) } catch { error = true }
    expect({ error, observed: error ? f.observed : [] }).toEqual({ error: false, observed: [] })
    expect(result).toMatchObject({ status: "sdk_returned", plan: f.plan })
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 1, receipts: 1 })
    expect((await readUnifiedFundingJournal(f.journalPath, f.plan)).events.map(e => e.stage)).toEqual(["planned", "spend_intent", "mint_prepared", "sdk_returned"])
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts().broadcasts).toBe(1)
  })
  test("fee escalation is refused before any key and Gateway transfer", async () => {
    const f = await fixture("fee")
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts()).toEqual({ keys: 0, transfers: 0, broadcasts: 0, receipts: 0 })
    expect(f.observed).toContain("/v1/estimate")
  })
  test("lost transfer response is uncertain and never retried by the real SDK", async () => {
    const f = await fixture("transfer-lost")
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 0, receipts: 0 })
    expect((await readUnifiedFundingJournal(f.journalPath, f.plan)).events.at(-1)?.stage).toBe("uncertain")
  })
  test("lost mint response retains prepared hash and never rebroadcasts", async () => {
    const f = await fixture("send-lost")
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 1, receipts: 0 })
    const events = (await readUnifiedFundingJournal(f.journalPath, f.plan)).events
    expect(events.at(-2)?.stage).toBe("mint_prepared"); expect(events.at(-1)?.stage).toBe("uncertain")
  })
  test("destination gas escalation refuses mint without a transaction broadcast", async () => {
    const f = await fixture("gas")
    await expect(f.runtime.execute(f.plan, f.command)).rejects.toThrow()
    expect(f.counts()).toEqual({ keys: 1, transfers: 1, broadcasts: 0, receipts: 0 })
    expect(f.observed).toContain("eth_estimateGas")
  })
})
