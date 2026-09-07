/** Source-shaped ABI/RPC fixture only. No real chain, owner keys or network. */
import { decodeFunctionData, encodeFunctionResult, erc20Abi, hashDomain, parseTransaction, toHex, type Hex } from "viem"
import { ERC8183_ABI, ARCADE_JOB_HOOK_ABI } from "../../src/erc8183-abi.ts"
import { buyerFixture, buyer } from "./erc8183-buyer.ts"
const abi = [...ERC8183_ABI, ...ARCADE_JOB_HOOK_ABI, ...erc20Abi] as const
export async function buyerRpcFixture(kind: "create" | "approve" | "fund" | "budget" = "create") {
  const f = await buyerFixture(kind), i = f.intent, id = i.identity, calls: { method: string; params: unknown[] }[] = [], controller = new AbortController()
  let mined = false, acquisitions = 0
  const getters: Record<string, unknown> = { paused: false, platformFeeBP: 500n, evaluatorFeeBP: 0n,
    platformTreasury: id.treasury, allowedPaymentTokens: true, whitelistedHooks: true,
    escrow: id.escrow, evaluator: id.evaluator, pendingClaimHash: f.snapshot.pendingClaimHash,
    DOMAIN_SEPARATOR: hashDomain({ types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
      { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] },
      domain: { name: "ERC8183", version: "1", chainId: 5042002n, verifyingContract: id.escrow } }) }
  const hexify = (value: unknown): unknown => {
    if (typeof value === "bigint" || typeof value === "number") return toHex(value)
    if (Array.isArray(value)) return value.map(hexify)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hexify(v)]))
    return value
  }
  const answer = (method: string, params: unknown[]): unknown => {
    const state = mined ? f.after : f.snapshot
    if (method === "eth_chainId") return toHex(5042002)
    if (method === "eth_getTransactionCount") return toHex(f.terms.nonce)
    if (method === "eth_getBlockByNumber") {
      const block = params[0] === "finalized" || params[0] === "latest" ? state : params[0] === toHex(f.after.blockNumber) ? f.after : f.snapshot
      return { number: toHex(block.blockNumber), hash: block.blockHash, timestamp: toHex(block.timestamp), transactions: [] }
    }
    if (method === "eth_getCode") return params[0] === id.escrow ? "0x01" : params[0] === id.implementation ? "0x02" : params[0] === id.hook ? "0x03" : "0x"
    if (method === "eth_getStorageAt") return "0x" + "00".repeat(12) + id.implementation.slice(2)
    if (method === "eth_call") {
      const { functionName } = decodeFunctionData({ abi, data: (params[0] as { data: Hex }).data })
      const value = functionName === "getJob" ? (params[1] === toHex(f.after.blockNumber) ? f.after : f.snapshot).job :
        functionName === "allowance" ? (mined ? f.allowanceAtomic ?? 0n : kind === "fund" ? i.call.amount : 0n) : getters[functionName]
      return encodeFunctionResult({ abi, functionName, result: value as never })
    }
    if (method === "eth_estimateGas") return toHex(833333n)
    if (method === "eth_gasPrice") return "0x1"
    if (method === "eth_getBalance") return toHex(10n ** 20n)
    if (method === "eth_sendRawTransaction") { mined = true; return f.tx.hash }
    if (method === "eth_getTransactionReceipt") return hexify({ ...f.receipt, status: 1, type: 2, contractAddress: null })
    if (method === "eth_getTransactionByHash") return hexify({ ...parseTransaction(f.raw as `0x02${string}`), ...f.tx, type: 2, transactionIndex: 0 })
    throw Error("unknown fixture method")
  }
  const fetch = (async (_url, init) => {
    const r = JSON.parse(String(init?.body)); calls.push({ method: r.method, params: r.params })
    return Response.json({ jsonrpc: "2.0", id: r.id, result: answer(r.method, r.params) })
  }) as typeof globalThis.fetch
  const options = { intent: i, kind: kind === "budget" ? "create" as const : kind, signal: controller.signal,
    deadlineMs: performance.now() + 30000, nowSeconds: () => 1001, fetch,
    acquireSigner: async () => { acquisitions++; return buyer } }
  return { f, id, calls, getters, controller, options, answer, mine: () => { mined = true }, acquisitions: () => acquisitions }
}
