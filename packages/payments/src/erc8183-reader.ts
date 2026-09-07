/** Read-only escrow identity/state snapshot. Caller supplies a trusted bounded RPC transport.
 * No keys, signing, writes, retries, deployment discovery, or rail installation. */
import { hashDomain, keccak256, type Abi, type Hex } from "viem"
import { ARCADE_JOB_HOOK_ABI, ERC8183_ABI } from "./erc8183-abi.ts"
import { captureEscrowJob, escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds,
  escrowUint, EscrowFactsRefused } from "./erc8183-codec.ts"
import { assertEscrowSnapshotFresh, type EscrowSnapshot } from "./erc8183-request.ts"
const SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
const ID_KEYS = ["chainId", "escrow", "implementation", "hook", "evaluator", "treasury", "token",
  "proxyCodeHash", "implementationCodeHash", "hookCodeHash"] as const
/** These addresses and full runtime hashes must come from independently verified deployment
 * evidence/config, NEVER be learned from the same untrusted RPC response or payment header. */
export function captureEscrowIdentity(input: unknown) {
  try {
    const c = escrowRecord(input, ID_KEYS)
    escrowCheck(c.chainId === 5042002 && escrowAddress(c.token) === "0x3600000000000000000000000000000000000000")
    const escrow = escrowAddress(c.escrow), implementation = escrowAddress(c.implementation), hook = escrowAddress(c.hook)
    escrowCheck(new Set([escrow, implementation, hook]).size === 3)
    return Object.freeze({ chainId: 5042002 as const, escrow, implementation, hook,
      evaluator: escrowAddress(c.evaluator), treasury: escrowAddress(c.treasury), token: escrowAddress(c.token),
      proxyCodeHash: escrowBytes32(c.proxyCodeHash, false), implementationCodeHash: escrowBytes32(c.implementationCodeHash, false),
      hookCodeHash: escrowBytes32(c.hookCodeHash, false) })
  } catch { throw new EscrowFactsRefused() }
}
export type EscrowIdentity = ReturnType<typeof captureEscrowIdentity>
/** Narrow read port, structurally compatible with a viem public client. Production transport
 * must own request cancellation/deadlines and disable retries; signal checks here cannot
 * forcibly cancel a client that ignores its transport's AbortSignal. */
export interface EscrowReadClient {
  getChainId(): Promise<number>
  getBlock(args: { blockTag: "finalized" } | { blockNumber: bigint }): Promise<{
    number: bigint | null; hash: Hex | null; timestamp: bigint
  }>
  getCode(args: { address: Hex; blockNumber: bigint }): Promise<Hex | undefined>
  getStorageAt(args: { address: Hex; slot: Hex; blockNumber: bigint }): Promise<Hex | undefined>
  readContract(args: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[]; blockNumber: bigint }): Promise<unknown>
}
export function createEscrowReader(client: EscrowReadClient, input: unknown,
  options: { readonly signal: AbortSignal; readonly nowSeconds: () => number }) {
  const id = captureEscrowIdentity(input)
  return Object.freeze({ identity: id, async readJob(rawJobId: bigint): Promise<EscrowSnapshot> {
    try {
      const jobId = escrowUint(rawJobId); escrowCheck(jobId > 0n)
      let previous = escrowSeconds(options.nowSeconds()), timestamp: number | undefined
      const active = () => {
        const now = escrowSeconds(options.nowSeconds())
        escrowCheck(!options.signal.aborted && now >= previous); previous = now
        if (timestamp !== undefined) assertEscrowSnapshotFresh(timestamp, now)
      }
      const checked = async <T>(read: () => Promise<T>): Promise<T> => {
        active(); const value = await read(); active(); return value
      }
      escrowCheck(await checked(() => client.getChainId()) === id.chainId)
      const block = await checked(() => client.getBlock({ blockTag: "finalized" }))
      const blockNumber = escrowUint(block.number), blockHash = escrowBytes32(block.hash, false)
      escrowCheck(blockNumber > 0n)
      timestamp = Number(escrowUint(block.timestamp, 48)); active()
      const at = { blockNumber }
      for (const [address, expected] of [[id.escrow, id.proxyCodeHash],
        [id.implementation, id.implementationCodeHash], [id.hook, id.hookCodeHash]] as const) {
        const code = await checked(() => client.getCode({ address, ...at }))
        escrowCheck(typeof code === "string" && /^0x(?:[0-9a-fA-F]{2}){1,24576}$/.test(code) && keccak256(code) === expected)
      }
      const slot = await checked(() => client.getStorageAt({ address: id.escrow, slot: SLOT, ...at }))
      escrowCheck(typeof slot === "string" && /^0x0{24}[0-9a-fA-F]{40}$/.test(slot) &&
        escrowAddress("0x" + slot.slice(-40)) === id.implementation)
      const read = (functionName: string, args: readonly unknown[] = [], hook = false) => checked(() =>
        client.readContract({ address: hook ? id.hook : id.escrow, abi: hook ? ARCADE_JOB_HOOK_ABI : ERC8183_ABI,
          functionName, args, ...at }))
      escrowCheck(await read("paused") === false)
      escrowCheck(await read("platformFeeBP") === 500n && await read("evaluatorFeeBP") === 0n)
      escrowCheck(escrowAddress(await read("platformTreasury")) === id.treasury)
      escrowCheck(await read("allowedPaymentTokens", [id.token]) === true && await read("whitelistedHooks", [id.hook]) === true)
      escrowCheck(escrowAddress(await read("escrow", [], true)) === id.escrow &&
        escrowAddress(await read("evaluator", [], true)) === id.evaluator)
      escrowCheck(escrowBytes32(await read("DOMAIN_SEPARATOR"), false) === hashDomain({
        types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
          { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] },
        domain: { name: "ERC8183", version: "1", chainId: BigInt(id.chainId), verifyingContract: id.escrow } }))
      const job = captureEscrowJob(await read("getJob", [jobId]))
      const pendingClaimHash = escrowBytes32(await read("pendingClaimHash", [jobId]))
      const canonical = await checked(() => client.getBlock({ blockNumber }))
      escrowCheck(canonical.number === blockNumber && escrowBytes32(canonical.hash, false) === blockHash &&
        canonical.timestamp === BigInt(timestamp) && await checked(() => client.getChainId()) === id.chainId)
      return Object.freeze({ chainId: id.chainId, escrow: id.escrow, blockNumber, blockHash, timestamp, jobId, pendingClaimHash, job })
    } catch { throw new EscrowFactsRefused() }
  } })
}
