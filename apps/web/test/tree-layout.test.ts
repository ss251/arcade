import { describe, expect, it } from "vitest"
import { Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { buildTreeView } from "../../hub/src/tree-view.ts"
import { decodeTree } from "../src/lib/hub-decode.ts"
import type { TreeNode, TreeView } from "../src/lib/hub-decode.ts"
import { COL_GAP, NODE_H, NODE_W, ROW_GAP, layoutTree } from "../src/lib/tree-layout.ts"

const ROOT = "job_root000000000000"
const ERROR = "Invalid receipt tree layout"
const node = (nodeId = "0"): TreeNode => ({
  nodeId, parentNodeId: nodeId === "0" ? null : nodeId.slice(0, nodeId.lastIndexOf(".")),
  hop: nodeId.split(".").length - 1, skillId: "example-skill", priceAtomic: "10000", price: "$0.01",
  settled: false, reason: "not settled", latencyMs: 0, explorer: null
})
const view = (ids: readonly string[] = ["0"]): TreeView => ({
  rootJobId: ROOT, complete: false, evidenceFlags: ["commitment-missing"], nodes: ids.map(node)
})
const unsafeView = (value: unknown): TreeView => value as TreeView
const at = (layout: ReturnType<typeof layoutTree>, id: string) => layout.nodes.find(n => n.nodeId === id)!

function producerView(): TreeView {
  const make = (jobId: string, hop: number, parentJobId?: string) => Receipt.make({
    jobId, skillId: "example-skill", skillVersion: "1.0.0", buyer: `0x${"1".repeat(40)}`,
    seller: `0x${"2".repeat(40)}`, priceAtomic: 10_000n, sellerAtomic: 9_500n, feeAtomic: 500n,
    feeBps: 500, rail: "eip3009", network: "eip155:5042002", settled: true, reason: "ok",
    latencyMs: 100, createdAtMs: 1, hop, rootJobId: ROOT,
    ...(parentJobId === undefined ? {} : { parentJobId }), settleTx: `0x${String(hop + 3).repeat(64)}`
  })
  const child = make("job_child00000000000", 1, ROOT)
  const grand = make("job_grand00000000000", 2, child.jobId)
  const children = [grand, child].map(r => ReceiptChild.make({ jobId: r.jobId, skillId: r.skillId,
    priceAtomic: r.priceAtomic, settled: r.settled, settleTx: r.settleTx }))
  const root = Receipt.make({ ...make(ROOT, 0), children, treeHash: treeHashOf(ROOT, children),
    treeCeilingAtomic: 30_000n, treeCommittedAtomic: 20_000n })
  return decodeTree(buildTreeView(ROOT, [grand, root, child]), ROOT)
}

function expectGeometry(input: TreeView) {
  const output = layoutTree(input)
  expect(output.nodes).toHaveLength(input.nodes.length)
  expect(new Set(output.nodes.map(n => n.nodeId)).size).toBe(input.nodes.length)
  expect(output.edges).toHaveLength(Math.max(0, input.nodes.length - 1))
  for (const n of output.nodes) {
    expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
    expect(n.x).toBe(n.hop * (NODE_W + COL_GAP))
    expect(n.x).toBeGreaterThanOrEqual(0); expect(n.y).toBeGreaterThanOrEqual(0)
    expect(n.x + NODE_W).toBeLessThanOrEqual(output.width)
    expect(n.y + NODE_H).toBeLessThanOrEqual(output.height)
    const siblings = output.nodes.filter(other => other.nodeId !== n.nodeId && other.x === n.x)
    expect(siblings.every(other => Math.abs(other.y - n.y) >= NODE_H + ROW_GAP)).toBe(true)
  }
  for (const edge of output.edges) {
    const parent = at(output, edge.from), child = at(output, edge.to)
    expect(child.parentNodeId).toBe(parent.nodeId)
    const x1 = parent.x + NODE_W, y1 = parent.y + NODE_H / 2
    const x2 = child.x, y2 = child.y + NODE_H / 2, mid = (x1 + x2) / 2
    expect(edge.path).toBe(`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`)
  }
  return output
}

describe("H7 deterministic receipt tree geometry", () => {
  it("preserves the exact plan dimensions and graceful empty canvas", () => {
    expect([NODE_W, NODE_H, COL_GAP, ROW_GAP]).toEqual([168, 52, 72, 16])
    expect(layoutTree(view([]))).toEqual({ width: 0, height: 68, nodes: [], edges: [] })
  })
  it("centres a single root without an edge or division by zero", () => {
    const output = expectGeometry(view())
    expect(at(output, "0")).toEqual({ ...node(), x: 0, y: 0 })
    expect([output.width, output.height]).toEqual([168, 68])
  })
  it("lays out real H3-generated and H4-decoded complete evidence without losing facts", () => {
    const input = producerView(), output = expectGeometry(input)
    expect(input.complete).toBe(true); expect(input.evidenceFlags).toEqual([])
    expect(output.nodes.map(n => n.nodeId)).toEqual(["0.0.0", "0.0", "0"])
    for (const original of input.nodes) expect(at(output, original.nodeId)).toEqual({ ...original, x: original.hop * 240, y: 0 })
    expect(JSON.stringify(output)).not.toContain(ROOT)
  })
  it("keeps unresolved evidence geometric rather than assigning a payment outcome", () => {
    const input = { ...view(["0", "0.0"]), evidenceFlags: ["reservation-unresolved"] as const }
    const output = expectGeometry(input)
    expect(at(output, "0.0")).toMatchObject({ settled: false, reason: "not settled", explorer: null })
    expect(input.evidenceFlags).toEqual(["reservation-unresolved"])
  })
  it("centres parents over their immediate children and reserves uneven subtrees", () => {
    const input = view(["0", "0.0", "0.0.0", "0.0.1", "0.1", "0.2", "0.2.0"])
    const output = expectGeometry(input)
    expect(at(output, "0.0").y).toBe(34)
    expect(at(output, "0.1").y).toBe(136)
    expect(at(output, "0.2").y).toBe(204)
    expect(at(output, "0").y).toBe(119)
    expect([output.width, output.height]).toEqual([648, 272])
  })
  it("orders sibling indices numerically, independently of input order", () => {
    const input = view(["0", ...Array.from({ length: 12 }, (_, i) => `0.${i}`)])
    const output = expectGeometry(input)
    expect(output.nodes.filter(n => n.hop === 1).map(n => n.nodeId)).toEqual(input.nodes.slice(1).map(n => n.nodeId))
    expect(at(output, "0.2").y).toBeLessThan(at(output, "0.10").y)
    expect(layoutTree({ ...input, nodes: [...input.nodes].reverse() })).toEqual(output)
    expect(layoutTree(input)).toEqual(output)
  })
  it("handles exactly 256 nodes without overlap or dropped edges", () => {
    const output = expectGeometry(view(["0", ...Array.from({ length: 255 }, (_, i) => `0.${i}`)]))
    expect(output.height).toBe(255 * 68)
  })
  it("handles the full sixteen-edge depth without widening money values", () => {
    const ids = Array.from({ length: 17 }, (_, i) => "0" + ".0".repeat(i))
    const input = view(ids), output = expectGeometry(input)
    expect(output.width).toBe(16 * 240 + 168)
    expect(output.height).toBe(68)
  })
  it("does not mutate frozen inputs or expose input object aliases", () => {
    const input = view(["0", "0.0", "0.1"]), before = JSON.stringify(input)
    input.nodes.forEach(Object.freeze); Object.freeze(input.nodes); Object.freeze(input.evidenceFlags); Object.freeze(input)
    const output = layoutTree(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(at(output, "0")).not.toBe(input.nodes[0])
    expect(Object.isFrozen(output) && Object.isFrozen(output.nodes) && Object.isFrozen(output.edges)).toBe(true)
    expect(output.nodes.every(Object.isFrozen) && output.edges.every(Object.isFrozen)).toBe(true)
  })
  it("copies monetary strings verbatim and omits unrelated private props", () => {
    const original = { ...node(), priceAtomic: "9007199254740993000001", price: "$9007199254740993.000001",
      buyer: "PRIVATE_BUYER", jobId: "PRIVATE_JOB" }
    const output = layoutTree({ ...view(), nodes: [original] })
    expect(output.nodes[0]).toMatchObject({ priceAtomic: original.priceAtomic, price: original.price })
    expect(JSON.stringify(output)).not.toContain("PRIVATE")
  })
})

describe("H7 fail-closed bounded topology", () => {
  it.each([
    ["duplicate", [node(), node()]],
    ["no root", [node("0.0")]],
    ["second root", [node(), { ...node("0.0"), parentNodeId: null }]],
    ["orphan", [node(), node("0.0.0")]],
    ["self cycle", [node(), { ...node("0.0"), parentNodeId: "0.0" }]],
    ["disconnected cycle", [node(), { ...node("0.0"), parentNodeId: "0.1" }, { ...node("0.1"), parentNodeId: "0.0" }]],
    ["root cycle", [{ ...node(), parentNodeId: "0.0" }, node("0.0")]],
    ["wrong parent", [node(), node("0.0"), { ...node("0.0.0"), parentNodeId: "0" }]],
    ["wrong hop", [node(), { ...node("0.0"), hop: 2 }]],
    ["sibling gap", [node(), node("0.1")]],
    ["leading-zero index", [node(), node("0.00")]],
    ["foreign root", [node("1")]],
    ["oversized ID", [node("0" + ".0".repeat(33))]],
    ["depth seventeen", Array.from({ length: 18 }, (_, i) => node("0" + ".0".repeat(i)))],
    ["257 nodes", [node(), ...Array.from({ length: 256 }, (_, i) => node(`0.${i}`))]]
  ] as const)("refuses %s before returning partial geometry", (_label, nodes) => {
    expect(() => layoutTree({ ...view(), nodes })).toThrow(ERROR)
  })
  it.each([-1, 1.5, NaN, Infinity, 17, "0"])("refuses invalid hop %s", hop => {
    expect(() => layoutTree(unsafeView({ ...view(), nodes: [{ ...node(), hop }] }))).toThrow(ERROR)
  })
  it.each([
    { complete: undefined }, { evidenceFlags: undefined }, { complete: true },
    { evidenceFlags: ["unknown"] }, { evidenceFlags: ["commitment-missing", "commitment-missing"] }
  ])("refuses inconsistent evidence metadata %j", patch => {
    expect(() => layoutTree(unsafeView({ ...view(), ...patch }))).toThrow(ERROR)
  })
  it("refuses sparse or oversized arrays before examining an element", () => {
    expect(() => layoutTree({ ...view(), nodes: new Array<TreeNode>(1) })).toThrow(ERROR)
    let touched = 0
    const nodes = new Array<TreeNode>(257)
    Object.defineProperty(nodes, "0", { get() { touched++; throw Error("PRIVATE_ACCESSOR") } })
    expect(() => layoutTree({ ...view(), nodes })).toThrow(ERROR); expect(touched).toBe(0)
  })
  it("does not execute node, array or view accessors", () => {
    let touched = 0
    const badNode = Object.defineProperty(node(), "nodeId", { get() { touched++; throw Error("PRIVATE_ACCESSOR") } })
    const badNodes = Object.defineProperty([node()], "0", { get() { touched++; throw Error("PRIVATE_ACCESSOR") } })
    const badView = Object.defineProperty(view(), "nodes", { get() { touched++; throw Error("PRIVATE_ACCESSOR") } })
    for (const input of [{ ...view(), nodes: [badNode] }, { ...view(), nodes: badNodes }, badView]) {
      expect(() => layoutTree(input)).toThrow(ERROR)
    }
    expect(touched).toBe(0)
  })
  it.each(["getPrototypeOf", "getOwnPropertyDescriptor"])("normalizes throwing %s traps to the fixed error", trap => {
    const input = new Proxy(view(), { [trap]() { throw Error("PRIVATE_REFLECTION") } })
    expect(() => layoutTree(input)).toThrow(new Error(ERROR))
  })
})
