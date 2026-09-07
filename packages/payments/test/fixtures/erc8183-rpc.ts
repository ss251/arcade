/** Real viem ABI/JSON-RPC formatting over a fake chain; no network or owner keys. */
import { decodeFunctionData, encodeFunctionResult, hashDomain, keccak256, parseTransaction, toHex, type Hex } from "viem"
import { ERC8183_ABI, ARCADE_JOB_HOOK_ABI } from "../../src/erc8183-abi.ts"
import { fixture, addr, evaluator } from "./erc8183-action.ts"
const abi = [...ERC8183_ABI, ...ARCADE_JOB_HOOK_ABI] as const
export async function rpcFixture(kind: "budget" | "submit" | "complete" | "reject" = "complete") {
  const f = await fixture(kind), calls: { method: string; params: unknown[] }[] = [], controller = new AbortController()
  let sent = false, acquisitions = 0
  const identity = { chainId: 5042002 as const, escrow: f.context.call.escrow, implementation: addr(11), hook: f.context.call.hook,
    evaluator: f.context.call.evaluator, treasury: f.context.treasury, token: f.context.call.token,
    proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const getters: Record<string, unknown> = { paused: false, platformFeeBP: 500n, evaluatorFeeBP: 0n,
    platformTreasury: identity.treasury, allowedPaymentTokens: true, whitelistedHooks: true,
    escrow: identity.escrow, evaluator: identity.evaluator, pendingClaimHash: f.snapshot.pendingClaimHash, authorizationNonceUsed: false,
    DOMAIN_SEPARATOR: hashDomain({ types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
      { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] },
      domain: { name: "ERC8183", version: "1", chainId: 5042002n, verifyingContract: identity.escrow } }) }
  const hexify = (value: unknown): unknown => {
    if (typeof value === "bigint" || typeof value === "number") return toHex(value)
    if (Array.isArray(value)) return value.map(hexify)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hexify(v)]))
    return value
  }
  const answer = (method: string, params: unknown[]): unknown => {
    const state = sent ? f.after : f.snapshot
    if (method === "eth_chainId") return toHex(5042002)
    if (method === "eth_getTransactionCount") return "0x3"
    if (method === "eth_getBlockByNumber") {
      const block = params[0] === "finalized" || params[0] === "latest" ? state : params[0] === "0x33" ? f.after : f.snapshot
      return { number: toHex(block.blockNumber), hash: block.blockHash, timestamp: toHex(block.timestamp), transactions: [] }
    }
    if (method === "eth_getCode") return params[0] === identity.escrow ? "0x01" : params[0] === identity.implementation ? "0x02" :
      params[0] === identity.hook ? "0x03" : "0x"
    if (method === "eth_getStorageAt") return "0x" + "00".repeat(12) + identity.implementation.slice(2)
    if (method === "eth_call") {
      const { functionName } = decodeFunctionData({ abi, data: (params[0] as { data: Hex }).data })
      const value = functionName === "getJob" ? (params[1] === "0x33" ? f.after : f.snapshot).job : getters[functionName]
      return encodeFunctionResult({ abi, functionName, result: value as never })
    }
    if (method === "eth_estimateGas") return toHex(833333n)
    if (method === "eth_gasPrice") return "0x1"
    if (method === "eth_getBalance") return toHex(3000000n)
    if (method === "eth_sendRawTransaction") { sent = true; return f.signed.hash }
    if (method === "eth_getTransactionReceipt") {
      return hexify({ ...f.receipt, status: 1, type: 2, contractAddress: null })
    }
    if (method === "eth_getTransactionByHash") {
      return hexify({ ...parseTransaction(f.raw as `0x02${string}`), ...f.mined, type: 2, transactionIndex: 0 })
    }
    throw Error("unknown fixture method")
  }
  const fetch = (async (_url, init) => {
    const r = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] }
    calls.push({ method: r.method, params: r.params })
    return Response.json({ jsonrpc: "2.0", id: r.id, result: answer(r.method, r.params) })
  }) as typeof globalThis.fetch
  const options = { identity, signal: controller.signal, deadlineMs: performance.now() + 30000, nowSeconds: () => 1000,
    gasCapWei: 2000000n, fetch, acquireSigner: async () => { acquisitions++; return evaluator } }
  return { f, identity, calls, getters, controller, options, answer, acquisitions: () => acquisitions, sent: () => sent }
}
