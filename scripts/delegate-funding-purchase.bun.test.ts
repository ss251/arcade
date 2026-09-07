import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, realpath, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, parseAbi, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { treeHashOf } from "@arcade/core"
import { FEE_SPLITTER_V2_ABI } from "../packages/payments/src/eip3009.ts"
import { DELEGATE_PROOF as P, type ProofLog } from "./delegate-funding-proof.ts"
import { assertDelegatePurchase } from "./delegate-funding-purchase.ts"
import { assertProofSettlementTransaction, installProofRelayGuard } from "./delegate-purchase-guard.ts"
import { parseDelegateProofArgs } from "./e2e-delegate-funding.ts"
const HASH = ("0x" + "11".repeat(32)) as Hex, ID = "job_0123456789abcdef"
const ABI = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Settled(address indexed buyer,uint256 total,uint256 sellerAmount,uint256 feeAmount,bytes32 indexed nonce)"])
const transfer = (from: Hex, to: Hex, value: bigint): ProofLog => ({ address: P.token,
  topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from, to } }) as Hex[],
  data: encodeAbiParameters([{ type: "uint256" }], [value]) })
const settled: ProofLog = { address: P.splitter, topics: encodeEventTopics({ abi: ABI, eventName: "Settled", args: { buyer: P.delegate, nonce: HASH } }) as Hex[],
  data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [10000n, 9500n, 500n]) }
function fixture() {
  const receipt = { jobId: ID, skillId: "usdc-flow-check", skillVersion: "0.1.0", rail: "eip3009", network: "eip155:5042002", settled: true,
    buyer: P.delegate, seller: P.seller, priceAtomic: { __bigint: "10000" }, sellerAtomic: "9500", feeAtomic: "500", feeBps: 500,
    rootJobId: ID, hop: 0, ancestors: [], children: [], treeCommittedAtomic: "0", treeHash: treeHashOf(ID, []), authorizationNonce: HASH, settleTx: HASH }
  const job = { id: ID, skillId: "usdc-flow-check", status: "succeeded", buyer: P.delegate, seller: P.seller, priceAtomic: "10000",
    input: { address: P.delegate }, outcome: { status: "succeeded", stopReason: "end_turn", output: { address: P.delegate, chainId: 5042002, balanceUsdc: "0.25" } } }
  return { receipt, job, logs: [transfer(P.delegate, P.splitter, 10000n), transfer(P.splitter, P.seller, 9500n), settled] }
}
describe("owned first-party J5 purchase", () => {
  test("one ordinary settled call proves the seller payment; fee stays accrued, empty tree is receipt-only", () => {
    const f = fixture()
    expect(assertDelegatePurchase(f.receipt, f.job, f.logs)).toEqual({ txHash: HASH, jobId: ID, amount: 10000n, treeHash: treeHashOf(ID, []) })
    expect(() => assertDelegatePurchase(f.receipt, f.job, [...f.logs, transfer(P.splitter, P.seller, 500n)])).toThrow()
  })
  test("wrong paid rail, parties, price, job outcome, duplicate or absent effect never proves a purchase", () => {
    const f = fixture()
    for (const change of [{ rail: "gateway" }, { canary: true }, { network: "eip155:1" }, { buyer: P.owner },
      { seller: P.owner }, { priceAtomic: "10001" }, { sellerAtomic: "10000" }, { feeAtomic: "0" }, { settled: false },
      { children: [{}] }, { authorizationNonce: "0x" }, { treeHash: "0x" }])
      expect(() => assertDelegatePurchase({ ...f.receipt, ...change }, f.job, f.logs)).toThrow()
    expect(() => assertDelegatePurchase(f.receipt, { ...f.job, status: "failed" }, f.logs)).toThrow()
    expect(() => assertDelegatePurchase(f.receipt, f.job, f.logs.slice(1))).toThrow()
    expect(() => assertDelegatePurchase(f.receipt, f.job, [...f.logs, settled])).toThrow()
    expect(() => assertDelegatePurchase(f.receipt, f.job, [transfer(P.owner, P.splitter, 10000n), ...f.logs.slice(1)])).toThrow()
  })
  test("facilitator guard permits only the exact bounded ordinary testnet settlement", async () => {
    const signer = privateKeyToAccount(generatePrivateKey())
    const args = [P.delegate, 10000n, 0n, 10000n, HASH, 27, HASH, HASH] as const
    const data = encodeFunctionData({ abi: FEE_SPLITTER_V2_ABI, functionName: "settle", args })
    expect(decodeFunctionData({ abi: FEE_SPLITTER_V2_ABI, data }).functionName).toBe("settle")
    const tx = { type: "eip1559" as const, chainId: 5042002, nonce: 0, to: P.splitter, data, value: 0n,
      gas: 100000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 0n }
    const raw = await signer.signTransaction(tx)
    expect(await assertProofSettlementTransaction(raw, signer.address)).toBe(keccak256(raw))
    await expect(assertProofSettlementTransaction(raw)).rejects.toThrow()
    for (const change of [{ chainId: 1 }, { to: P.owner }, { value: 1n }, { gas: 100000001n },
      { data: encodeFunctionData({ abi: FEE_SPLITTER_V2_ABI, functionName: "settle", args: [P.delegate, 10001n, 0n, 10000n, HASH, 27, HASH, HASH] }) },
      { data: encodeFunctionData({ abi: FEE_SPLITTER_V2_ABI, functionName: "settleWithTree", args: [...args, HASH, 0, 0n] }) }]) {
      await expect(assertProofSettlementTransaction(await signer.signTransaction({ ...tx, ...change }), signer.address)).rejects.toThrow()
    }
  })
  test("entry point requires explicit live mode and finite caller-supplied normal burn bound", () => {
    expect(parseDelegateProofArgs(["--help"])).toEqual({ mode: "help" })
    expect(parseDelegateProofArgs(["--dry-run"])).toEqual({ mode: "dry-run" })
    expect(parseDelegateProofArgs(["--live", "--max-burn-block-delta", "1382400"])).toEqual({ mode: "live", maxBurnBlockDelta: 1382400n })
    for (const args of [[], ["--live"], ["--live", "--max-burn-block-delta", "0"], ["--live", "--max-burn-block-delta", String((1n << 256n) - 1n)],
      ["--live", "--max-burn-block-delta", "1.5"], ["--dry-run", "--live"], ["--live", "--max-burn-block-delta", "1", "--retry"]])
      expect(() => parseDelegateProofArgs(args)).toThrow()
  })
  test("owned relay transport rejects alternate writes/repeated sends and restores its scope", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "arcade-j5-relay-"))); await chmod(root, 0o700)
    const original = globalThis.fetch, seen: string[] = []
    const fake = (async (_input: unknown, init?: RequestInit) => {
      const r = JSON.parse(String(init?.body)); seen.push(r.method); return Response.json({ jsonrpc: "2.0", id: r.id, result: "0x4cef52" })
    }) as unknown as typeof fetch
    globalThis.fetch = fake
    let guard: Awaited<ReturnType<typeof installProofRelayGuard>> | undefined
    try {
      const path = join(root, "relay.jsonl"); guard = await installProofRelayGuard(path)
      expect((await stat(path)).mode & 0o777).toBe(0o600)
      const call = (method: string, params: unknown[] = []) => fetch(P.rpc, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
      await call("eth_chainId")
      for (const method of ["eth_sendTransaction", "eth_signTypedData_v4", "wallet_switchEthereumChain"]) await expect(call(method)).rejects.toThrow()
      await expect(call("eth_sendRawTransaction", ["0x02"])).rejects.toThrow()
      await expect(call("eth_sendRawTransaction", ["0x02"])).rejects.toThrow()
      expect(seen).toEqual(["eth_chainId"]); expect((await stat(path)).size).toBe(0)
      const retired = globalThis.fetch
      await guard.close(); expect(globalThis.fetch).toBe(fake)
      await expect(retired(P.rpc, { method: "POST", body: "{}" })).rejects.toThrow()
    } finally { await guard?.close(); globalThis.fetch = original; await rm(root, { recursive: true, force: true }) }
  })
})
