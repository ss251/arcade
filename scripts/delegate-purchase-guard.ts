/** One bounded facilitator broadcast for the isolated J5 paid call. */
import { constants } from "node:fs"
import { open, lstat, realpath } from "node:fs/promises"
import { dirname } from "node:path"
import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, type Hex } from "viem"
import { FEE_SPLITTER_V2_ABI } from "../packages/payments/src/eip3009.ts"
import { DELEGATE_PROOF as P, proofAddress, proofCheck } from "./delegate-funding-proof.ts"
import { PROOF_FACILITATOR } from "./delegate-proof-keys.ts"
/** Generic recovery seam for ephemeral offline signers; live installer fixes the facilitator. */
export async function assertProofSettlementTransaction(raw: unknown, facilitator: Hex = PROOF_FACILITATOR): Promise<Hex> {
  proofCheck(typeof raw === "string" && /^0x02[0-9a-f]+$/.test(raw) && raw.length <= 16384 && raw.length % 2 === 0)
  const tx = parseTransaction(raw as Hex)
  proofCheck(tx.type === "eip1559" && tx.chainId === 5042002 && tx.to?.toLowerCase() === P.splitter && (tx.value ?? 0n) === 0n &&
    tx.gas && tx.gas > 0n && tx.maxFeePerGas && tx.maxFeePerGas > 0n && tx.gas * tx.maxFeePerGas <= P.perTransactionGasCapWei &&
    (tx.maxPriorityFeePerGas ?? 0n) <= tx.maxFeePerGas && !tx.accessList?.length && tx.data &&
    proofAddress(await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })) === proofAddress(facilitator))
  const decoded = decodeFunctionData({ abi: FEE_SPLITTER_V2_ABI, data: tx.data })
  // A first-party call with no hires uses ordinary settle, not an empty on-chain tree.
  proofCheck(decoded.functionName === "settle")
  proofCheck(proofAddress(decoded.args[0]) === P.delegate && decoded.args[1] === P.paymentAtomic)
  return keccak256(raw as Hex)
}
const READ = new Set(["eth_chainId", "eth_getBalance", "eth_getCode", "eth_call", "eth_getBlockByNumber", "eth_blockNumber",
  "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getLogs"])
let installed = false
/** This is installed only inside the owned hub preload. Journal contains one public hash, never raw bytes. */
export async function installProofRelayGuard(path: string) {
  proofCheck(!installed)
  const parent = dirname(path), st = await lstat(parent)
  proofCheck(st.isDirectory() && !st.isSymbolicLink() && (st.mode & 0o777) === 0o700 && st.uid === process.getuid?.() &&
    await realpath(parent) === parent)
  const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o600)
  const directory = await open(parent, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const actual = await directory.stat(); proofCheck(actual.dev === st.dev && actual.ino === st.ino)
    await directory.sync()
  } finally { await directory.close() }
  installed = true
  const nativeFetch = globalThis.fetch
  let attempted = false, requests = 0, closed = false
  globalThis.fetch = (async (input, init) => {
    proofCheck(!closed)
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (new URL(url).origin !== P.rpc) return nativeFetch(input, init)
    proofCheck(++requests <= 500 && typeof input === "string" && new URL(input).href === new URL(P.rpc).href &&
      init?.method === "POST" && typeof init.body === "string" && init.body.length <= 32768)
    const body = JSON.parse(init.body)
    proofCheck(body && !Array.isArray(body) && body.jsonrpc === "2.0" && Array.isArray(body.params))
    if (body.method === "eth_sendRawTransaction") {
      proofCheck(!attempted && body.params.length === 1); attempted = true
      const txHash = await assertProofSettlementTransaction(body.params[0])
      const fs = await file.stat()
      proofCheck(fs.nlink === 1 && fs.uid === process.getuid?.() && (fs.mode & 0o777) === 0o600 && fs.size === 0)
      const atPath = await lstat(path); proofCheck(atPath.ino === fs.ino && atPath.dev === fs.dev && !atPath.isSymbolicLink())
      await file.writeFile(JSON.stringify({ stage: "settlement_prepared", txHash }) + "\n"); await file.sync()
    } else proofCheck(READ.has(body.method))
    proofCheck(!closed)
    return nativeFetch(input, init)
  }) as typeof fetch
  return Object.freeze({ async close() {
    if (!closed) { closed = true; globalThis.fetch = nativeFetch; installed = false; await file.close() }
  } })
}
