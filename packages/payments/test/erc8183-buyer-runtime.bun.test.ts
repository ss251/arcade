import { describe, expect, spyOn, test } from "bun:test"
import { Effect } from "effect"
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeFunctionData, encodeFunctionResult, erc20Abi, hashDomain, keccak256, parseTransaction, toHex, type Hex } from "viem"
import { formatPrice, loadChainConfig } from "@arcade/core"
import { callSkill } from "../../buyer/src/index.ts"
import { escrowBuyerMain } from "../../buyer/src/erc8183-cli.ts"
import { createEscrowBuyerChain } from "../src/erc8183-buyer-chain.ts"
import { createEscrowBuyerDriver } from "../src/erc8183-buyer-driver.ts"
import { openEscrowBuyerJournal } from "../src/erc8183-buyer-journal.ts"
import { ERC8183_ABI, ARCADE_JOB_HOOK_ABI } from "../src/erc8183-abi.ts"
import { ESCROW_RPC_URL } from "../src/erc8183-rpc.ts"
import { buyerFixture, buyer, hash, ephemeralBuyerKey } from "./fixtures/erc8183-buyer.ts"
type Kind = "create" | "budget" | "approve" | "fund"
const kinds = ["create", "budget", "approve", "fund"] as const
const abi = [...ERC8183_ABI, ...ARCADE_JOB_HOOK_ABI, ...erc20Abi] as const
async function scenario(badBudget: boolean, sdk: boolean | "cli" = false) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-buyer-runtime-test-"))); chmodSync(dir, 0o700)
  const owned = openEscrowBuyerJournal(join(dir, "purchase.sqlite")), controller = new AbortController(),
    jobId = "job_" + "a".repeat(32), token = "b".repeat(32), httpCalls: string[] = [], sends: string[] = []
  let phase = 0, acquisitions = 0, requests = 0
  let rng: ReturnType<typeof spyOn<typeof crypto, "getRandomValues">> | undefined
  const all = {} as Record<Kind, Awaited<ReturnType<typeof buyerFixture>>>
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request): Promise<Response> {
    const url = new URL(request.url), f = all.create
    if (sdk && url.pathname === "/listings/skill") {
      httpCalls.push("listing")
      return Response.json({ id: "skill", version: "1.0.0", seller: f.intent.call.provider, price: "$0.30", rails: ["erc8183"],
        bounds: { timeoutSec: 60 }, delisted: false, erc8004: { agentId: "8", verified: true, chain: "eip155:5042002", registry: loadChainConfig().erc8004!.identity } })
    }
    if (sdk && url.pathname === `/jobs/${jobId}/result`) {
      httpCalls.push("poll"); expect(url.searchParams.get("token")).toBe(token)
      return Response.json({ job_id: jobId, status: "succeeded", result: { fixture: true }, receipt: { settled: true, price: "$0.30" },
        authorizedRail: "gateway", authorizedAmountAtomic: "1", escrowEvidence: { forged: true } })
    }
    if (url.pathname === "/healthz") { httpCalls.push("health"); return Response.json({ ok: true, rail: "gateway",
      rails: ["gateway", "erc8183"], network: "eip155:5042002", erc8183: f.intent.identity }) }
    if (url.pathname.endsWith("/escrow")) {
      httpCalls.push("budget"); expect(phase).toBe(1); expect(request.method).toBe("POST")
      const envelope = await request.json() as { input: unknown; payment: { payload: { jobId: string; capability: string } } }
      expect(envelope.input).toEqual({ fixture: true }); expect(envelope.payment.payload).toEqual({ jobId: "7", capability: f.input.capability })
      expect(request.headers.has("payment-signature")).toBe(false); phase = 2
      return Response.json({ status: "budget_set", jobId: "7", budget: badBudget ? "300001" : "300000", token: f.intent.call.token,
        escrow: f.intent.call.escrow, budgetTx: all.budget.tx.hash, fundBy: f.intent.fundBy })
    }
    if (sdk && !request.headers.has("payment-signature")) {
      httpCalls.push("probe"); expect(phase).toBe(0); expect(await request.json()).toEqual({ fixture: true })
      return Response.json({ x402Version: 2, accepts: [f.input.requirements] }, { status: 402 })
    }
    httpCalls.push("root"); expect(phase).toBe(4)
    expect(await request.json()).toEqual({ fixture: true })
    expect(JSON.parse(Buffer.from(request.headers.get("payment-signature")!, "base64").toString()).payload)
      .toEqual({ jobId: "7", capability: f.input.capability })
    return Response.json({ job_id: jobId, status: "queued", job_token: token, price: formatPrice(f.intent.call.amount),
      poll_url: `${server.url.origin}/jobs/${jobId}/result?token=${token}` }, { status: 202 })
  } })
  try {
    for (const kind of kinds) {
      const f = await buyerFixture(kind, { origin: server.url.origin }), offset = kinds.indexOf(kind), nonce = kind === "budget" ? 3 : ({ create: 3, approve: 4, fund: 5 })[kind],
        raw = kind === "budget" ? f.raw : await buyer.signTransaction({ ...f.transaction, nonce }), txHash = keccak256(raw),
        blockNumber = 51n + BigInt(offset), blockHash = hash(51 + offset)
      all[kind] = { ...f, raw, tx: { ...f.tx, nonce, hash: txHash, blockNumber, blockHash },
        receipt: { ...f.receipt, transactionHash: txHash, blockNumber, blockHash,
          logs: f.receipt.logs.map(l => ({ ...l, transactionHash: txHash, blockNumber, blockHash })) },
        after: { ...f.after, blockNumber, blockHash, timestamp: 1001 + offset } }
    }
    const f = all.create, id = f.intent.identity, frames = [f.snapshot, ...kinds.map(k => all[k].after)],
      getters: Record<string, unknown> = { paused: false, platformFeeBP: 500n, evaluatorFeeBP: 0n, platformTreasury: id.treasury,
        allowedPaymentTokens: true, whitelistedHooks: true, escrow: id.escrow, evaluator: id.evaluator, pendingClaimHash: hash(0),
        DOMAIN_SEPARATOR: hashDomain({ types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
          { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] },
          domain: { name: "ERC8183", version: "1", chainId: 5042002n, verifyingContract: id.escrow } }) }
    const at = (raw: string) => raw === "latest" || raw === "finalized" ? frames[phase]! : frames[Number(BigInt(raw) - 50n)]!
    const hexify = (value: unknown): unknown => {
      if (typeof value === "bigint" || typeof value === "number") return toHex(value)
      if (Array.isArray(value)) return value.map(hexify)
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hexify(v)]))
      return value
    }
    const answer = (method: string, params: unknown[]): unknown => {
      if (method === "eth_chainId") return toHex(5042002)
      if (method === "eth_getTransactionCount") { expect(params[0]).toBe(f.intent.client); return toHex(3 + sends.length) }
      if (method === "eth_getBlockByNumber") { const frame = at(params[0] as string)
        return { number: toHex(frame.blockNumber), hash: frame.blockHash, timestamp: toHex(frame.timestamp), transactions: [] } }
      if (method === "eth_getCode") return params[0] === id.escrow ? "0x01" : params[0] === id.implementation ? "0x02" : params[0] === id.hook ? "0x03" : "0x"
      if (method === "eth_getStorageAt") return "0x" + "00".repeat(12) + id.implementation.slice(2)
      if (method === "eth_call") {
        const { functionName } = decodeFunctionData({ abi, data: (params[0] as { data: Hex }).data }), frame = at(params[1] as string),
          value = functionName === "getJob" ? frame.job : functionName === "allowance" ? (frame.blockNumber === 53n ? 300000n : 0n) : getters[functionName]
        return encodeFunctionResult({ abi, functionName, result: value as never })
      }
      if (method === "eth_getBalance") return toHex(10n ** 20n)
      if (method === "eth_estimateGas") return toHex(833333n)
      if (method === "eth_gasPrice") return "0x1"
      if (method === "eth_sendRawTransaction") {
        const kind = phase === 0 ? "create" : phase === 2 ? "approve" : phase === 3 ? "fund" : undefined
        expect(kind).toBeDefined(); expect(params[0]).toBe(all[kind!].raw)
        sends.push(kind!); phase++; return all[kind!].tx.hash
      }
      const tx = kinds.map(k => all[k]).find(row => row.tx.hash === params[0])
      expect(tx).toBeDefined()
      if (method === "eth_getTransactionReceipt") return hexify({ ...tx!.receipt, status: 1, type: 2 })
      if (method === "eth_getTransactionByHash") return hexify({ ...parseTransaction(tx!.raw as `0x02${string}`), ...tx!.tx, type: 2, transactionIndex: 0 })
      throw Error("unhandled synthetic RPC")
    }
    const rpcFetch = (async (url, init) => {
      expect(String(url)).toBe(ESCROW_RPC_URL); requests++
      const r = JSON.parse(String(init?.body))
      return Response.json({ jsonrpc: "2.0", id: r.id, result: answer(r.method, r.params) })
    }) as typeof globalThis.fetch
    const deadlineMs = performance.now() + 15000, nowSeconds = () => 1000 + phase,
      driver = createEscrowBuyerDriver({ signal: controller.signal, deadlineMs, nowSeconds, journal: owned.journal,
        beforeSign: () => null, fetch: (async (url, init) => { expect(new URL(String(url)).origin).toBe(server.url.origin)
          return globalThis.fetch(url, init) }) as typeof globalThis.fetch,
        chain: (kind, intent) => createEscrowBuyerChain({ kind, intent, signal: controller.signal, deadlineMs, nowSeconds,
          fetch: rpcFetch, acquireSigner: async () => { acquisitions++; return buyer } }) })
    const execute = async () => {
      if (!sdk) return driver.execute(f.input, JSON.stringify({ fixture: true }))
      // Fixture-only deterministic capability. The SDK production path still uses
      // crypto.getRandomValues; keys above were generated before this scoped spy.
      rng = spyOn(crypto, "getRandomValues").mockImplementation((array: Uint8Array) => {
        if (!(array instanceof Uint8Array)) throw Error("unexpected fixture RNG")
        array.fill(0); array[array.length - 1] = 77; return array
      })
      if (sdk === "cli") {
        const lines: string[] = [], configPath = join(dir, "buyer.json")
        writeFileSync(configPath, JSON.stringify({ identity: id, buyer: buyer.address, gasBudgetWei: "6000000", expiresInSeconds: 1800, operationTimeoutMs: 15000 }), { mode: 0o600 })
        const env = new Proxy({ ARCADE_BUYER_ESCROW_CONFIG: configPath, ARCADE_BUYER_ESCROW_JOURNAL: join(dir, "purchase.sqlite"), ARCADE_BUYER_KEY: ephemeralBuyerKey },
          { get(t, p) { if (p === "ARCADE_BUYER_KEY") acquisitions++; return t[p as keyof typeof t] } })
        const code = await escrowBuyerMain(["skill", "--rail", "erc8183", "--hub", server.url.origin, "--seller", f.intent.call.provider,
          "--input", '{"fixture":true}', "--max-amount", "0.30"], { env, rpcFetch, nowSeconds,
          fetch: (async (url, init) => { expect(new URL(String(url)).origin).toBe(server.url.origin); return globalThis.fetch(url, init) }) as typeof globalThis.fetch,
          write: async line => { lines.push(line) } })
        expect(code).toBe(0); expect(lines).toHaveLength(1)
        const out = JSON.parse(lines[0]!)
        expect(out).toMatchObject({ jobId, maximumExposureAtomic: "300001", evidence: { fundedAtomic: "300000", buyerGasWei: "600000",
          buyerGasAtomic: "1", settlementVerified: false, refundVerified: false } })
        expect(lines[0]).not.toContain(ephemeralBuyerKey); expect(lines[0]).not.toContain(token); expect(lines[0]).not.toContain(configPath)
        const state = await owned.journal.inspect(); if (!("proofs" in state)) throw Error("fixture journal empty")
        return { response: Response.json({ jobId, authorizedRail: "erc8183" }), evidence: { rail: "erc8183" as const, state: "funded_and_queued" as const,
          intentId: state.intentId, jobId: state.proofs[0]!.jobId, fundedAtomic: state.proofs[3]!.fundedAtomic, buyerGasWei: state.spentGasWei, proofs: state.proofs } }
      }
      const out = await Effect.runPromise(callSkill({ hubUrl: server.url.origin, seller: f.intent.call.provider, skillId: "skill", input: { fixture: true },
        account: { ...buyer, signTransaction: async (t: Parameters<typeof buyer.signTransaction>[0]) => { acquisitions++; return buyer.signTransaction(t) } }, maxAmountAtomic: 300000n, preferRail: ["erc8183"],
        escrow: { identity: id, gasBudgetWei: 6000000n, expiresInSeconds: 1800, operationTimeoutMs: 15000, journal: owned.journal, rpcFetch, nowSeconds },
        fetch: (async (url, init) => { expect(new URL(String(url)).origin).toBe(server.url.origin); return globalThis.fetch(url, init) }) as typeof globalThis.fetch }))
      expect(out.authorizedRail).toBe("erc8183"); expect(out.authorizedAmountAtomic).toBe(300000n)
      expect(out.escrowEvidence).not.toHaveProperty("forged"); expect(out).not.toHaveProperty("job_token")
      return { response: Response.json({ jobId: out.jobId, authorizedRail: out.authorizedRail }), evidence: out.escrowEvidence! }
    }
    if (badBudget) {
      await expect(execute()).rejects.toThrow("escrow_buyer_uncertain")
      expect(sends).toEqual(["create"]); expect(acquisitions).toBe(1); expect(httpCalls).toEqual(["health", "budget"])
      expect(await owned.journal.inspect()).toMatchObject({ state: "uncertain" })
    } else {
      const result = await execute()
      expect(result.evidence).toMatchObject({ state: "funded_and_queued", fundedAtomic: 300000n, buyerGasWei: 600000n })
      expect(result.evidence.proofs.map(p => p.kind)).toEqual([...kinds])
      expect(sends).toEqual(["create", "approve", "fund"]); expect(acquisitions).toBe(sdk === "cli" ? 1 : 3)
      expect(httpCalls).toEqual(sdk ? ["listing", "probe", "health", "budget", "root", "poll"] : ["health", "budget", "root"]); expect(requests).toBeGreaterThan(150)
      expect((await owned.journal.readAccepted())?.token).toBe(token)
      expect(await result.response.json()).toMatchObject(sdk ? { jobId, authorizedRail: "erc8183" } : { job_id: jobId, job_token: token })
    }
  } finally { rng?.mockRestore(); controller.abort(); await server.stop(true); owned.close(); rmSync(dir, { recursive: true, force: true }) }
}
describe("buyer driver + real Arc ports + owned loopback + private SQLite (synthetic chain)", () => {
  test("records one create/budget/approve/fund/root sequence and privately retains the actual202", () => scenario(false))
  test("an invalid actual HTTP budget response stops before buyer approval", () => scenario(true))
  test("actual SDK independently captures listing, probes, buys and polls without trusting remote funding fields", () => scenario(false, true))
  test("actual strict CLI uses private owner configuration and exports journal-qualified JSON-safe funding proof", () => scenario(false, "cli"))
})
