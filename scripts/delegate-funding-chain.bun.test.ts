import { describe, expect, test } from "bun:test"
import { toHex, type Hex } from "viem"
import { createDelegateProofChain } from "./delegate-funding-chain.ts"
import { DELEGATE_PROOF as P } from "./delegate-funding-proof.ts"

const HASH = ("0x" + "11".repeat(32)) as Hex, BLOCK = ("0x" + "22".repeat(32)) as Hex
const wallNow = 1809745200000
const block = { number: "0x64", hash: BLOCK, timestamp: toHex(BigInt(wallNow / 1000)), transactions: [] }
const receipt = { transactionHash: HASH, blockNumber: "0x64", blockHash: BLOCK, from: P.owner, to: P.wallet,
  status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00", logs: [], type: "0x2",
  cumulativeGasUsed: "0x5208", transactionIndex: "0x0", logsBloom: "0x" + "00".repeat(256) }
const tx = { hash: HASH, blockNumber: "0x64", blockHash: BLOCK, from: P.owner, to: P.wallet,
  chainId: "0x4cef52", type: "0x2", nonce: "0x0", gas: "0x186a0", maxFeePerGas: "0x77359400",
  maxPriorityFeePerGas: "0x0", value: "0x0", input: "0x1234", transactionIndex: "0x0" }
function fixture(overrides: Record<string, unknown | (() => unknown)> = {}) {
  const seen: string[] = []
  const controller = new AbortController()
  const defaults: Record<string, unknown> = { eth_chainId: "0x4cef52", eth_getBlockByNumber: block,
    eth_getTransactionReceipt: receipt, eth_getTransactionByHash: tx, eth_getCode: "0x6000" }
  const fetcher = (async (input, init) => {
    expect(String(input)).toBe(P.rpc)
    expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
    const r = JSON.parse(String(init?.body)); seen.push(r.method)
    let result = Object.hasOwn(overrides, r.method) ? overrides[r.method] : defaults[r.method]
    if (typeof result === "function") result = result()
    if (result === undefined) throw Error("unexpected_read")
    return Response.json({ jsonrpc: "2.0", id: r.id, result })
  }) as typeof fetch
  const driver = createDelegateProofChain({ signal: controller.signal, deadlineMs: performance.now() + 10000,
    fetch: fetcher, wallNow: () => wallNow })
  return { driver, seen, controller }
}
describe("owned delegate proof Arc chain driver", () => {
  test("finalized state is pinned to Arc and a recent canonical block", async () => {
    const { driver, seen } = fixture()
    expect(await driver.finalized()).toEqual({ blockNumber: 100n, blockHash: BLOCK, timestamp: BigInt(wallNow / 1000) })
    await driver.canonical(100n, BLOCK)
    expect(seen).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_getBlockByNumber"])
    expect(driver.counts()).toEqual({ rpcReadsAndSends: 3, ownerBroadcasts: 0 })
  })
  test("wrong chain, stale/future/null block and reorg fail closed", async () => {
    const wrong = fixture({ eth_chainId: "0x1" })
    await expect(wrong.driver.finalized()).rejects.toThrow()
    expect(wrong.seen).toEqual(["eth_chainId"])
    for (const changed of [{ ...block, timestamp: toHex(BigInt(wallNow / 1000 - 31)) },
      { ...block, timestamp: toHex(BigInt(wallNow / 1000 + 6)) }, { ...block, hash: null }, { ...block, number: "0x0" }]) {
      await expect(fixture({ eth_getBlockByNumber: changed }).driver.finalized()).rejects.toThrow()
    }
    await expect(fixture({ eth_getBlockByNumber: { ...block, hash: HASH } }).driver.canonical(100n, BLOCK)).rejects.toThrow()
  })
  test("public read transport cannot broadcast, sign, switch network or silently retry", async () => {
    const { driver, seen, controller } = fixture()
    for (const method of ["eth_sendRawTransaction", "eth_sendTransaction", "eth_signTypedData_v4", "wallet_switchEthereumChain"])
      await expect(driver.read(method, [])).rejects.toThrow()
    expect(seen).toEqual([])
    controller.abort()
    await expect(driver.finalized()).rejects.toThrow()
    expect(seen).toEqual([])
    const rpcError = fixture({ eth_chainId: () => { throw Error("unavailable") } })
    await expect(rpcError.driver.finalized()).rejects.toThrow()
    expect(rpcError.seen).toEqual(["eth_chainId"])
  })
  test("successful receipt needs finalized canonical transaction correlation", async () => {
    const { driver, seen } = fixture()
    const result = await driver.confirmed(HASH, P.owner, P.wallet)
    expect(result.txHash).toBe(HASH); expect(result.blockHash).toBe(BLOCK); expect(result.blockNumber).toBe(100n)
    expect(result.gasWei).toBe(21000000000000n)
    expect(seen).toEqual(["eth_getTransactionReceipt", "eth_chainId", "eth_getBlockByNumber", "eth_getBlockByNumber", "eth_getTransactionByHash"])
    expect(driver.counts().ownerBroadcasts).toBe(0)
  })
  test("reverted, mismatched, oversized or zero-gas receipt never reaches transaction confirmation", async () => {
    for (const changed of [{ ...receipt, status: "0x0" }, { ...receipt, from: P.delegate }, { ...receipt, to: P.token },
      { ...receipt, transactionHash: BLOCK }, { ...receipt, gasUsed: "0x0" }, { ...receipt, effectiveGasPrice: "0x0" },
      { ...receipt, logs: Array(129).fill({ address: P.token, topics: [], data: "0x" }) }]) {
      const { driver, seen } = fixture({ eth_getTransactionReceipt: changed })
      await expect(driver.confirmed(HASH, P.owner, P.wallet)).rejects.toThrow()
      expect(seen).toEqual(["eth_getTransactionReceipt"])
    }
  })
  test("receipt read errors are not caught as pending or retried", async () => {
    const { driver, seen } = fixture({ eth_getTransactionReceipt: () => { throw Error("transient_not_pending") } })
    await expect(driver.confirmed(HASH, P.owner, P.wallet)).rejects.toThrow()
    expect(seen).toEqual(["eth_getTransactionReceipt"])
  })
  test("different transaction chain, sender, recipient, block or hash refuses", async () => {
    for (const changed of [{ ...tx, chainId: "0x1" }, { ...tx, from: P.delegate }, { ...tx, to: P.token },
      { ...tx, blockHash: HASH }, { ...tx, blockNumber: "0x63" }, { ...tx, hash: BLOCK }]) {
      await expect(fixture({ eth_getTransactionByHash: changed }).driver.confirmed(HASH, P.owner, P.wallet)).rejects.toThrow()
    }
  })
  test("missing receipt is polled read-only once per tick, never resubmitted", async () => {
    let attempts = 0
    const { driver, seen } = fixture({ eth_getTransactionReceipt: () => ++attempts === 1 ? null : receipt })
    await driver.confirmed(HASH, P.owner, P.wallet)
    expect(attempts).toBe(2)
    expect(seen.filter(m => m === "eth_getTransactionReceipt")).toHaveLength(2)
    expect(driver.counts().ownerBroadcasts).toBe(0)
  })
  test("owner ordering, poison and identity failures happen before acquiring a signer", async () => {
    let keys = 0, writes = 0
    const acquire = async () => { keys++; throw Error("should_not_read_key") }
    const prepared = async () => { writes++ }
    const badOrder = fixture()
    await expect(badOrder.driver.ownerStep("deposit", acquire, prepared)).rejects.toThrow()
    expect(badOrder.seen).toEqual([])
    const wrongChain = fixture({ eth_chainId: "0x1" })
    await expect(wrongChain.driver.ownerStep("grant", acquire, prepared)).rejects.toThrow()
    await expect(wrongChain.driver.ownerStep("grant", acquire, prepared)).rejects.toThrow()
    await expect(wrongChain.driver.ownerStep("approval", acquire, prepared)).rejects.toThrow()
    expect(wrongChain.seen).toEqual(["eth_chainId"])
    const identity = fixture({ eth_getStorageAt: "0x" + "00".repeat(32) })
    await expect(identity.driver.ownerStep("grant", acquire, prepared)).rejects.toThrow()
    expect(keys).toBe(0); expect(writes).toBe(0)
    expect(identity.driver.counts().ownerBroadcasts).toBe(0)
  })
  test("deadline, pause duration and malformed RPC replies are bounded", async () => {
    expect(() => createDelegateProofChain({ signal: new AbortController().signal, deadlineMs: performance.now() + 700000 })).toThrow()
    const { driver } = fixture()
    for (const ms of [-1, Infinity, 1001, 0.5]) await expect(driver.pause(ms)).rejects.toThrow()
    for (const body of [{ jsonrpc: "2.0", id: 99, result: "0x4cef52" }, { jsonrpc: "1.0", id: 1, result: "0x4cef52" },
      { jsonrpc: "2.0", id: 1, result: "0x4cef52", error: null }, { jsonrpc: "2.0", id: 1 }]) {
      let calls = 0
      const fetcher = (async () => { calls++; return Response.json(body) }) as unknown as typeof fetch
      const d = createDelegateProofChain({ signal: new AbortController().signal, deadlineMs: performance.now() + 10000, fetch: fetcher })
      await expect(d.finalized()).rejects.toThrow()
      expect(calls).toBe(1)
    }
  })
})
