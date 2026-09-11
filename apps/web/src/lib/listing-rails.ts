/** Public declarations only. No challenge, wallet, environment, IO or authority. */
export type ListingRail = "gateway" | "eip3009" | "erc8183"
export type RailFilter = "all" | ListingRail | "unavailable"
export const RAIL_ORDER: readonly ListingRail[] = Object.freeze(["gateway", "eip3009", "erc8183"])
export const RAIL_LABELS: Readonly<Record<ListingRail, string>> = Object.freeze({
  gateway: "gateway", eip3009: "exact", erc8183: "escrow"
})

export function decodeDeclaredRails(value: unknown): readonly ListingRail[] | undefined {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined
    const length = Object.getOwnPropertyDescriptor(value, "length")
    if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 1 || length.value > 3 ||
      Reflect.ownKeys(value).length !== length.value + 1) return undefined
    const found = new Set<ListingRail>()
    for (let i = 0; i < length.value; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i))
      if (!d?.enumerable || !("value" in d) || !RAIL_ORDER.includes(d.value) || found.has(d.value)) return undefined
      found.add(d.value)
    }
    return Object.freeze(RAIL_ORDER.filter(rail => found.has(rail)))
  } catch { return undefined }
}

/** Optional malformed metadata must not erase an otherwise valid catalog row. */
export function declaredRailsOf(value: unknown): readonly ListingRail[] | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined
    const d = Object.getOwnPropertyDescriptor(value, "rails")
    return d?.enumerable && "value" in d ? decodeDeclaredRails(d.value) : undefined
  } catch { return undefined }
}

export const readRailFilter = (value: unknown): RailFilter | undefined =>
  value === "all" || value === "unavailable" || value === "gateway" || value === "eip3009" || value === "erc8183" ? value : undefined

/** A pure filter of the already fetched sample, never a new availability check. */
export function filterCatalog<T>(listings: readonly T[], selection: RailFilter): readonly T[] {
  const filter = readRailFilter(selection)
  if (filter === undefined) return []
  if (filter === "all") return listings
  return listings.filter(listing => {
    const rails = declaredRailsOf(listing)
    return filter === "unavailable" ? rails === undefined : rails?.includes(filter) === true
  })
}
