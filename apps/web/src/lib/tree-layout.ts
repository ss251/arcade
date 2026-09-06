import type { TreeNode, TreeView } from "./hub-decode.ts"

export const NODE_W = 168
export const NODE_H = 52
export const COL_GAP = 72
export const ROW_GAP = 16

export interface PlacedNode extends TreeNode {
  readonly x: number
  readonly y: number
}

export interface Layout {
  readonly width: number
  readonly height: number
  readonly nodes: ReadonlyArray<PlacedNode>
  readonly edges: ReadonlyArray<{ readonly from: string; readonly to: string; readonly path: string }>
}

const MAX_NODES = 256, MAX_HOP = 16, ROW = NODE_H + ROW_GAP
const FLAGS = new Set(["commitment-missing", "commitment-mismatch", "receipt-missing", "receipt-conflict",
  "lineage-invalid", "evidence-malformed", "limit-exceeded", "reservation-unresolved"])
const invalid = (): never => { throw new Error("Invalid receipt tree layout") }
const object = (value: unknown): object => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid()
  return value
}
const own = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor !== undefined && !("value" in descriptor)) return invalid()
  return descriptor?.value
}
const array = (value: unknown, max: number): unknown[] => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid()
  const length = own(value, "length")
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) return invalid()
  const values: unknown[] = []
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (descriptor === undefined || !("value" in descriptor)) return invalid()
    values.push(descriptor.value)
  }
  return values
}
const text = (value: unknown, max: number): string =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : invalid()
const integer = (value: unknown, max: number): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : invalid()

/** Capture only the existing decoded node fields, never arbitrary prop spreads. */
const capture = (value: unknown): TreeNode => {
  const n = object(value), nodeId = text(own(n, "nodeId"), 64), parentNodeId = own(n, "parentNodeId")
  const hop = integer(own(n, "hop"), MAX_HOP)
  if (!/^0(?:\.(0|[1-9][0-9]{0,2})){0,16}$/.test(nodeId) || hop !== nodeId.split(".").length - 1 ||
    parentNodeId !== null && typeof parentNodeId !== "string") return invalid()
  const settled = own(n, "settled"), explorer = own(n, "explorer"), settleTx = own(n, "settleTx")
  if (typeof settled !== "boolean") return invalid()
  return {
    nodeId, parentNodeId, hop, skillId: text(own(n, "skillId"), 64),
    // Display/money/reference semantics belong to H4, not the geometry engine.
    // These bounded strings are copied unchanged; no amount is parsed or summed.
    priceAtomic: text(own(n, "priceAtomic"), 78), price: text(own(n, "price"), 90), settled,
    reason: text(own(n, "reason"), 1024), latencyMs: integer(own(n, "latencyMs"), Number.MAX_SAFE_INTEGER),
    explorer: explorer === null ? null : text(explorer, 2048),
    ...(settleTx === undefined ? {} : { settleTx: text(settleTx, 128) })
  }
}

/**
 * Bounded left-to-right geometry for an H4-decoded view; no IO or evidence upgrade.
 * Validate the entire topology before placement. Canonical positional parent IDs
 * strictly shorten at every edge, ruling out cycles; no node may be disconnected.
 * Numeric sibling positions determine order, independently of input array order.
 *
 * Throws only Error("Invalid receipt tree layout") on malformed input. Callers
 * render an unavailable state, never a partial graphic. An empty shaped view is
 * a neutral empty layout, not proof that a job hired nobody. This function does
 * not validate commitments, link authority, prices or payment outcomes anew.
 */
export const layoutTree = (view: TreeView): Layout => {
  try { return layout(view) } catch { return invalid() }
}

const layout = (view: TreeView): Layout => {
  const input = object(view), complete = own(input, "complete"), flags = array(own(input, "evidenceFlags"), FLAGS.size)
  if (typeof complete !== "boolean" || flags.some(flag => typeof flag !== "string" || !FLAGS.has(flag)) ||
    new Set(flags).size !== flags.length || complete !== (flags.length === 0)) return invalid()
  const nodes = array(own(input, "nodes"), MAX_NODES).map(capture)
  const byId = new Map<string, TreeNode>(), children = new Map<string, TreeNode[]>()
  for (const n of nodes) {
    if (byId.has(n.nodeId)) return invalid()
    byId.set(n.nodeId, n)
  }
  if (nodes.length === 0) return Object.freeze({ width: 0, height: ROW, nodes: Object.freeze([]), edges: Object.freeze([]) })
  const root = byId.get("0")
  if (root === undefined || root.parentNodeId !== null || root.hop !== 0) return invalid()
  for (const n of nodes) {
    if (n === root) continue
    const expected = n.nodeId.slice(0, n.nodeId.lastIndexOf(".")), parent = byId.get(expected)
    if (n.parentNodeId !== expected || parent === undefined || n.hop !== parent.hop + 1) return invalid()
    const siblings = children.get(expected) ?? []
    siblings.push(n); children.set(expected, siblings)
  }
  for (const siblings of children.values()) {
    const index = (n: TreeNode) => Number(n.nodeId.slice(n.nodeId.lastIndexOf(".") + 1))
    siblings.sort((a, b) => index(a) - index(b))
    if (siblings.some((n, i) => index(n) !== i)) return invalid()
  }

  const placed: PlacedNode[] = []
  let row = 0, maxHop = 0
  // Every subtree owns a disjoint interval of leaf rows. Depth is already <=16.
  const place = (n: TreeNode): number => {
    const kids = children.get(n.nodeId) ?? []
    const ys = kids.map(place)
    const y = ys.length === 0 ? row++ * ROW : (ys[0]! + ys[ys.length - 1]!) / 2
    maxHop = Math.max(maxHop, n.hop)
    placed.push(Object.freeze({ ...n, x: n.hop * (NODE_W + COL_GAP), y }))
    return y
  }
  place(root)
  if (placed.length !== nodes.length) return invalid()
  const positions = new Map(placed.map(n => [n.nodeId, n]))
  const edges = placed.filter(n => n.parentNodeId !== null).map(n => {
    const parent = positions.get(n.parentNodeId!)!
    const x1 = parent.x + NODE_W, y1 = parent.y + NODE_H / 2
    const x2 = n.x, y2 = n.y + NODE_H / 2, mid = (x1 + x2) / 2
    return Object.freeze({ from: parent.nodeId, to: n.nodeId, path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}` })
  })
  return Object.freeze({ width: maxHop * (NODE_W + COL_GAP) + NODE_W, height: row * ROW,
    nodes: Object.freeze(placed), edges: Object.freeze(edges) })
}
