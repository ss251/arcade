import { Effect } from "effect"
import { parsePrice } from "@arcade/core"
import { challengeChoices } from "./challenge.ts"
import type { Rails } from "./rails.ts"
import type { ListingRecord } from "./openapi.ts"
import type { ListingRecord as StoredListing } from "./store.ts"

type Source = Pick<StoredListing, "listing" | "seller" | "feeSplitter" | "splitterVersion" | "delisted">
/** Prepare the exact unsigned root challenges, never payment verification or
 * external discovery. Renderers receive public data, not Rail closures or a
 * spread store record. Names are supplied by the hub's existing ENS observation. */
export const prepareDiscoveryListings = <T extends Source>(
  rails: Rails, records: ReadonlyArray<T>, origin: string, sellerNameFor?: (record: T) => string | undefined
): Effect.Effect<ReadonlyArray<ListingRecord>> => Effect.forEach(records.filter(record => record.delisted !== true), record =>
  Effect.map(challengeChoices(rails, record.listing, {
    priceAtomic: parsePrice(record.listing.price), resource: `${origin}/x/${record.seller}/${record.listing.id}`,
    payTo: record.seller, description: record.listing.description,
    ...(record.feeSplitter === undefined ? {} : { feeSplitter: record.feeSplitter }),
    ...(record.splitterVersion === undefined ? {} : { feeSplitterVersion: record.splitterVersion })
  }), choices => {
    const sellerEnsName = sellerNameFor?.(record)
    return { listing: record.listing, seller: record.seller, accepts: choices.map(choice => choice.requirements),
      ...(record.feeSplitter === undefined ? {} : { feeSplitter: record.feeSplitter }),
      ...(record.delisted === undefined ? {} : { delisted: record.delisted }),
      ...(sellerEnsName === undefined ? {} : { sellerEnsName }) }
  }))
