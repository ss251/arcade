/** Passive browser-private ordinary recovery. Saved metadata is not signed
 * provenance, proven spend or a balance. No storage, wallet or paid-call imports. */
import { NON_SETTLING } from "../../../../packages/core/src/job.ts"
import { captureStoredJob, type StoredJob } from "./job-store.ts"
import { capturePurchaseInput } from "./purchase-approval.ts"
import { readOrdinaryResult, readOrdinaryTree } from "./ordinary-job-http.ts"
import { settlementReferenceKind, txLink } from "./format.ts"
import type { TreeView } from "./hub-decode.ts"

export type SavedJobSummary = Omit<StoredJob, "token">
export type RecoveredResult = { readonly state: "idle" | "pending" | "unavailable" }
  | {
    readonly state: "settled" | "not_settled"; readonly source: "issuing-hub"; readonly correlation: "saved-row"
    readonly priceAtomic: string; readonly rail: "eip3009" | "gateway"; readonly network: string
    readonly reference: string | null; readonly referenceKind: "onchain" | "gateway-transfer" | null
    readonly explorer: string | null; readonly resultJson: string | null
  }
export type RecoveredTree = { readonly state: "idle" | "unavailable" }
  | { readonly state: "ready"; readonly view: TreeView }
export interface BuyerRecoveryView {
  readonly selected: SavedJobSummary | null
  readonly busy: "result" | "tree" | null
  readonly result: RecoveredResult; readonly tree: RecoveredTree
}
const unavailable = (): RecoveredResult => Object.freeze({ state: "unavailable" })
const object = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0
  return v as Record<string, unknown>
}
const uint = (v: unknown): v is string => typeof v === "string" && v.length <= 78 &&
  /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n
const hash = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v)
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const noTokenEcho = (projection: unknown, row: StoredJob) => !JSON.stringify(projection).toLowerCase().includes(row.token)

/** Shape/accounting checks against the saved job only. We deliberately do not
 * fabricate a live purchase context from the receipt's own buyer or nonce. The
 * selected issuing hub supplies these claims; no independent chain read occurs. */
export const decodeRecoveredResult = (input: unknown, saved: unknown): RecoveredResult => {
  try {
    const row = captureStoredJob(saved), captured = capturePurchaseInput(input)
    if (!row || !captured) return unavailable()
    // Capture bounded own JSON first: no getters, toJSON hooks or shared references.
    const raw = object(JSON.parse(captured)), body = object(raw.body)
    if (body.job_id !== row.jobId) return unavailable()
    if (raw.status === 202 && body.status === "pending") return Object.freeze({ state: "pending" })
    if (raw.status !== 200) return unavailable()
    const receipt = object(body.receipt), rail = receipt.rail, network = receipt.network, kind = settlementReferenceKind(receipt)
    if (receipt.jobId !== row.jobId || receipt.skillId !== row.skillId || receipt.priceAtomic !== row.priceAtomic ||
      !uint(receipt.sellerAtomic) || !uint(receipt.feeAtomic) ||
      typeof receipt.feeBps !== "number" || !Number.isSafeInteger(receipt.feeBps) || receipt.feeBps < 0 || receipt.feeBps > 10000 ||
      BigInt(receipt.sellerAtomic) + BigInt(receipt.feeAtomic) !== BigInt(row.priceAtomic) ||
      BigInt(receipt.feeAtomic) !== BigInt(row.priceAtomic) * BigInt(receipt.feeBps) / 10000n ||
      rail !== "eip3009" && rail !== "gateway" || typeof network !== "string" || !/^eip155:[1-9][0-9]{0,19}$/.test(network) ||
      typeof receipt.settled !== "boolean" || typeof body.status !== "string") return unavailable()
    let reference: string | null = null, referenceKind: "onchain" | "gateway-transfer" | null = null, resultJson: string | null = null
    if (receipt.settled) {
      if (body.status !== "succeeded") return unavailable()
      if (rail === "eip3009") {
        if (!hash(receipt.settleTx) || kind !== undefined && kind !== "onchain") return unavailable()
        reference = receipt.settleTx; referenceKind = "onchain"
      } else {
        if (!uuid(receipt.settleTx) || kind !== undefined && kind !== "gateway-transfer") return unavailable()
        reference = receipt.settleTx; referenceKind = "gateway-transfer"
      }
      const output = body.result
      if (output === undefined || output === null || typeof output === "string" && output.trim() === "" ||
        typeof output === "object" && Object.keys(output).length === 0) return unavailable()
      resultJson = JSON.stringify(output)
    } else if (Object.hasOwn(receipt, "settleTx") || kind !== undefined ||
      body.status !== "succeeded" && !Array.from(NON_SETTLING).some(s => s === body.status)) return unavailable()
    const projection: RecoveredResult = Object.freeze({ state: receipt.settled ? "settled" : "not_settled", source: "issuing-hub",
      correlation: "saved-row", priceAtomic: row.priceAtomic, rail, network, reference, referenceKind,
      explorer: txLink(reference, { rail, network, settled: receipt.settled,
        ...(referenceKind === null ? {} : { settleRefKind: referenceKind }) }), resultJson })
    return noTokenEcho(projection, row) ? projection : unavailable()
  } catch { return unavailable() }
}

const summary = ({ jobId, skillId, priceAtomic, createdAtMs, hubOrigin, realm }: StoredJob): SavedJobSummary =>
  Object.freeze({ jobId, skillId, priceAtomic, createdAtMs, hubOrigin, realm })
const empty = (selected: SavedJobSummary | null): BuyerRecoveryView => Object.freeze({ selected, busy: null,
  result: Object.freeze({ state: "idle" }), tree: Object.freeze({ state: "idle" }) })

/** One current selection; reads require an explicit UI action. Abort is local
 * read cleanup, not payment cancellation. A new selection drops old evidence
 * immediately, and old continuations cannot publish into the new selection. */
export const createBuyerRecovery = (onUpdate: (view: BuyerRecoveryView) => void) => {
  let closed = false, generation = 0, row: StoredJob | undefined, active: AbortController | undefined
  let view = empty(null)
  const emit = (next: BuyerRecoveryView) => {
    view = Object.freeze(next)
    try { onUpdate(view) } catch { /* fixed surface; consumer errors never become hub diagnostics */ }
  }
  const cancel = () => { generation++; active?.abort(); active = undefined }
  return Object.freeze({
    select(input: unknown): void {
      if (closed) return
      cancel(); row = captureStoredJob(input)
      if (row && !noTokenEcho(summary(row), row)) row = undefined
      emit(empty(row ? summary(row) : null))
    },
    async read(kind: "result" | "tree"): Promise<void> {
      if (closed || !row || active || kind !== "result" && kind !== "tree") return
      const captured = row, at = generation, controller = new AbortController()
      active = controller
      const current = () => !closed && generation === at && active === controller
      emit({ ...view, busy: kind, [kind]: { state: "idle" } })
      if (!current()) return // A consumer can replace selection during notification.
      try {
        if (kind === "result") {
          const raw = await readOrdinaryResult(captured, { signal: controller.signal })
          if (current()) emit({ ...view, result: decodeRecoveredResult(raw, captured) })
        } else {
          const tree = await readOrdinaryTree(captured, { signal: controller.signal })
          if (!current()) return
          const root = tree.nodes[0]
          if (!root || root.skillId !== captured.skillId || root.priceAtomic !== captured.priceAtomic || !noTokenEcho(tree, captured)) throw 0
          emit({ ...view, tree: { state: "ready", view: tree } })
        }
      } catch {
        if (current()) emit({ ...view, [kind]: { state: "unavailable" } })
      } finally {
        if (current()) { active = undefined; emit({ ...view, busy: null }) }
      }
    },
    close(): void { if (!closed) { closed = true; cancel(); row = undefined; view = empty(null) } }
  })
}
export type BuyerRecovery = ReturnType<typeof createBuyerRecovery>
