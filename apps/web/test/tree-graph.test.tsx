import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { TreeGraph } from "../src/components/tree-graph.tsx"
import type { TreeNode, TreeView } from "../src/lib/hub-decode.ts"

const rootTx = `0x${"ab".repeat(32)}`, childTx = `0x${"cd".repeat(32)}`
const explorer = (tx: string) => `https://testnet.arcscan.app/tx/${tx}`
const root: TreeNode = { nodeId: "0", parentNodeId: null, skillId: "wallet-risk-note",
  hop: 0, priceAtomic: "120000", price: "$0.12", settled: true, reason: "ok",
  latencyMs: 2471, settleTx: rootTx, explorer: explorer(rootTx) }
const child: TreeNode = { ...root, nodeId: "0.0", parentNodeId: "0", skillId: "counterparty-graph",
  hop: 1, priceAtomic: "50000", price: "$0.05", settleTx: childTx, explorer: explorer(childTx) }
const refused: TreeNode = { nodeId: "0.1", parentNodeId: "0", skillId: "usdc-flow-check", hop: 1,
  priceAtomic: "30000", price: "$0.03", settled: false, reason: "output did not validate",
  latencyMs: 800, explorer: null }
const view: TreeView = { rootJobId: "job_root000000000000", treeHash: `0x${"12".repeat(32)}`,
  ceiling: "$0.20", committed: "$0.05", complete: true, evidenceFlags: [], nodes: [root, child, refused] }
const html = (over: Partial<TreeView> = {}) => renderToStaticMarkup(<TreeGraph view={{ ...view, ...over }} />)
const links = (value: string) => value.match(/<a\s/g)?.length ?? 0
const boxLinks = (value: string) => links(value.slice(0, value.indexOf("</svg>") + 6))

describe("H7 receipt-tree rendering", () => {
  it("offers real diagram and list views while leading with recorded call counts", () => {
    const rendered = html()
    expect(rendered).toContain('role="group" aria-label="Receipt view"')
    expect(rendered).toContain('aria-pressed="true"')
    expect(rendered).toContain(">Diagram</button>"); expect(rendered).toContain(">List</button>")
    expect(rendered).toContain("3 calls"); expect(rendered).toContain("2 recorded settled")
    expect(rendered.indexOf("3 calls")).toBeLessThan(rendered.indexOf("Recorded tree digest"))
  })
  it("renders a readable list with actual parent relationships and the same qualified links", () => {
    const rendered = renderToStaticMarkup(<TreeGraph view={view} initialMode="list" />)
    expect(rendered).not.toContain("<svg")
    expect(rendered).toContain('aria-label="Receipt calls"')
    expect(rendered).toContain("Original call"); expect(rendered).toContain("Hired by wallet risk note")
    expect(rendered).toContain("Not recorded settled"); expect(rendered).toContain("output did not validate")
    expect(rendered).toContain("$0.12"); expect(rendered).toContain("$0.05")
    expect(links(rendered)).toBe(4)
    expect(rendered).not.toContain(view.rootJobId)
    const list = rendered.slice(rendered.indexOf('class="tree-list"'), rendered.indexOf("</ol>"))
    expect(list.indexOf("wallet risk note")).toBeLessThan(list.indexOf("counterparty graph"))
    expect(list.indexOf("counterparty graph")).toBeLessThan(list.indexOf("usdc flow check"))
  })
  it("reads a nested tree parent-first without changing diagram geometry", () => {
    const grandchild = { ...child, nodeId: "0.0.0", parentNodeId: "0.0", hop: 2, skillId: "nested-work" }
    const nested = { ...view, nodes: [grandchild, refused, child, root] }
    const rendered = renderToStaticMarkup(<TreeGraph view={nested} initialMode="list" />)
    const list = rendered.slice(rendered.indexOf('class="tree-list"'), rendered.indexOf("</ol>"))
    expect(list.indexOf("wallet risk note")).toBeLessThan(list.indexOf("counterparty graph"))
    expect(list.indexOf("counterparty graph")).toBeLessThan(list.indexOf("nested work"))
    expect(list.indexOf("nested work")).toBeLessThan(list.indexOf("usdc flow check"))
  })
  it("withholds an unsafe or refused transaction in the list as in the diagram", () => {
    const rendered = renderToStaticMarkup(<TreeGraph view={{ ...view, nodes: [root, { ...child, explorer: "https://evil.example/PRIVATE" }, { ...refused, settleTx: childTx, explorer: explorer(childTx) }] }} initialMode="list" />)
    expect(links(rendered)).toBe(2); expect(rendered).not.toContain("PRIVATE")
  })
  it("links the two settled boxes only to their exact supplied transaction targets", () => {
    const rendered = html()
    expect(boxLinks(rendered)).toBe(2)
    expect(links(rendered)).toBe(4)
    expect(rendered).toContain(`href="${explorer(rootTx)}"`)
    expect(rendered).toContain(`href="${explorer(childTx)}"`)
    expect(rendered).toContain('rel="noreferrer"')
  })
  it("never links a refused node even when it carries a plausible explorer target", () => {
    expect(boxLinks(html({ nodes: [root, child, { ...refused, settleTx: childTx, explorer: explorer(childTx) }] }))).toBe(2)
  })
  it.each([
    "javascript:alert(1)", `https://evil.example/tx/${childTx}`,
    `https://testnet.arcscan.app.evil.example/tx/${childTx}`,
    `https://owner@testnet.arcscan.app/tx/${childTx}`,
    `${explorer(childTx)}?token=PRIVATE`, `${explorer(childTx)}#PRIVATE`,
    explorer(rootTx), `http://testnet.arcscan.app/tx/${childTx}`
  ])("omits an unqualified or mismatched target %s", target => {
    const rendered = html({ nodes: [root, { ...child, explorer: target }, refused] })
    expect(boxLinks(rendered)).toBe(1)
    expect(links(rendered)).toBe(2)
    expect(rendered).not.toContain('href="javascript:')
    expect(rendered).not.toContain("PRIVATE")
  })
  it.each(["11111111-2222-3333-4444-555555555555", "0xtest0123456789abcdef", `0x${"00".repeat(32)}`])(
    "never invents an Arcscan link from an opaque or zero reference %s", settleTx => {
      expect(boxLinks(html({ nodes: [root, { ...child, settleTx, explorer: explorer(settleTx) }, refused] }))).toBe(1)
    })
  it("retains the full refusal reason as escaped accessible and inspectable text", () => {
    const reason = "<script>alert(1)</script> " + "a long refusal reason ".repeat(20)
    const rendered = html({ nodes: [root, child, { ...refused, reason }] })
    expect(rendered).not.toContain("<script>")
    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(rendered).toContain("<details")
    expect(rendered).toContain("Receipt details")
    expect(rendered).toContain("not recorded settled")
  })
  it("calls the hash a recorded digest, not independently mined chain proof", () => {
    const rendered = html()
    expect(rendered).toContain("Recorded tree digest")
    expect(rendered).toContain("0x121212…121212")
    expect(rendered).not.toContain("committed on chain")
    expect(rendered).not.toContain("verified")
    expect(rendered).toContain("$0.05")
    expect(rendered).toContain("$0.20")
    expect(rendered).toContain("recorded sub-spend")
  })
  it("states incomplete evidence without fabricating missing budget values", () => {
    const { treeHash: _hash, ceiling: _ceiling, committed: _committed, ...partial } = view
    const rendered = renderToStaticMarkup(<TreeGraph view={{ ...partial, complete: false,
      evidenceFlags: ["receipt-missing", "reservation-unresolved"] }} />)
    expect(rendered).toContain("Incomplete receipt evidence")
    expect(rendered).toContain("receipt missing")
    expect(rendered).toContain("reservation unresolved")
    expect(rendered).toContain("Tree digest unavailable")
    expect(rendered).not.toContain("recorded sub-spend")
    expect(rendered).not.toContain("balance untouched")
  })
  it("labels interactive SVG as a group and names every job's status", () => {
    const rendered = html()
    expect(rendered).toContain('role="group"')
    expect(rendered).toMatch(/aria-label="Receipt tree: 3 jobs, 2 recorded settled"/)
    expect(rendered).toContain("usdc-flow-check")
    expect(rendered).toContain("output did not validate")
  })
  it("qualifies unresolved nodes as not recorded settled, without implying a definitive refund", () => {
    const rendered = html({ complete: false, evidenceFlags: ["reservation-unresolved"] })
    expect(rendered).toContain("not recorded settled")
    expect(rendered).not.toContain("refunded")
    expect(rendered).not.toContain("uncharged")
  })
  it("reports absent nodes without claiming that the job hired nobody", () => {
    const rendered = html({ nodes: [], complete: false, evidenceFlags: ["receipt-missing"] })
    expect(rendered).not.toContain("<svg")
    expect(rendered).toContain("No hops available")
    expect(rendered).not.toContain("hired nobody")
  })
  it("refuses malformed topology before rendering any partial or misleading graph", () => {
    const rendered = html({ nodes: [root, { ...child, parentNodeId: "missing" }] })
    expect(rendered).toContain("Receipt tree unavailable")
    expect(rendered).not.toContain("<svg")
    expect(links(rendered)).toBe(0)
  })
  it("does not publish root job identifiers or extra capability-shaped props", () => {
    const rendered = html({ nodes: [{ ...root, jobId: "PRIVATE_JOB", token: "PRIVATE_TOKEN" } as TreeNode] })
    expect(rendered).not.toContain(view.rootJobId)
    expect(rendered).not.toContain("PRIVATE")
  })
  it("provides qualified transaction links and anonymous relationship labels in the text alternative", () => {
    const rendered = html({ nodes: [root, { ...child, skillId: "repeated-skill" }, { ...refused, skillId: "repeated-skill" }] })
    const details = rendered.slice(rendered.indexOf("<details"))
    expect(links(details)).toBe(2)
    expect(details).toContain("node 0.0")
    expect(details).toContain("node 0.1")
    expect(details).toContain("hired by node 0")
    expect(details).not.toContain(view.rootJobId)
  })
  it("contains horizontal scrolling and uses the existing semantic tokens without animation", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.tree-viewport\s*\{[^}]*overflow-x:\s*auto/)
    expect(css).toMatch(/\.tree-viewport svg\s*\{[^}]*max-width:\s*none/)
    expect(css).toMatch(/\.tree-details a:focus-visible\s*\{[^}]*outline:\s*1\.5px solid var\(--focus-ring\)/)
    expect(css).toMatch(/\.tree \.node\.is-settled[^}]*var\(--stamp\)/)
    expect(css).toMatch(/\.tree \.node\.is-refused[^}]*var\(--refuse\)/)
  })
  it("keeps small state text in high-contrast ink while semantic borders carry status color", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.tree \.node-state\s*\{[^}]*fill:\s*var\(--ink\)/)
    expect(css).not.toMatch(/\.tree \.node\.is-(?:settled|refused) \.node-state\s*\{/)
  })
})
