/** Keyless cost probe; the transfer HTTP transport is a non-network stub. */
import { parseAbi } from "viem"
import { createUnifiedGatewayBoundary } from "../packages/buyer/src/unified-balance-network.ts"
import { DELEGATE_PROOF as P } from "./delegate-funding-proof.ts"
import type { DelegateProofChain } from "./delegate-funding-chain.ts"
const ABI = parseAbi(["function domain() view returns(uint32)", "function paused() view returns(bool)",
  "function isTokenSupported(address token) view returns(bool)",
  "function isAuthorizedForBalance(address token,address depositor,address addr) view returns(bool)",
  "function withdrawalDelay() view returns(uint256)"])
/** Mirrors the IO inventory of unified-balance-runtime limits(). Values are not
 * authorization evidence; this checks cost only, before any owner grant or key. */
export interface DelegateReadCost {
  readonly complete: boolean; readonly readFailed: boolean; readonly interrupted: boolean; readonly dispatchReached: boolean
  readonly callbackElapsedMs: number; readonly boundaryElapsedMs: number; readonly actualTransferRequests: 0
}
export async function profileDelegateReadCost(chain: DelegateProofChain, signal: AbortSignal): Promise<DelegateReadCost> {
  let complete = false, readFailed = false, dispatchReached = false, ended = false, entered = false, interrupted = false, callbackElapsedMs = 0
  let finish!: () => void
  const completion = new Promise<void>(resolve => { finish = resolve })
  const started = performance.now()
  const reads: Array<() => Promise<unknown>> = [
    () => chain.client.getChainId(), () => chain.client.getChainId(),
    () => chain.client.getCode({ address: P.minter }), () => chain.client.getCode({ address: P.token }),
    () => chain.client.readContract({ address: P.minter, abi: ABI, functionName: "domain" }),
    () => chain.client.readContract({ address: P.minter, abi: ABI, functionName: "paused" }),
    () => chain.client.readContract({ address: P.minter, abi: ABI, functionName: "isTokenSupported", args: [P.token] }),
    () => chain.client.getBalance({ address: P.delegate }),
    () => chain.client.getCode({ address: P.wallet }), () => chain.client.getCode({ address: P.token }),
    () => chain.client.readContract({ address: P.wallet, abi: ABI, functionName: "domain" }),
    () => chain.client.readContract({ address: P.wallet, abi: ABI, functionName: "paused" }),
    () => chain.client.readContract({ address: P.wallet, abi: ABI, functionName: "isTokenSupported", args: [P.token] }),
    () => chain.client.readContract({ address: P.wallet, abi: ABI, functionName: "isAuthorizedForBalance", args: [P.token, P.owner, P.delegate] }),
    () => chain.available(), () => chain.client.getBlockNumber({ cacheTime: 0 }),
    () => chain.client.readContract({ address: P.wallet, abi: ABI, functionName: "withdrawalDelay" })
  ]
  const boundary = createUnifiedGatewayBoundary({ signal, deadlineMs: performance.now() + 30000,
    request: async () => { dispatchReached = true; throw Error("probe_has_no_transfer_transport") },
    beforeTransfer: async () => {
      entered = true
      try {
        for (const read of reads) {
          if (ended || signal.aborted) throw Error("probe_ended")
          await read()
        }
        complete = true
      } catch { interrupted = ended || signal.aborted; readFailed = !interrupted; throw Error("probe_read_unavailable") }
      finally { callbackElapsedMs = Math.round(performance.now() - started); finish() }
    } })
  try { await boundary.fetch("https://gateway-api-testnet.circle.com/v1/transfer", { method: "POST", body: "[]" }) }
  catch { /* Expected non-network stub or the unchanged request bound. */ }
  finally { ended = true }
  const boundaryElapsedMs = Math.round(performance.now() - started)
  // No background work is left running. Reads stop after the current bounded read.
  if (entered) await completion
  boundary.close()
  return Object.freeze({ complete, readFailed, interrupted, dispatchReached, callbackElapsedMs, boundaryElapsedMs, actualTransferRequests: 0 as const })
}
