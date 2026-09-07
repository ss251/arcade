import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, realpath, rm, stat, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, keccak256, padHex, parseAbi, type Hex, type TransactionSerializableEIP1559 } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { assertDelegateMintLogs, assertDelegateProofIdentity, assertFreshDelegateProof, captureProofEvent,
  DELEGATE_PROOF as P, nextProofStage, proofStages, readDelegateAvailable, ownerProofCall, assertProofSignedTransaction,
  type DelegateProofSnapshot, type ProofLog, type ProofStage } from "./delegate-funding-proof.ts"
import { openDelegateProofJournal } from "./delegate-funding-journal.ts"

const HASH = `0x${"11".repeat(32)}` as Hex
const fresh: DelegateProofSnapshot = { blockNumber: 1n, blockHash: HASH, timestamp: 1n, ownerNativeWei: 1000000000000000000n,
  delegateNativeWei: 100000000000000000n, allowance: 0n, ownerGatewayTotal: 0n, available: 0n, pendingBatch: 0n, authorized: false, withdrawalDelay: 1209600n }
const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })
async function directory() { const p = await realpath(await mkdtemp(join(tmpdir(), "arcade-j5-proof-"))); await chmod(p, 0o700); directories.push(p); return p }
describe("delegated funding proof contracts", () => {
  test("owner calls bind the approved delegate and exact depositFor/allowance amounts", () => {
    const abi = parseAbi(["function addDelegate(address token,address delegate)", "function approve(address spender,uint256 amount)",
      "function depositFor(address token,address recipient,uint256 amount)"])
    const grant = ownerProofCall("grant"), approve = ownerProofCall("approval"), deposit = ownerProofCall("deposit")
    expect(grant.to).toBe(P.wallet); expect(approve.to).toBe(P.token); expect(deposit.to).toBe(P.wallet)
    expect(decodeFunctionData({ abi, data: grant.data }).args?.map(x => typeof x === "string" ? x.toLowerCase() : x)).toEqual([P.token, P.delegate])
    expect(decodeFunctionData({ abi, data: approve.data }).args?.map(x => typeof x === "string" ? x.toLowerCase() : x)).toEqual([P.wallet, 500000n])
    expect(decodeFunctionData({ abi, data: deposit.data }).args?.map(x => typeof x === "string" ? x.toLowerCase() : x)).toEqual([P.token, P.owner, 500000n])
    expect(() => ownerProofCall("other" as never)).toThrow()
  })
  test("signed owner transaction is exact, recovered, finite-gas and testnet-only", async () => {
    const signer = privateKeyToAccount(generatePrivateKey())
    const tx: TransactionSerializableEIP1559 = { ...ownerProofCall("grant"), type: "eip1559", chainId: 5042002, nonce: 0,
      gas: 100000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 0n }
    const raw = await signer.signTransaction(tx)
    expect(await assertProofSignedTransaction(raw, tx, signer.address)).toBe(keccak256(raw))
    for (const changed of [{ ...tx, chainId: 1 }, { ...tx, nonce: 1 }, { ...tx, value: 1n }, { ...tx, data: "0x1234" as Hex },
      { ...tx, gas: 100001n }, { ...tx, maxFeePerGas: 1000000001n }, { ...tx, maxPriorityFeePerGas: 1n },
      { ...tx, gas: 100000001n }]) await expect(assertProofSignedTransaction(raw, changed, signer.address)).rejects.toThrow()
    await expect(assertProofSignedTransaction(raw, tx, P.owner)).rejects.toThrow()
    await expect(assertProofSignedTransaction("0x00", tx, signer.address)).rejects.toThrow()
  })
  test("fresh proof requires no earlier grant, allowance or owner custody and reserves gas", () => {
    expect(() => assertFreshDelegateProof(fresh)).not.toThrow()
    for (const key of ["allowance", "ownerGatewayTotal", "available", "pendingBatch"] as const) expect(() => assertFreshDelegateProof({ ...fresh, [key]: 1n })).toThrow()
    expect(() => assertFreshDelegateProof({ ...fresh, authorized: true })).toThrow()
    expect(() => assertFreshDelegateProof({ ...fresh, ownerNativeWei: 799999999999999999n })).toThrow()
    expect(() => assertFreshDelegateProof({ ...fresh, delegateNativeWei: 99999999999999999n })).toThrow()
    expect(() => assertFreshDelegateProof({ ...fresh, withdrawalDelay: 0n })).toThrow()
  })
  test("pending batch remains separate from available credit", () => {
    const body = { token: "USDC", balances: [{ domain: 26, depositor: P.owner, balance: "0.25", pendingBatch: "0.5" }] }
    expect(readDelegateAvailable(body)).toEqual({ available: 250000n, pendingBatch: 500000n })
    expect(() => readDelegateAvailable({ ...body, balances: [{ ...body.balances[0], depositor: P.delegate }] })).toThrow()
    expect(() => readDelegateAvailable({ ...body, balances: [{ ...body.balances[0], unknown: "0.5" }] })).toThrow()
    expect(() => readDelegateAvailable({ ...body, balances: [{ ...body.balances[0], pendingBatch: "-1" }] })).toThrow()
  })
  test("deployment identity never accepts arbitrary observed code or slots", () => {
    for (const role of ["wallet", "minter"] as const) expect(() => assertDelegateProofIdentity(role, "0x6000", HASH, "0x6000")).toThrow()
  })
  test("events are closed, public-only and preserve exact next-stage order", () => {
    expect(captureProofEvent("grant_prepared", { txHash: HASH, gasWei: 7n })).toEqual({ stage: "grant_prepared", facts: { txHash: HASH, gasWei: "7" } })
    expect(() => captureProofEvent("grant_prepared", {})).toThrow()
    expect(() => captureProofEvent("burn_prepared", { specHash: HASH })).toThrow()
    expect(() => captureProofEvent("source_checked", {})).toThrow()
    expect(() => captureProofEvent("planned", { signature: HASH } as never)).toThrow()
    let accessed = false
    expect(() => captureProofEvent("planned", { get amount() { accessed = true; return 1n } })).toThrow()
    expect(accessed).toBe(false)
    let previous: ProofStage | undefined
    for (const stage of proofStages.slice(0, -1)) { expect(() => nextProofStage(previous, stage)).not.toThrow(); previous = stage }
    expect(() => nextProofStage("planned", "deposit_prepared")).toThrow()
    expect(() => nextProofStage("grant_prepared", "grant_prepared")).toThrow()
    expect(() => nextProofStage("complete", "uncertain")).toThrow()
    expect(() => nextProofStage("planned", "uncertain")).not.toThrow()
    expect(() => nextProofStage("uncertain", "planned")).toThrow()
  })
  const abi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)",
    "event AttestationUsed(address indexed token,address indexed recipient,bytes32 indexed transferSpecHash,uint32 sourceDomain,bytes32 sourceDepositor,bytes32 sourceSigner,uint256 value)"])
  const logs = (): ProofLog[] => [
    { address: P.token, topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from: "0x" + "00".repeat(20) as Hex, to: P.delegate } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [250000n]) },
    { address: P.minter, topics: encodeEventTopics({ abi, eventName: "AttestationUsed", args: { token: P.token, recipient: P.delegate, transferSpecHash: HASH } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [26, padHex(P.owner, { size: 32 }), padHex(P.delegate, { size: 32 }), 250000n]) }
  ]
  test("delivery requires one exact native mint and correlated owner/delegate attestation", () => {
    expect(() => assertDelegateMintLogs(logs(), HASH)).not.toThrow()
    expect(() => assertDelegateMintLogs(logs().slice(1), HASH)).toThrow()
    expect(() => assertDelegateMintLogs([...logs(), logs()[0]!], HASH)).toThrow()
    expect(() => assertDelegateMintLogs(logs(), `0x${"22".repeat(32)}`)).toThrow()
    const wrong = logs(); wrong[1] = { ...wrong[1]!, data: encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
      [26, padHex(P.delegate, { size: 32 }), padHex(P.delegate, { size: 32 }), 250000n]) }
    expect(() => assertDelegateMintLogs(wrong, HASH)).toThrow()
  })
})
describe("fresh owned proof journal", () => {
  test("fsynced closed fields, mode0600 and exclusive creation retain evidence after close", async () => {
    const path = join(await directory(), "proof.jsonl"), j = await openDelegateProofJournal(path)
    await j.append("planned"); await j.append("grant_prepared", { txHash: HASH }); await j.append("uncertain")
    await j.close(); await j.close()
    const lines = (await readFile(path, "utf8")).trim().split("\n").map(s => JSON.parse(s))
    expect(lines).toHaveLength(4)
    expect(lines[0].format).toBe("arcade-delegate-proof-v1")
    expect(lines[1].sequence).toBe(0)
    expect(lines[2].previousHash).toBe(lines[1].hash)
    expect(lines[3].event.stage).toBe("uncertain")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(openDelegateProofJournal(path)).rejects.toThrow()
    await expect(j.append("planned")).rejects.toThrow()
  })
  test("bad transition poisons further appends without erasing earlier evidence", async () => {
    const path = join(await directory(), "proof.jsonl"), j = await openDelegateProofJournal(path)
    await j.append("planned")
    await expect(j.append("deposit_prepared", { txHash: HASH })).rejects.toThrow()
    await expect(j.append("grant_prepared", { txHash: HASH })).rejects.toThrow()
    await j.close()
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2)
  })
  test("symlink and non-private parents refuse", async () => {
    const root = await directory(), link = join(root, "link")
    await symlink(root, link)
    await expect(openDelegateProofJournal(join(link, "proof.jsonl"))).rejects.toThrow()
    await chmod(root, 0o755)
    await expect(openDelegateProofJournal(join(root, "proof.jsonl"))).rejects.toThrow()
  })
})
