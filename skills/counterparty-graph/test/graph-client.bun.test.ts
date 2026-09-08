import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { AGENT0_BASE_SUBGRAPH_ID, GATEWAY_BASE, document, makePaidQuery, runKeyCommand, type GraphResponseObservation, type GraphPaymentIntent } from "../graph-client.ts"

const KEY = `0x${"11".repeat(32)}` as const
const PAYER = privateKeyToAccount(KEY).address
const MERCHANT = "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB"
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const TX = `0x${"a".repeat(64)}`, BLOCK = `0x${"b".repeat(64)}`
const ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)", "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"])
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64")
const args = () => ({ subgraphId: AGENT0_BASE_SUBGRAPH_ID, document: document("identities"), variables: { address: PAYER.toLowerCase() } })
const requirement = { x402Version: 2, resource: { url: `http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/${AGENT0_BASE_SUBGRAPH_ID}` },
  accepts: [{ scheme: "exact", network: "eip155:8453", asset: USDC, amount: "10000", payTo: MERCHANT, maxTimeoutSeconds: 300, extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" } }] }

describe("actual owned loopback Graph transport (simulated payments only)", () => {
  it.each(["success", "redirect", "signed-500", "intent-refusal"] as const)("proves %s without a real endpoint, key or repeat", async (mode) => {
    let unsigned = 0, signed = 0, foreign = 0, nonce: `0x${string}` | undefined
    const wire: Array<{ body: string; headers: Record<string, string> }> = []
    const other = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { foreign++; return Response.json({ private: "fixture" }) } })
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      const text = await req.text(), headers: Record<string, string> = {}
      req.headers.forEach((value, name) => { headers[name] = value })
      wire.push({ body: text, headers })
      if (new URL(req.url).pathname === "/gateway") {
        const signature = req.headers.get("payment-signature")
        if (!signature) { unsigned++; if (mode === "redirect") return new Response(null, { status: 307, headers: { location: String(other.url) } }); return new Response(null, { status: 402, headers: { "payment-required": encoded(requirement) } }) }
        signed++
        const p = JSON.parse(Buffer.from(signature, "base64").toString()) as { payload: { authorization: { nonce: `0x${string}` } } }
        nonce = p.payload.authorization.nonce
        return Response.json({ data: { _meta: { block: { number: 41, hash: BLOCK }, hasIndexingErrors: false }, asWallet: [], asOwner: [] } },
          { status: mode === "signed-500" ? 500 : 200, headers: { "payment-response": encoded({ success: true, network: "eip155:8453", payer: PAYER, transaction: TX }) } })
      }
      expect(new URL(req.url).pathname).toBe("/rpc")
      const rpc = JSON.parse(text) as { id: number; method: string }
      let result: unknown
      if (rpc.method === "eth_chainId") result = "0x2105"
      else if (rpc.method === "eth_getBlockByNumber") result = { number: "0x29", hash: BLOCK, timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` }
      else if (rpc.method === "eth_getTransactionReceipt") {
        expect(nonce).toBeDefined()
        const base = { address: USDC, transactionHash: TX, blockHash: BLOCK, blockNumber: "0x29", transactionIndex: "0x0", removed: false }
        result = { transactionHash: TX, blockHash: BLOCK, blockNumber: "0x29", transactionIndex: "0x0", status: "0x1", logs: [
          { ...base, logIndex: "0x0", topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: PAYER, to: MERCHANT } }), data: encodeAbiParameters([{ type: "uint256" }], [10000n]) },
          { ...base, logIndex: "0x1", topics: encodeEventTopics({ abi: ABI, eventName: "AuthorizationUsed", args: { authorizer: PAYER, nonce: nonce! } }), data: "0x" }
        ] }
      } else throw new Error("unexpected fixture RPC")
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result })
    } })
    try {
      // Injected transport is the only fixture rewrite; the production client still
      // validates/sends its exact canonical targets and every real HTTP option.
      const localFetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
        const target = String(input) === `${GATEWAY_BASE}${AGENT0_BASE_SUBGRAPH_ID}` ? "/gateway" : String(input) === "https://mainnet.base.org" ? "/rpc" : null
        if (target === null) throw new Error("non-fixture target forbidden")
        const response = await fetch(new URL(target, server.url), init)
        return new Response(response.body, { status: response.status, headers: response.headers })
      }, { preconnect: () => {} })
      const observations: GraphResponseObservation[] = []
      const intents: GraphPaymentIntent[] = []
      const query = makePaidQuery(KEY, { fetch: localFetch, timeoutMs: 3000, observeResponse: async observation => { observations.push(observation) },
        beforePaidRequest: async intent => {
          intents.push(intent); expect(signed).toBe(0); expect(Object.isFrozen(intent.authorization)).toBe(true)
          if (mode === "intent-refusal") throw Error("private intent persistence failure")
        } })
      if (mode === "success") expect(await query(args())).toMatchObject({ costAtomic: "10000", paymentTx: TX })
      else { await expect(query(args())).rejects.toThrow(/^graph query could not be completed$/); if (mode === "signed-500" || mode === "intent-refusal") await expect(query(args())).rejects.toThrow() }
      expect(unsigned).toBe(1); expect(signed).toBe(mode === "redirect" || mode === "intent-refusal" ? 0 : 1); expect(foreign).toBe(0)
      expect(JSON.stringify(wire)).not.toContain(KEY)
      expect(wire.every((w) => w.headers.authorization === undefined && w.headers.cookie === undefined && w.headers["x-api-key"] === undefined)).toBe(true)
      expect(observations.length).toBe(mode === "redirect" ? 0 : wire.length)
      expect(observations.every(value => value.complete && Object.isFrozen(value) && Object.isFrozen(value.headers))).toBe(true)
      expect(JSON.stringify(observations)).not.toContain(KEY)
      expect(intents).toHaveLength(mode === "redirect" ? 0 : 1); expect(JSON.stringify(intents)).not.toContain(KEY)
      if (signed === 1) expect(intents[0]!.authorization.nonce).toBe(nonce!)
      if (mode === "signed-500") {
        const paid = observations.filter(value => value.phase === "paid")
        expect(paid).toHaveLength(1); expect(paid[0]!.status).toBe(500)
        expect(Buffer.from(paid[0]!.bodyBase64, "base64").toString()).toContain('"data"')
      }
    } finally { await Promise.all([server.stop(true), other.stop(true)]) }
  })
})

describe("actual inert subprocess key-reader boundary", () => {
  it("returns bounded stdout/exit without inherited credentials or environment", async () => {
    const result = await runKeyCommand([process.execPath, "--no-env-file", "-e", 'console.log(JSON.stringify({keys:Object.keys(process.env),ok:true}))'])
    expect(result.code).toBe(0)
    const parsed = JSON.parse(result.stdout) as { keys: string[]; ok: boolean }
    expect(parsed.ok).toBe(true); expect(parsed.keys).toEqual([])
  })
  it.each(["overflow", "stall"])("reaps the exact owned %s child before reporting fixed failure", async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "graph-key-reader-test-"))
    const path = join(directory, "pid")
    try {
      const program = 'import {writeFileSync} from "node:fs";writeFileSync(process.argv[1],String(process.pid));process.on("SIGTERM",()=>{});' + (mode === "overflow" ? 'process.stdout.write("x".repeat(2048));' : '') + 'setInterval(()=>{},1000)'
      const began = Date.now()
      await expect(runKeyCommand([process.execPath, "--no-env-file", "-e", program, path])).rejects.toThrow(/^graph payer key unavailable$/)
      expect(Date.now() - began).toBeLessThan(3500)
      const pid = Number(await readFile(path, "utf8"))
      expect(Number.isSafeInteger(pid)).toBe(true)
      expect(() => process.kill(pid, 0)).toThrow()
    } finally { await rm(directory, { recursive: true, force: true }) }
  }, 5000)
})
