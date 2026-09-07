import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { scrubReceipt } from "../../hub/src/receipts-feed.ts"
import { row, TX, REFUND, CHILD } from "../../hub/test/fixtures/escrow-receipt.ts"
import { decodeReceipts, decodeListing } from "../src/lib/hub-decode.ts"
import { SkillPage } from "../src/components/skill-page.tsx"
import { EscrowRecord } from "../src/components/escrow-record.tsx"
import { checkedPublicEscrow } from "../src/lib/public-escrow.ts"
import { loadSkillPage } from "../src/lib/skill-page-data.ts"
import { txLink } from "../src/lib/format.ts"

const url = (tx: string) => `https://testnet.arcscan.app/tx/${tx}`
const publicRow = (state: "settled" | "refunded" | "uncertain" = "settled") => scrubReceipt(row(state))
const render = (receipt: unknown) => renderToStaticMarkup(<EscrowRecord receipt={receipt} />)
const patched = (root: Record<string, unknown> = {}, nested: Record<string, unknown> = {}, state: "settled" | "refunded" | "uncertain" = "settled") => {
  const original = publicRow(state)
  return { ...original, escrow: { ...original.escrow, ...nested }, ...root }
}
describe("J11C2 actual public hub escrow receipts", () => {
  it.each(["settled", "refunded", "uncertain"] as const)("preserves %s without claiming unobserved movement", state => {
    const publicRow = scrubReceipt(row(state))
    const receipts = decodeReceipts([publicRow], "root-skill", 20)
    const html = renderToStaticMarkup(<SkillPage data={{ listing: null, receipts, listingError: "listing_unavailable",
      receiptsError: null, nameError: null, resolvedName: null, observedAtMs: 1002000 }} />)
    expect(receipts[0]?.rail).toBe("erc8183")
    expect(html).toContain(`Hub reports escrow ${state}`)
    expect(html.replace(/<[^>]+>/g, "")).toContain("Escrow job #7")
    expect(html).toContain("Quoted amount")
    if (state === "settled") {
      expect(html).toContain("Reported seller payment $0.114; reported fee $0.006")
      expect(html).toContain(`href="${url(TX)}"`)
    } else if (state === "refunded") {
      expect(html).toContain("Reported principal refund $0.12")
      expect(html).toContain(`href="${url(REFUND)}"`)
      expect(html).not.toContain("Reported seller payment")
    } else {
      expect(html).toContain("No terminal movement established")
      expect(html).not.toMatch(/Reported principal refund|Reported seller payment|href="[^\"]+\/tx\//)
    }
    expect(html).not.toMatch(/job_[ab]{32}|requestHash|PRIVATE|0x5555555555555555555555555555555555555555/)
  })
  it.each(["settled", "refunded", "uncertain"] as const)("preserves %s through both decoder and loader boundaries", async state => {
    const receipts = decodeReceipts([publicRow(state)])
    const listing = decodeListing({ id: "root-skill", version: "1", serviceName: "Root", description: "Synthetic",
      seller: row().seller, price: "$0.12", inputSchema: {}, outputSchema: {} }, "root-skill")
    let detail = 0, reads = 0, names = 0
    const page = await loadSkillPage({ name: "root-skill" }, {
      describeSkill: async () => { detail++; return listing },
      listingReceipts: async () => { reads++; return receipts },
      resolveName: async () => { names++; throw Error("Unexpected name read") }
    }, () => 1002000)
    expect(page.receiptsError).toBeNull()
    expect(page.receipts).toEqual(receipts)
    expect({ detail, reads, names }).toEqual({ detail: 1, reads: 1, names: 0 })
    expect(renderToStaticMarkup(<SkillPage data={page} />)).toContain(`Hub reports escrow ${state}`)
  })
  it("clones/freezes nested projection and never infers child escrow transaction authority", () => {
    const privateRow = { ...row(), children: [{ jobId: CHILD, skillId: "child-skill", priceAtomic: 50000n,
      settled: true, settleTx: REFUND }] }
    const scrubbed = scrubReceipt(privateRow)
    expect(scrubbed.children[0]?.settleTx).toBeUndefined()
    const input = { ...scrubbed, children: [{ ...scrubbed.children[0], settleTx: REFUND, explorer: url(REFUND) }] }
    const decoded = decodeReceipts([input])[0]!
    expect(decoded.escrow).not.toBe(input.escrow)
    expect(Object.isFrozen(decoded.escrow)).toBe(true)
    expect(decoded.children[0]?.settleTx).toBeUndefined()
    expect(decoded.children[0]?.explorer).toBeNull()
    const html = renderToStaticMarkup(<SkillPage data={{ listing: null, listingError: "listing_unavailable", receipts: [decoded],
      receiptsError: null, nameError: null, resolvedName: null, observedAtMs: 1002000 }} />)
    expect(html).toContain("Child payment rail and transaction evidence unavailable")
    expect(html).not.toContain(REFUND)
  })
  it("strips private root fields without invoking their accessors or serializers", async () => {
    let calls = 0
    const input = Object.defineProperties({ ...publicRow(), jobId: "PRIVATE_JOB", buyer: "PRIVATE_BUYER", output: "PRIVATE_OUTPUT" }, {
      token: { enumerable: true, get() { calls++; return "PRIVATE_TOKEN" } },
      toJSON: { value() { calls++; return "PRIVATE_SERIALIZATION" } }
    })
    const decoded = decodeReceipts([input])
    expect(JSON.stringify(decoded)).not.toMatch(/PRIVATE|jobId|buyer|output|token|requestHash/)
    const page = await loadSkillPage({ name: "root-skill" }, { describeSkill: async () => { throw Error() },
      listingReceipts: async () => [input] as never, resolveName: async () => { throw Error() } }, () => 0)
    expect(page.receiptsError).toBeNull()
    expect(JSON.stringify(page)).not.toMatch(/PRIVATE|jobId|buyer|output|token|requestHash/)
    expect(calls).toBe(0)
  })
  it("retains the full positive uint256 job ID without numeric rounding", () => {
    const escrowJobId = ((1n << 256n) - 1n).toString()
    const decoded = decodeReceipts([patched({}, { escrowJobId })])[0]!
    expect(decoded.escrow?.escrowJobId).toBe(escrowJobId)
    expect(render(decoded)).toContain(escrowJobId)
  })
  it("downgrades missing/bad escrow evidence, including an invalid actual private record", () => {
    const invalidActual = scrubReceipt({ ...row(), feeSweepTx: TX })
    for (const input of [invalidActual, patched({ escrow: undefined }), patched({ escrow: null }), patched({}, { amountAtomic: "1" })]) {
      const decoded = decodeReceipts([input])[0]!
      expect(decoded.settled).toBe(false)
      expect(decoded.reason).toBe("escrow evidence unavailable")
      expect(decoded.escrow).toBeUndefined(); expect(decoded.explorer).toBeNull(); expect(decoded.settleTx).toBeUndefined()
      expect(render(decoded)).toContain("Escrow evidence unavailable")
      expect(render(decoded)).not.toMatch(/href=|Hub reports escrow settled|Reported principal refund/)
      expect(decodeReceipts([decoded])[0]).toEqual(decoded)
    }
  })
  it.each([
    ["network", { network: "eip155:8453" }], ["network alias", { network: "arc-testnet" }],
    ["hop", { hop: 1 }], ["session", { session: true }], ["session absent", { session: undefined }],
    ["sweep", { feeSweepTx: TX }], ["fee policy", { feeBps: 0 }], ["status", { settled: false }],
    ["kind absent", { settleRefKind: undefined }], ["Gateway kind", { settleRefKind: "gateway-transfer" }],
    ["tx absent", { settleTx: undefined }], ["zero tx", { settleTx: `0x${"0".repeat(64)}` }],
    ["bad seller", { seller: "PRIVATE_SELLER" }], ["quote", { priceAtomic: "120001" }], ["display", { price: "$0.13" }]
  ] as const)("rejects contradictory %s even when rendering direct props", (_name, patch) => {
    const input = patched(patch)
    expect(checkedPublicEscrow(input)).toBeNull()
    expect(render(input)).toContain("Escrow evidence unavailable")
    expect(render(input)).not.toMatch(/href=|PRIVATE|Reported seller payment/)
  })
  it.each([
    ["unknown state", { state: "completed" }], ["zero ID", { escrowJobId: "0" }], ["leading zero", { escrowJobId: "07" }],
    ["uint overflow", { escrowJobId: (1n << 256n).toString() }], ["giant ID", { escrowJobId: "1".repeat(79) }],
    ["numeric ID", { escrowJobId: 7 }], ["negative amount", { amountAtomic: "-1" }],
    ["amount overflow", { amountAtomic: (1n << 256n).toString() }], ["zero amount", { amountAtomic: "0" }],
    ["zero contract", { contract: `0x${"0".repeat(40)}` }], ["wrong width", { contract: TX }],
    ["uppercase contract", { contract: `0x${"A".repeat(40)}` }], ["seller transfer", { sellerPaidAtomic: "114001" }],
    ["fee transfer", { feePaidAtomic: "0" }], ["cross state", { refundAtomic: "120000" }], ["unknown field", { output: "PRIVATE" }]
  ] as const)("refuses malformed nested %s", (_name, nested) => {
    const input = patched({}, nested)
    expect(checkedPublicEscrow(input)).toBeNull()
    expect(decodeReceipts([input])[0]?.reason).toBe("escrow evidence unavailable")
    expect(render(input)).not.toMatch(/href=|PRIVATE|Hub reports escrow settled/)
  })
  it("validates refund/uncertain state-specific amounts and never promotes status alone", () => {
    for (const input of [patched({ settled: true }, {}, "refunded"), patched({ settleRefKind: "onchain" }, {}, "refunded"),
      patched({ settleTx: TX }, {}, "refunded"), patched({}, { refundAtomic: "119999" }, "refunded"),
      patched({}, { refundTx: undefined }, "refunded"), patched({}, { sellerPaidAtomic: "0" }, "refunded"),
      patched({}, { refundAtomic: "0" }, "uncertain"), patched({}, { feePaidAtomic: "0" }, "uncertain"),
      patched({ explorer: url(TX) }, {}, "uncertain")]) {
      expect(checkedPublicEscrow(input)).toBeNull()
      expect(render(input)).not.toMatch(/Reported principal refund|Reported seller payment|href=/)
    }
  })
  it("links only exact complete/refund URLs without broadening the generic link policy", () => {
    for (const reported of [undefined, null, "https://example.invalid/PRIVATE", url(TX) + "?x=1", url(TX).replace("https:", "http:")]) {
      const input = patched({ explorer: reported })
      expect(checkedPublicEscrow(input)?.explorer).toBeNull()
      expect(render(input)).toContain("Hub reports escrow settled")
      expect(render(input)).not.toMatch(/href="[^\"]+\/tx\//)
      expect(render(input)).not.toContain("PRIVATE")
    }
    const refund = patched({}, { refundExplorer: url(TX) }, "refunded")
    expect(checkedPublicEscrow(refund)?.escrow).toMatchObject({ state: "refunded", refundExplorer: null })
    expect(render(refund)).not.toMatch(/href="[^\"]+\/tx\//)
    expect(txLink(TX, publicRow())).toBeNull()
    for (const rail of ["eip3009", "gateway", "test"]) {
      const input = patched({ rail })
      expect(checkedPublicEscrow(input)).toBeNull()
      expect(decodeReceipts([input])[0]?.escrow).toBeUndefined()
    }
  })
  it("rejects getters, inherited/hidden data, proxies, symbols, arrays and coercion without executing them", () => {
    let calls = 0
    const nested = publicRow().escrow!
    const getter = Object.defineProperty({ ...nested }, "amountAtomic", { enumerable: true, get() { calls++; return "120000" } })
    const hidden = Object.defineProperty({ ...nested }, "contract", { enumerable: false, value: nested.contract })
    const inherited = Object.assign(Object.create({ amountAtomic: nested.amountAtomic }), nested)
    delete inherited.amountAtomic
    const bad = [getter, hidden, inherited, new Proxy({}, { ownKeys() { throw Error("PRIVATE") } }), [],
      { ...nested, [Symbol("PRIVATE")]: 1 }, { ...nested, escrowJobId: { toString() { calls++; return "7" } } },
      Object.defineProperty({ ...nested }, "output", { enumerable: true, get() { calls++; return "PRIVATE" } })]
    for (const escrow of bad) {
      const input = patched({ escrow })
      expect(checkedPublicEscrow(input)).toBeNull()
      expect(render(input)).not.toMatch(/href=|PRIVATE/)
    }
    const rootGetter = Object.defineProperty(publicRow(), "escrow", { enumerable: true, get() { calls++; return nested } })
    expect(checkedPublicEscrow(rootGetter)).toBeNull()
    expect(calls).toBe(0)
  })
})
