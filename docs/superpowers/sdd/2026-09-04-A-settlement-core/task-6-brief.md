> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 6: Ledger commit/release and the receipt tree in the pipeline

**Merge notes.** `apps/hub/src/pipeline.ts` is edited by **A** (this task: lineage on `RunJobArgs`, commit/release, the receipt tree), **C** (`RunJobArgs.canary` → `Receipt.canary`), **D** (`RunJobArgs.attest`, the queue hand-off *after* `store.putReceipt`) and **F** (`RunJobArgs.rail`/`sessionId`, session commit/release). Land A → C → D → F. All three later plans add one optional field to `RunJobArgs` and one guarded block inside `finish`; the ordering rule inside `finish` is: build the tree → `shouldSettle` → `rail.settle(verified, tree)` → `store.putReceipt(receipt)` → **then** the best-effort side effects (D's attest hand-off, F's session commit). Nothing after `putReceipt` may change a settlement outcome. `apps/hub/src/ui.ts` is edited by A (child rows), C (pay-test line, `canary` mark), D (identity evidence) and F (session refs) — four separate render helpers, same land order.

**Files:**
- Modify: `apps/hub/src/pipeline.ts`, `apps/hub/src/server.ts` (`/jobs/:id/result`), `apps/hub/src/ui.ts` (child rows)
- Test: `apps/hub/test/pipeline-tree.test.ts`

**Interfaces:**
- Produces: on a child's terminal receipt the hub calls `commitTree(childJobId)` when settled, else `releaseTree`; on a root's terminal receipt it builds `children[]` from `treeState(rootJobId)` + child receipts, sets `treeHash = treeHashOf(rootJobId, children)`, `treeCeilingAtomic`, `treeCommittedAtomic`; `GET /jobs/:id/result` returns `receipt.children` and `receipt.treeHash`; `ReceiptTree` JSON for the UI.

- [ ] **Step 1: Write the failing test**

Historical excerpt (not current operator instructions):
```ts
// apps/hub/test/pipeline-tree.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { Bounds, JobOutcome, PublicListing, ROOT_LINEAGE, childLineage, parsePrice, treeHashOf } from "@arcade/core"
import { PaymentPayload, RailTag, makeTestRail, makeTestState, signAuthorization } from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { runJob } from "../src/pipeline.ts"

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const root = PublicListing.make({ id: "parent", version: "1.0.0", serviceName: "P", description: "d", tags: [], price: "$0.25", bounds: Bounds.make({ timeoutSec: 5, maxSubSpendUsd: 0.05 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } })
const child = PublicListing.make({ ...root, id: "child", price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }) })
const ok = JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { ok: true }, startedAtMs: 0, finishedAtMs: 1 })
const stub = (o: JobOutcome): Broker => ({ register: () => Effect.void, unregister: () => Effect.void, dispatch: () => Effect.succeed(o), complete: () => Effect.void, runnerFor: () => Effect.succeed("r"), runnerForJob: () => Effect.succeed("r") })

const verifiedFor = async (rail: ReturnType<typeof makeTestRail>, price: bigint) => {
  const signed = await Effect.runPromise(signAuthorization({ account: buyer, to: SELLER, valueAtomic: price }))
  const req = await Effect.runPromise(rail.challenge({ priceAtomic: price, resource: "/x", payTo: SELLER }))
  const { signature, ...authorization } = signed
  return Effect.runPromise(rail.verify(PaymentPayload.make({ x402Version: 2, payload: { authorization, signature }, accepted: req }), req))
}

describe("receipt tree", () => {
  it("root receipt lists the settled child and commits the tree hash", async () => {
    const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stub(ok)))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_root000000000000", childId = "job_child00000000000"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const r = yield* runJob({ jobId: rootId, listing: root, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.25"))), lineage: rootLineage })
      const st = yield* store.treeState(rootId)
      return { c, r, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(true)
    expect(out.st.committedAtomic).toBe(10_000n)
    expect(out.r.receipt.children?.[0]).toMatchObject({ jobId: "job_child00000000000", settled: true })
    expect(out.r.receipt.treeHash).toBe(treeHashOf("job_root000000000000", out.r.receipt.children!))
    expect(out.r.receipt.treeCommittedAtomic).toBe(10_000n)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run apps/hub/test/pipeline-tree.test.ts`
Expected: FAIL — `children` undefined.

- [ ] **Step 3: Implement in `pipeline.ts`**

Inside `finish`, before building the receipt:

Historical excerpt (not current operator instructions):
```ts
        // Ledger: a child's outcome commits or releases its reservation; a root's outcome
        // closes the tree and computes the commitment the splitter will carry on chain.
        if (args.lineage.hop > 0) {
          yield* settled ? store.commitTree(args.jobId) : store.releaseTree(args.jobId)
        }
        let tree: { children: ReadonlyArray<ReceiptChild>; treeHash: `0x${string}`; ceiling: bigint; committed: bigint } | undefined
        if (args.lineage.hop === 0) {
          const st = yield* store.treeState(args.jobId)
          const receipts = yield* store.allReceipts
          const children = st.children.filter((c) => c.state !== "released").map((c) => {
            const cr = receipts.find((r) => r.jobId === c.childJobId)
            return ReceiptChild.make({ jobId: c.childJobId, skillId: cr?.skillId ?? "", priceAtomic: c.amountAtomic, settled: cr?.settled ?? false, ...(cr?.settleTx === undefined ? {} : { settleTx: cr.settleTx }) })
          })
          const ceiling = args.listing.bounds.maxSubSpendUsd === undefined ? 0n : parsePrice(String(args.listing.bounds.maxSubSpendUsd))
          tree = { children, treeHash: treeHashOf(args.jobId, children), ceiling, committed: st.committedAtomic }
        }
```

and spread into `Receipt.make`: `...(tree === undefined ? {} : { children: tree.children, treeHash: tree.treeHash, treeCeilingAtomic: tree.ceiling, treeCommittedAtomic: tree.committed })`, plus `authorizationNonce: args.verified.payload.payload.authorization.nonce`. Import `ReceiptChild, treeHashOf` from `@arcade/core`.

The tree must be computed **before** settlement so the hash can be passed to the rail (Task 7): compute `tree` once before the `shouldSettle` decision (children are terminal by then because the parent's sandbox awaited each hire), store it in a local, and reuse it in `finish`.

- [ ] **Step 4: Expose it on `/jobs/:id/result` and the UI**

`/jobs/:id/result` already spreads `...receipt`; ensure bigint fields are stringified: add `treeCeilingAtomic: receipt.treeCeilingAtomic?.toString(), treeCommittedAtomic: receipt.treeCommittedAtomic?.toString(), children: receipt.children?.map((c) => ({ ...c, priceAtomic: c.priceAtomic.toString(), explorer: c.settleTx === undefined ? null : explorerTxUrl(c.settleTx) }))`. In `apps/hub/src/ui.ts` `renderReceiptRows`, render each child as an indented row `↳ <skillId> · <price> · <settled ? tx link : reason>` under its parent.

- [ ] **Step 5: Run tests and typecheck**

Run: `bunx vitest run apps/hub && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

Historical command (not current operator instructions):
```text
git add apps/hub/src/pipeline.ts apps/hub/src/server.ts apps/hub/src/ui.ts apps/hub/test/pipeline-tree.test.ts
git commit -m "feat(hub): commit/release tree reservations and publish the receipt tree"
```

---
