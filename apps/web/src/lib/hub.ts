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

const HUB = process.env["ARCADE_HUB"] ?? "http://localhost:8787"

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
  let res: Response
  try {
    res = await fetch(`${HUB}${path}`, { headers: { accept: "application/json" } })
  } catch (e) {
    throw new HubUnreachable(path, String((e as Error)?.message ?? e))
  }
  if (!res.ok) throw new HubUnreachable(path, `HTTP ${res.status}`)
  return (await res.json()) as T
}

export const listSkills = (): Promise<ReadonlyArray<ListingSummary>> =>
  get<ReadonlyArray<ListingSummary>>("/listings")

export const describeSkill = (skillId: string): Promise<ListingDetail> =>
  get<ListingDetail>(`/listings/${encodeURIComponent(skillId)}`)

export const receipts = (): Promise<ReadonlyArray<ReceiptRow>> =>
  get<ReadonlyArray<ReceiptRow>>("/receipts")

export interface Quote {
  readonly skillId: string
  readonly seller: string
  /** Atomic units, 6-dec, as a decimal string — never a JS number. */
  readonly amountAtomic: string
  readonly payTo: string
  readonly asset: string
  readonly network: string
  readonly resource: string
}

/**
 * Ask the endpoint itself what a call costs, by reading its 402 challenge.
 *
 * This is a quote from the till rather than the catalogue: the challenge is what the buyer
 * would actually have to sign, so a listing whose advertised price has drifted from its
 * endpoint is caught here rather than after a signature.
 */
export const quote = async (skillId: string): Promise<Quote> => {
  const listing = await describeSkill(skillId)
  const resource = `/x/${listing.seller}/${listing.id}`
  let res: Response
  try {
    res = await fetch(`${HUB}${resource}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // An empty body is enough to draw the challenge; the paywall runs before validation.
      body: "{}"
    })
  } catch (e) {
    throw new HubUnreachable(resource, String((e as Error)?.message ?? e))
  }
  if (res.status !== 402) {
    throw new HubUnreachable(resource, `expected a 402 payment challenge, got HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    accepts?: ReadonlyArray<Record<string, string>>
  }
  const req = body.accepts?.[0]
  if (req === undefined) throw new HubUnreachable(resource, "402 carried no payment requirements")
  return {
    skillId: listing.id,
    seller: listing.seller,
    amountAtomic: String(req["amount"]),
    payTo: String(req["payTo"]),
    asset: String(req["asset"]),
    network: String(req["network"]),
    resource
  }
}
