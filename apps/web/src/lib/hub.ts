/**
 * Read-only client for the ARCADE hub.
 *
 * This runs SERVER-SIDE ONLY, inside the chat route's handler. It deliberately holds no
 * key and can reach no endpoint that spends: `POST /x/:seller/:skill` is absent from this
 * file, and the purchase edge is the browser's job because the buyer's wallet lives there.
 * `packages/buyer/src/mcp.ts` says it plainly — a process holding a spending key must not
 * be exposed over a network — and this service IS exposed over a network, so it holds none.
 *
 * The 402 probe is the one apparent exception and is not one. Probing an endpoint returns
 * its payment challenge and nothing else; it signs nothing, sends no payment header, and
 * costs nothing. That is exactly why a quote can be free.
 */

import { Schema } from "effect"
import { dnsNameOf, loadChainConfig } from "@arcade/core"
import { PaymentRequirements } from "@arcade/payments"
import { hubJson, hubOrigin } from "./hub-http.ts"
import { purchaseInput } from "./purchase-input.ts"

export interface ListingSummary {
  readonly id: string
  readonly version: string
  readonly serviceName: string
  readonly description: string
  readonly tags?: ReadonlyArray<string>
  readonly price: string
  readonly replaces?: string
  readonly seller: string
}

export interface ListingDetail extends ListingSummary {
  /** Advertised only; quote verifies it before publishing it as provenance. */
  readonly ensName?: string
  readonly inputSchema: unknown
  readonly outputSchema: unknown
  readonly bounds?: Record<string, unknown>
  readonly stats?: {
    readonly calls: number
    readonly settled: number
    readonly successRate: number
    readonly p50LatencyMs: number
    readonly p95LatencyMs: number
  }
  readonly ratings?: { readonly count: number; readonly average: number | null }
}

export interface ReceiptRow {
  readonly skillId: string
  readonly priceAtomic: string
  readonly sellerAtomic: string
  readonly feeAtomic: string
  readonly feeBps: number
  readonly settleTx?: string
  readonly latencyMs: number
  readonly settled: boolean
  readonly reason: string
  readonly createdAtMs: number
}

export class HubUnreachable extends Error {
  readonly _tag = "HubUnreachable"
  constructor(readonly path: string, cause: string) {
    super(`hub is unreachable at ${path}: ${cause}`)
  }
}

const get = async <T>(path: string): Promise<T> => {
  try {
    const res = await hubJson(path, { headers: { accept: "application/json" } })
    if (res.status < 200 || res.status >= 300) throw new Error()
    return res.body as T
  } catch { throw new HubUnreachable(path, "request unavailable or invalid") }
}

export const listSkills = (): Promise<ReadonlyArray<ListingSummary>> =>
  get<ReadonlyArray<ListingSummary>>("/listings")

export const describeSkill = (skillId: string): Promise<ListingDetail> =>
  get<ListingDetail>(`/listings/${encodeURIComponent(skillId)}`)

export const receipts = (): Promise<ReadonlyArray<ReceiptRow>> =>
  get<ReadonlyArray<ReceiptRow>>("/receipts")

export interface Quote {
  /** Checked via /names against this quote, not copied from an advertised listing. */
  readonly ensName?: string
  readonly skillId: string
  readonly seller: string
  /** Atomic units, 6-dec, as a decimal string — never a JS number. */
  readonly amountAtomic: string
  readonly payTo: string
  readonly asset: string
  readonly network: string
  readonly resource: string
  /**
   * The challenge's requirements object, VERBATIM.
   *
   * A payment payload has to echo back the requirements the buyer signed against, and the
   * hub validates that echo against its own schema. Rebuilding it field by field from the
   * parsed values above dropped `maxTimeoutSeconds` and the settle was rejected with
   * "malformed payment header" — a true message about a payload we had authored rather than
   * relayed. Carrying the original object through means the echo cannot disagree with what
   * was sent, including fields this client never looks at.
   */
  readonly requirements: Record<string, unknown>
}

/**
 * Ask the endpoint itself what a call costs, by reading its 402 challenge.
 *
 * This is a quote from the till rather than the catalogue: the challenge is what the buyer
 * would actually have to sign, so a listing whose advertised price has drifted from its
 * endpoint is caught here rather than after a signature.
 */
export const quote = async (skillId: string, input: unknown = {}): Promise<Quote> => {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId)) throw new Error("Invalid skill identifier")
  const body = JSON.stringify(purchaseInput(input))
  const listing = await describeSkill(skillId)
  const address = (value: unknown): value is string => typeof value === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
  if (!listing || listing.id !== skillId || !address(listing.seller)) throw new Error("Invalid listing identity")
  const resource = `/x/${listing.seller}/${listing.id}`
  const endpoint = hubOrigin() + resource
  let requirement: PaymentRequirements
  let original: Record<string, unknown>
  try {
    const response = await hubJson(resource, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    })
    const challenge = Schema.decodeUnknownSync(Schema.Struct({ x402Version: Schema.Literal(2), accepts: Schema.Array(PaymentRequirements) }))(response.body)
    if (response.status !== 402 || challenge.accepts.length !== 1) throw new Error()
    requirement = challenge.accepts[0]!
    const cfg = loadChainConfig()
    if (cfg.status !== "ready" || requirement.network !== cfg.caip2 || requirement.asset.toLowerCase() !== cfg.usdc.address.toLowerCase() ||
        !address(requirement.payTo) || requirement.resource !== endpoint ||
        !/^[1-9][0-9]{0,77}$/.test(requirement.amount) || BigInt(requirement.amount) >= 1n << 256n ||
        requirement.maxTimeoutSeconds < 1 || requirement.maxTimeoutSeconds > 604900) throw new Error()
    // Validate with the canonical schema, but echo the original requirements exactly.
    original = (response.body as { accepts: Record<string, unknown>[] }).accepts[0]!
  } catch { throw new Error("The payment challenge is unavailable or invalid; nothing was signed") }

  let ensName: string | undefined
  if (listing.ensName !== undefined && listing.ensName !== null) {
    try {
      if (typeof listing.ensName !== "string" || !/^[a-z0-9.-]+\.eth$/.test(listing.ensName)) throw new Error()
      dnsNameOf(listing.ensName)
      const resolved = await hubJson(`/names/${listing.ensName}`, { headers: { accept: "application/json" } })
      const n = resolved.body as Record<string, unknown> | null
      if (resolved.status !== 200 || !n || n["name"] !== listing.ensName || n["expired"] !== false ||
          n["skillId"] !== skillId || !address(n["seller"]) || n["seller"].toLowerCase() !== listing.seller.toLowerCase() ||
          n["endpoint"] !== endpoint || !address(n["payTo"]) || n["payTo"].toLowerCase() !== requirement.payTo.toLowerCase() ||
          n["chain"] !== requirement.network) throw new Error()
      ensName = listing.ensName
    } catch { throw new Error("ENS resolution unavailable or inconsistent; nothing was signed") }
  }
  return {
    skillId: listing.id,
    seller: listing.seller,
    amountAtomic: requirement.amount,
    payTo: requirement.payTo,
    asset: requirement.asset,
    network: requirement.network,
    resource,
    requirements: original,
    ...(ensName === undefined ? {} : { ensName })
  }
}
