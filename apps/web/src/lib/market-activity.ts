import type { PublicReceiptRow } from "./hub-decode.ts"
import { txLink } from "./format.ts"

export interface ActivityRecord {
  readonly skillId: string; readonly seller: string; readonly price: string; readonly createdAtMs: number
  readonly state: "settled" | "not-settled" | "uncertain" | "refunded"; readonly explorer: string | null
  readonly canary: boolean; readonly test: boolean; readonly session: boolean
  readonly amountLabel: "Quoted" | "Authorized"
}
export interface MarketActivityData { readonly records: readonly ActivityRecord[] | null; readonly observedAtMs: number | null }

/** Project only these public receipt fields; never carry result bodies or access tokens. */
export function projectMarketActivity(rows: readonly PublicReceiptRow[]): readonly ActivityRecord[] {
  return [...rows].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 6).map(row => {
    const expected = txLink(row.settleTx, row)
    const state = row.rail === "erc8183" ? row.escrow?.state ?? "uncertain" : row.settled ? "settled" : "not-settled"
    return { skillId: row.skillId, seller: row.seller, price: row.price, createdAtMs: row.createdAtMs, state,
      explorer: expected !== null && row.explorer === expected ? expected : null,
      canary: row.canary === true, test: row.rail === "test", session: row.session === true,
      amountLabel: row.rail === "erc8183" ? "Quoted" : "Authorized" }
  })
}

/** One existing bounded hub read. Failure stays distinct from an empty activity feed. */
export async function loadMarketActivity(read: () => Promise<readonly PublicReceiptRow[]>, now: () => number = Date.now): Promise<MarketActivityData> {
  try { return { records: projectMarketActivity(await read()), observedAtMs: now() } }
  catch { return { records: null, observedAtMs: null } }
}
