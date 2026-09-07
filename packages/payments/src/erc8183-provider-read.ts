/** Concrete read-only Arc preflight for a seller signature. No signer configuration,
 * transaction/gas proposal, broadcast port, deployment discovery or rail activation. */
import { createPublicClient, custom, type Hex } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { assertEscrowProviderJob, escrowActionContext } from "./erc8183-actions.ts"
import { packProviderNonce } from "./erc8183-auth.ts"
import { captureEscrowIdentity, createEscrowReader } from "./erc8183-reader.ts"
import { escrowAddress, escrowBytes32, escrowCheck, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { assertEscrowSnapshotFresh } from "./erc8183-request.ts"
import { boundEscrowIO, createEscrowRpc, type EscrowRpcOptions } from "./erc8183-rpc.ts"
export interface EscrowProviderReadOptions extends EscrowRpcOptions {
  readonly identity: unknown; readonly provider: Hex; readonly nowSeconds: () => number
}
export function createEscrowProviderReader(options: EscrowProviderReadOptions) {
  const identity = captureEscrowIdentity(options.identity), provider = escrowAddress(options.provider),
    parent = options.signal, deadline = options.deadlineMs, nowSeconds = options.nowSeconds, rpc = createEscrowRpc(options)
  escrowCheck(provider !== identity.evaluator)
  return Object.freeze({ async read(context: unknown, kind: "budget" | "submit", nonce: bigint, signal: AbortSignal) {
    try {
      const c = escrowActionContext(context), packed = packProviderNonce(provider, escrowUint(nonce, 72))
      escrowCheck((kind === "budget" || kind === "submit") && c.call.provider === provider && c.treasury === identity.treasury)
      for (const key of ["escrow", "hook", "evaluator", "token"] as const) escrowCheck(c.call[key] === identity[key])
      return await boundEscrowIO(async active => {
        let previous = escrowSeconds(nowSeconds())
        const now = () => {
          const n = escrowSeconds(nowSeconds())
          escrowCheck(!active.aborted && performance.now() < deadline && n >= previous); previous = n; return n
        }
        const client = createPublicClient({ cacheTime: 0, batch: { multicall: false }, transport: custom({
          request: ({ method, params }) => rpc.read(method, (params ?? []) as readonly unknown[], active)
        }, { retryCount: 0 }) })
        const snapshot = await createEscrowReader(client, identity, { signal: active, nowSeconds: now }).readJob(c.jobId)
        assertEscrowProviderJob(c, snapshot, kind, now())
        const code = await client.getCode({ address: provider, blockNumber: snapshot.blockNumber })
        // The bounded RPC rejects null/non-hex; viem normalizes valid empty0x to undefined.
        escrowCheck(code === undefined || code === "0x")
        escrowCheck(await client.readContract({ address: identity.escrow, abi: ERC8183_ABI, functionName: "authorizationNonceUsed",
          args: [packed], blockNumber: snapshot.blockNumber }) === false)
        const canonical = await client.getBlock({ blockNumber: snapshot.blockNumber })
        escrowCheck(canonical.number === snapshot.blockNumber && escrowBytes32(canonical.hash, false) === snapshot.blockHash &&
          canonical.timestamp === BigInt(snapshot.timestamp) && await client.getChainId() === 5042002)
        assertEscrowSnapshotFresh(snapshot.timestamp, now()); assertEscrowProviderJob(c, snapshot, kind, now())
        return snapshot
      }, AbortSignal.any([parent, signal]), deadline, 300000)
    } catch { throw Error("escrow_provider_preflight_refused") }
  } })
}
