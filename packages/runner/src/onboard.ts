import { Effect } from "effect"
import { createPublicClient, http } from "viem"
import { ARC_RPC_URL, USDC_ADDRESS } from "@arcade/core"
import { addressForKey, normaliseAddress, WalletError } from "./wallet.ts"

/**
 * Going from nothing to earning.
 *
 * The onboarding surface a seller faces elsewhere in this market is: deploy a public
 * origin, add a KV store, provision an API key with enough authority to serve every
 * caller, write per-caller authorization so it does not leak one buyer's data to another,
 * write rate limiting, publish a discovery document, get facilitator credentials, register
 * with an index. Because the runner dials out, most of that has no equivalent here — what
 * is left is an identity to be paid at and a hub to connect to, and this module exists so
 * that is one command rather than a prerequisite the seller has to already satisfy.
 *
 * The decision of *which* identity is separated from doing anything about it, so the
 * branch a seller lands in is testable without touching a keychain, a chain or a network.
 */

export type IdentityPlan =
  /** No identity yet — make one and put the key in the keychain. */
  | { readonly _tag: "Generate" }
  /** A key was supplied; adopt the address it controls. */
  | { readonly _tag: "Import"; readonly privateKey: string; readonly address: string }
  /** An address was supplied; its key must already be reachable (env or keychain). */
  | { readonly _tag: "UseAddress"; readonly address: string }

export interface IdentityInput {
  readonly seller?: string | undefined
  readonly importKey?: string | undefined
}

/**
 * `--import` wins over `--seller` because it is strictly more specific: a key determines an
 * address, so supplying both and having them disagree is a mistake worth failing on rather
 * than silently resolving.
 */
export const planIdentity = (input: IdentityInput): IdentityPlan => {
  if (input.importKey !== undefined && input.importKey !== "") {
    const address = addressForKey(input.importKey)
    if (input.seller !== undefined && input.seller !== "") {
      const claimed = normaliseAddress(input.seller)
      if (claimed !== address) {
        throw new WalletError(
          `--import controls ${address} but --seller says ${claimed}. Pass one, or matching values.`
        )
      }
    }
    const normalised = input.importKey.startsWith("0x") ? input.importKey : `0x${input.importKey}`
    return { _tag: "Import", privateKey: normalised, address }
  }

  if (input.seller !== undefined && input.seller !== "") {
    return { _tag: "UseAddress", address: normaliseAddress(input.seller) }
  }

  return { _tag: "Generate" }
}

export interface HubStatus {
  readonly reachable: boolean
  readonly rail?: string
  readonly network?: string
  readonly error?: string
}

/**
 * Best-effort reachability check. A hub that is down must not stop a seller finishing
 * setup — the runner reconnects with backoff, so the useful thing is to say so and carry
 * on rather than to abort onboarding on a transient failure.
 */
export const checkHub = (hubUrl: string, timeoutMs = 4000) =>
  Effect.tryPromise({
    try: async (): Promise<HubStatus> => {
      try {
        const res = await fetch(`${hubUrl.replace(/\/$/, "")}/healthz`, {
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` }
        const body = (await res.json()) as { rail?: string; network?: string }
        return {
          reachable: true,
          ...(body.rail === undefined ? {} : { rail: body.rail }),
          ...(body.network === undefined ? {} : { network: body.network })
        }
      } catch (e) {
        return { reachable: false, error: String((e as Error)?.message ?? e) }
      }
    },
    catch: (e) => new Error(String((e as Error)?.message ?? e))
  })

const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const

/**
 * Earnings, in atomic USDC.
 *
 * Deliberately `balanceOf` and not `getBalance`: on Arc the same address is both the native
 * gas token at 18 decimals and the ERC-20 at 6, and settlement moves the ERC-20. Reading
 * the native balance here would report a number roughly 10^12 times too large — the single
 * most likely bug on this chain.
 *
 * Returns undefined rather than failing; a seller checking their setup should not be
 * blocked by a rate-limited public RPC.
 */
export const fetchBalanceAtomic = (address: string, rpcUrl: string = ARC_RPC_URL) =>
  Effect.tryPromise({
    try: async (): Promise<bigint | undefined> => {
      try {
        const client = createPublicClient({ transport: http(rpcUrl) })
        return await client.readContract({
          address: USDC_ADDRESS,
          abi: BALANCE_OF_ABI,
          functionName: "balanceOf",
          args: [normaliseAddress(address) as `0x${string}`]
        })
      } catch {
        return undefined
      }
    },
    catch: (e) => new Error(String((e as Error)?.message ?? e))
  })
