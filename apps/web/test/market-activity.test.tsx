import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MarketActivity } from "../src/components/market-activity.tsx"
import { loadMarketActivity, projectMarketActivity } from "../src/lib/market-activity.ts"
import { decodeReceipts } from "../src/lib/hub-decode.ts"

const tx = `0x${"ab".repeat(32)}`, explorer = `https://testnet.arcscan.app/tx/${tx}`
const raw = (createdAtMs = 1000) => ({ skillId: "diff-triage", skillVersion: "0.1.0", seller: `0x${"1".repeat(40)}`, rail: "eip3009", network: "eip155:5042002", settleRefKind: "onchain", priceAtomic: "120000", sellerAtomic: "114000", feeAtomic: "6000", feeBps: 500, price: "$0.12", sellerShare: "$0.114", fee: "$0.006", settled: true, reason: "ok", latencyMs: 2471, createdAtMs, settleTx: tx, explorer, hop: 0, children: [] })

describe("Marketplace receipt activity", () => {
  it("takes only the six newest public records and never projects private/unknown fields", () => {
    const rows = decodeReceipts(Array.from({ length: 8 }, (_, i) => ({ ...raw(i), result: "PRIVATE_RESULT", token: "PRIVATE_TOKEN" })))
    const projected = projectMarketActivity(rows)
    expect(projected).toHaveLength(6); expect(projected.map(record => record.createdAtMs)).toEqual([7, 6, 5, 4, 3, 2])
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE|children|settleTx|priceAtomic/)
    expect(projected[0]?.explorer).toBe(explorer)
  })
  it("preserves failure/empty distinctions and stamps only successful reads", async () => {
    let nowCalls = 0
    expect(await loadMarketActivity(async () => [], () => { nowCalls++; return 9000 })).toEqual({ records: [], observedAtMs: 9000 })
    expect(await loadMarketActivity(async () => { throw Error("PRIVATE") }, () => { nowCalls++; return 10000 })).toEqual({ records: null, observedAtMs: null })
    expect(nowCalls).toBe(1)
  })
  it("withholds unqualified transaction links and marks actual canary/test traffic", () => {
    const record = projectMarketActivity(decodeReceipts([{ ...raw(), rail: "test", settleRefKind: "test", canary: true }]))[0]!
    expect(record.explorer).toBeNull(); expect(record.canary).toBe(true); expect(record.test).toBe(true)
    const hidden = projectMarketActivity(decodeReceipts([{ ...raw(), explorer: null }]))[0]!
    expect(hidden.explorer).toBeNull()
  })
  it("renders reported activity with explicit refresh and a true observation time", () => {
    let reads = 0
    const html = renderToStaticMarkup(<MarketActivity initial={{ records: projectMarketActivity(decodeReceipts([{ ...raw(), canary: true }])), observedAtMs: 9000 }} listings={[]} refresh={async () => { reads++; return { records: [], observedAtMs: 10000 } }} />)
    expect(reads).toBe(0)
    for (const text of ["Refresh activity", "Last fetched", "Canary test", "not independent chain verification", "Updated when you refresh"]) expect(html).toContain(text)
    expect(html).toContain('dateTime="1970-01-01T00:00:09.000Z"')
  })
})
