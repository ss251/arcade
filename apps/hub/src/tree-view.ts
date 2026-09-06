import { formatPrice, Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { scrubReceipt } from "./receipts-feed.ts"

export interface TreeNode {
  readonly nodeId: string
  readonly parentNodeId: string | null
  readonly skillId: string
  readonly hop: number
  readonly priceAtomic: string
  readonly price: string
  readonly settled: boolean
  readonly reason: string
  readonly latencyMs: number
  readonly settleTx?: string
  readonly explorer: string | null
}
export type TreeEvidenceFlag = "commitment-missing" | "commitment-mismatch" | "receipt-missing" |
  "receipt-conflict" | "lineage-invalid" | "evidence-malformed" | "limit-exceeded" | "reservation-unresolved"
export interface TreeView {
  /** The route must authenticate THIS root's job token before calling this pure helper. */
  readonly rootJobId: string
  /** A matching canonical recorded digest, not an independent on-chain verification. */
  readonly treeHash?: string
  readonly ceiling?: string
  readonly committed?: string
  readonly nodes: ReadonlyArray<TreeNode>
  readonly complete: boolean
  readonly evidenceFlags: ReadonlyArray<TreeEvidenceFlag>
}

// Refuse an oversized global scan; truncate no evidence silently. A bounded tree is
// at most 256 nodes and 16 edges deep regardless of an operator's runtime hop override.
const MAX_SCAN = 20_000, MAX_NODES = 256, MAX_DEPTH = 16
const UINT256_MAX = (1n << 256n) - 1n
const jobId = (v: unknown): v is string => typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v)
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
const atomic = (v: unknown): v is bigint => typeof v === "bigint" && v >= 0n && v <= UINT256_MAX
const own = (value: unknown, key: string): unknown => {
  if (value === null || typeof value !== "object") return undefined
  const d = Object.getOwnPropertyDescriptor(value, key)
  return d !== undefined && "value" in d ? d.value : undefined
}

/** Snapshot only consumed data fields; never execute a receipt accessor or toJSON. */
const snapshot = (value: unknown): Receipt | undefined => {
  const id = own(value, "jobId"), skill = own(value, "skillId"), version = own(value, "skillVersion")
  const buyer = own(value, "buyer"), seller = own(value, "seller"), rail = own(value, "rail"), network = own(value, "network")
  const price = own(value, "priceAtomic"), sellerShare = own(value, "sellerAtomic"), fee = own(value, "feeAtomic")
  const feeBps = own(value, "feeBps"), settled = own(value, "settled"), latency = own(value, "latencyMs"), created = own(value, "createdAtMs")
  const root = own(value, "rootJobId"), parent = own(value, "parentJobId"), hop = own(value, "hop")
  const ceiling = own(value, "treeCeilingAtomic"), committed = own(value, "treeCommittedAtomic")
  if (!jobId(id) || !text(skill) || !text(version) || !text(buyer, 128) || !text(seller, 128) ||
    typeof rail !== "string" || !["eip3009", "gateway", "test"].includes(rail) || !text(network, 128) ||
    !atomic(price) || !atomic(sellerShare) || !atomic(fee) || sellerShare + fee !== price ||
    !integer(feeBps, 10_000) || typeof settled !== "boolean" || !integer(latency) || !integer(created) ||
    root !== undefined && !jobId(root) || parent !== undefined && !jobId(parent) ||
    hop !== undefined && !integer(hop, MAX_DEPTH) || ceiling !== undefined && !atomic(ceiling) ||
    committed !== undefined && !atomic(committed)) return undefined
  const reason = own(value, "reason"), tx = own(value, "settleTx"), treeHash = own(value, "treeHash")
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "settleRefKind")
  const kindAbsent = kindDescriptor === undefined && !("settleRefKind" in (value as object))
  const candidate = kindDescriptor?.enumerable && "value" in kindDescriptor ? kindDescriptor.value : undefined
  const kind = candidate === "onchain" || candidate === "gateway-transfer" || candidate === "gateway-batch" || candidate === "test"
    ? candidate : undefined
  // Own undefined preserves invalid presence without passing an invalid enum into
  // Receipt.make. F14's link guard refuses it; only true absence is legacy data.
  return Receipt.make({ jobId: id, skillId: skill, skillVersion: version, buyer, seller,
    priceAtomic: price, sellerAtomic: sellerShare, feeAtomic: fee, feeBps,
    rail: rail as Receipt["rail"], network, settled, latencyMs: latency, createdAtMs: created,
    reason: text(reason, 1024) ? reason : "",
    ...(kindAbsent ? {} : { settleRefKind: kind }),
    ...(text(tx, 128) ? { settleTx: tx } : {}), ...(text(treeHash, 128) ? { treeHash } : {}),
    ...(root === undefined ? {} : { rootJobId: root }), ...(parent === undefined ? {} : { parentJobId: parent }),
    ...(hop === undefined ? {} : { hop }), ...(ceiling === undefined ? {} : { treeCeilingAtomic: ceiling }),
    ...(committed === undefined ? {} : { treeCommittedAtomic: committed }) })
}
const fingerprint = (r: Receipt): string => JSON.stringify({ kindPresent: Object.hasOwn(r, "settleRefKind"), receipt: r },
  (_, v) => typeof v === "bigint" ? v.toString() : v)

/**
 * Root children are FLAT reserved/committed descendants; released calls are absent.
 * Edges come only from same-root parentJobId + hop, never that flat array. This is a
 * local ledger view: malformed or partial evidence is explicit, never invented proof.
 */
export const buildTreeView = (rootJobId: string, receipts: ReadonlyArray<Receipt>): TreeView | undefined => {
  try { return build(rootJobId, receipts) } catch { return undefined }
}
const build = (rootJobId: string, receipts: ReadonlyArray<Receipt>): TreeView | undefined => {
  if (!jobId(rootJobId) || !Array.isArray(receipts) || receipts.length > MAX_SCAN) return undefined
  const roots = receipts.filter(r => own(r, "jobId") === rootJobId)
  // Never let a last-write-wins map silently pick an ambiguous authorization root.
  if (roots.length !== 1) return undefined
  const root = snapshot(roots[0])
  if (root === undefined || root.parentJobId !== undefined || (root.hop ?? 0) !== 0 ||
    root.rootJobId !== undefined && root.rootJobId !== rootJobId) return undefined

  const flags = new Set<TreeEvidenceFlag>()
  const privateValues = new Set<string>([rootJobId, root.buyer.toLowerCase()])
  const nodes: TreeNode[] = []
  const emit = (r: Receipt, nodeId: string, parentNodeId: string | null) => {
    const pub = scrubReceipt(r)
    const validSkill = /^[a-z0-9][a-z0-9-]{1,63}$/.test(pub.skillId) && !privateValues.has(pub.skillId.toLowerCase())
    if (!validSkill) flags.add("evidence-malformed")
    nodes.push({ nodeId, parentNodeId, skillId: validSkill ? pub.skillId : "unknown-skill", hop: pub.hop,
      priceAtomic: pub.priceAtomic, price: pub.price, settled: pub.settled, reason: pub.reason, latencyMs: pub.latencyMs,
      ...(pub.settleTx === undefined ? {} : { settleTx: pub.settleTx }), explorer: pub.explorer })
  }
  let commitmentValid = false
  const finish = (): TreeView => ({ rootJobId,
    ...(commitmentValid && root.treeHash !== undefined ? { treeHash: root.treeHash } : {}),
    ...(root.treeCeilingAtomic === undefined ? {} : { ceiling: formatPrice(root.treeCeilingAtomic) }),
    ...(root.treeCommittedAtomic === undefined ? {} : { committed: formatPrice(root.treeCommittedAtomic) }),
    nodes, complete: flags.size === 0, evidenceFlags: [...flags].sort() })
  const rawChildren = own(roots[0], "children")
  if (rawChildren === undefined) { flags.add("commitment-missing"); emit(root, "0", null); return finish() }
  if (!Array.isArray(rawChildren)) { flags.add("evidence-malformed"); emit(root, "0", null); return finish() }
  if (rawChildren.length >= MAX_NODES) { flags.add("limit-exceeded"); emit(root, "0", null); return finish() }
  const committed = new Map<string, ReceiptChild>()
  for (let i = 0; i < rawChildren.length; i++) {
    const c = own(rawChildren, String(i)), id = own(c, "jobId"), skill = own(c, "skillId")
    const price = own(c, "priceAtomic"), settled = own(c, "settled"), tx = own(c, "settleTx")
    if (!jobId(id) || !text(skill) || !atomic(price) || typeof settled !== "boolean" || tx !== undefined && !text(tx, 128)) {
      flags.add("evidence-malformed"); continue
    }
    privateValues.add(id.toLowerCase())
    if (id === rootJobId || committed.has(id)) { flags.add("commitment-mismatch"); continue }
    committed.set(id, ReceiptChild.make({ jobId: id, skillId: skill, priceAtomic: price, settled,
      ...(tx === undefined ? {} : { settleTx: tx }) }))
  }
  if (root.treeHash === undefined || root.treeCommittedAtomic === undefined || root.treeCeilingAtomic === undefined) {
    flags.add("commitment-missing")
  } else if (treeHashOf(rootJobId, [...committed.values()]) !== root.treeHash ||
    [...committed.values()].filter(c => c.settled).reduce((sum, c) => sum + c.priceAtomic, 0n) !== root.treeCommittedAtomic ||
    root.treeCommittedAtomic > root.treeCeilingAtomic) flags.add("commitment-mismatch")
  if (flags.size > 0) { emit(root, "0", null); return finish() }
  commitmentValid = true

  const byJob = new Map<string, Receipt>(), conflicts = new Set<string>()
  for (const raw of receipts) {
    const id = own(raw, "jobId")
    if (id === rootJobId || own(raw, "rootJobId") !== rootJobId && !(typeof id === "string" && committed.has(id))) continue
    const r = snapshot(raw)
    if (r === undefined) { flags.add("evidence-malformed"); continue }
    privateValues.add(r.jobId.toLowerCase()); privateValues.add(r.buyer.toLowerCase())
    if (r.rootJobId !== rootJobId || r.parentJobId === undefined || r.hop === undefined || r.hop < 1 ||
      r.network !== root.network || r.rail !== root.rail) { flags.add("lineage-invalid"); continue }
    if (own(raw, "children") !== undefined) { flags.add("evidence-malformed"); continue }
    if (conflicts.has(r.jobId)) continue
    const previous = byJob.get(r.jobId)
    if (previous !== undefined && fingerprint(previous) !== fingerprint(r)) {
      flags.add("receipt-conflict"); conflicts.add(r.jobId); byJob.delete(r.jobId); continue
    }
    byJob.set(r.jobId, r)
    if (byJob.size >= MAX_NODES) { flags.add("limit-exceeded"); emit(root, "0", null); return finish() }
  }
  for (const [id, c] of committed) {
    // The root ledger excludes released calls. An unsettled member still in this
    // manifest is an unresolved reservation even if a matching failed receipt exists.
    if (!c.settled) flags.add("reservation-unresolved")
    const r = byJob.get(id)
    if (r === undefined) { flags.add("receipt-missing"); continue }
    if (r.skillId !== c.skillId || r.priceAtomic !== c.priceAtomic || r.settled !== c.settled || r.settleTx !== c.settleTx) {
      flags.add("commitment-mismatch"); byJob.delete(id)
    }
  }
  for (const [id, r] of byJob) if (r.settled && !committed.has(id)) {
    flags.add("commitment-mismatch"); byJob.delete(id)
  }
  const edges = new Map<string, Receipt[]>()
  for (const r of byJob.values()) {
    const parent = r.parentJobId === rootJobId ? root : byJob.get(r.parentJobId!)
    if (parent === undefined || (parent.hop ?? 0) + 1 !== r.hop || parent.jobId === r.jobId) {
      flags.add("lineage-invalid"); continue
    }
    const kids = edges.get(parent.jobId) ?? []; kids.push(r); edges.set(parent.jobId, kids)
  }
  const seen = new Set<string>()
  const walk = (r: Receipt, position: string, parent: string | null, depth: number) => {
    if (seen.has(r.jobId) || depth > MAX_DEPTH || nodes.length >= MAX_NODES) { flags.add("limit-exceeded"); return }
    seen.add(r.jobId); emit(r, position, parent)
    const kids = [...(edges.get(r.jobId) ?? [])].sort((a, b) => a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0)
    kids.forEach((child, index) => walk(child, `${position}.${index}`, position, depth + 1))
  }
  walk(root, "0", null, 0)
  if (seen.size !== byJob.size + 1) flags.add("lineage-invalid")
  return finish()
}
