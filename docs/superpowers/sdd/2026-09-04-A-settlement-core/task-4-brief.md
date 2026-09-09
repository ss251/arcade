> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 4: Tree reservation ledger in the store (memory + SQLite)

**Merge notes.** `apps/hub/src/store.ts` and `store-sqlite.ts` are edited by five plans, each adding a disjoint table plus its `Store` methods: **A** `tree_reservations` (this task), **C** `pay_tests` + `ListingRecord.payTested/.delisted`, **D** `erc8004_docs` + four `ListingRecord` fields, **F** `sessions`, **H** one field (`Store.statsSource`, later rewired by **G**). Land in that order. The mechanical conflicts are always the same three places — the `StoreState` interface, `empty()`/`emptyState()`, and the `SCHEMA` string — so each plan appends rather than rewrites, and `initial` gains one key per plan.

**Files:**
- Modify: `apps/hub/src/store.ts`, `apps/hub/src/store-sqlite.ts`
- Test: `apps/hub/test/tree-ledger.test.ts`, `apps/hub/test/tree-ledger-sqlite.bun.test.ts`

**Interfaces:**
- Produces on `Store`:
  - `reserveTree(rootJobId: string, childJobId: string, amountAtomic: bigint, ceilingAtomic: bigint): Effect<boolean>` — true if reserved; false if `reserved + committed + amount > ceiling`. Atomic per root.
  - `commitTree(childJobId): Effect<void>`, `releaseTree(childJobId): Effect<void>`
  - `treeState(rootJobId): Effect<{ reservedAtomic: bigint; committedAtomic: bigint; children: ReadonlyArray<{childJobId: string; amountAtomic: bigint; state: "reserved"|"committed"|"released"}> }>`
  - `StoreState.trees: Map<string, Array<TreeRow>>` with `TreeRow = {childJobId, amountAtomic, state}`.

- [ ] **Step 1: Write the failing in-memory test**

Historical excerpt (not current operator instructions):
```ts
// apps/hub/test/tree-ledger.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { StoreLive, StoreTag } from "../src/store.ts"

const run = <A>(eff: Effect.Effect<A, never, StoreTag>) =>
  Effect.runPromise(Effect.provide(eff, StoreLive))

describe("tree reservation ledger", () => {
  it("reserves within the ceiling and refuses beyond it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      const a = yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      const b = yield* s.reserveTree("job_root", "job_c2", 60_000n, 100_000n)
      const st = yield* s.treeState("job_root")
      return { a, b, st }
    }))
    expect(out.a).toBe(true)
    expect(out.b).toBe(false)
    expect(out.st.reservedAtomic).toBe(60_000n)
  })
  it("commit moves reserved to committed; release frees it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      yield* s.commitTree("job_c1")
      yield* s.reserveTree("job_root", "job_c2", 30_000n, 100_000n)
      yield* s.releaseTree("job_c2")
      const ok = yield* s.reserveTree("job_root", "job_c3", 40_000n, 100_000n)
      return { ok, st: yield* s.treeState("job_root") }
    }))
    expect(out.ok).toBe(true)
    expect(out.st.committedAtomic).toBe(60_000n)
    expect(out.st.reservedAtomic).toBe(40_000n)
  })
  it("a zero ceiling refuses every hire", async () => {
    const ok = await run(Effect.flatMap(StoreTag, (s) => s.reserveTree("job_r", "job_c", 1n, 0n)))
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run apps/hub/test/tree-ledger.test.ts`
Expected: FAIL — `reserveTree` missing.

- [ ] **Step 3: Implement in `apps/hub/src/store.ts`**

Add to `StoreState`: `readonly trees: Map<string, Array<TreeRow>>` and

Historical excerpt (not current operator instructions):
```ts
export interface TreeRow {
  readonly childJobId: string
  readonly amountAtomic: bigint
  state: "reserved" | "committed" | "released"
}
```

Initialize `trees: new Map()` in `empty()`. Extend `Store`:

Historical excerpt (not current operator instructions):
```ts
  readonly reserveTree: (rootJobId: string, childJobId: string, amountAtomic: bigint, ceilingAtomic: bigint) => Effect.Effect<boolean>
  readonly commitTree: (childJobId: string) => Effect.Effect<void>
  readonly releaseTree: (childJobId: string) => Effect.Effect<void>
  readonly treeState: (rootJobId: string) => Effect.Effect<{
    readonly reservedAtomic: bigint
    readonly committedAtomic: bigint
    readonly children: ReadonlyArray<TreeRow>
  }>
```

Implement in `makeStore` (Ref.modify makes the check-and-insert atomic within the process):

Historical excerpt (not current operator instructions):
```ts
  reserveTree: (rootJobId, childJobId, amountAtomic, ceilingAtomic) =>
    Ref.modify(ref, (s) => {
      const rows = s.trees.get(rootJobId) ?? []
      const held = rows.filter((r) => r.state !== "released").reduce((n, r) => n + r.amountAtomic, 0n)
      if (held + amountAtomic > ceilingAtomic) return [false, s]
      const trees = new Map(s.trees)
      trees.set(rootJobId, [...rows, { childJobId, amountAtomic, state: "reserved" }])
      return [true, { ...s, trees }]
    }),

  commitTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "committed")),
  releaseTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "released")),

  treeState: (rootJobId) =>
    Effect.map(Ref.get(ref), (s) => {
      const rows = s.trees.get(rootJobId) ?? []
      const sum = (st: TreeRow["state"]) => rows.filter((r) => r.state === st).reduce((n, r) => n + r.amountAtomic, 0n)
      return { reservedAtomic: sum("reserved"), committedAtomic: sum("committed"), children: rows }
    })
```

with the helper above `makeStore`:

Historical excerpt (not current operator instructions):
```ts
const setTreeState = (s: StoreState, childJobId: string, state: TreeRow["state"]): StoreState => {
  const trees = new Map(s.trees)
  for (const [root, rows] of trees) {
    if (rows.some((r) => r.childJobId === childJobId)) {
      trees.set(root, rows.map((r) => (r.childJobId === childJobId ? { ...r, state } : r)))
    }
  }
  return { ...s, trees }
}
```

Update `emptyState()` in `store-sqlite.ts` and the `initial` object to include `trees`.

- [ ] **Step 4: Run the in-memory test**

Run: `bunx vitest run apps/hub/test/tree-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing SQLite durability test**

Historical excerpt (not current operator instructions):
```ts
// apps/hub/test/tree-ledger-sqlite.bun.test.ts
import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { openSqliteStore } from "../src/store-sqlite.ts"

describe("tree ledger survives restart", () => {
  it("re-reads reserved and committed rows", async () => {
    const path = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-tree-${process.pid}-${Date.now()}.db`
    const a = openSqliteStore(path, "boot_a")
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c1", 60_000n, 100_000n))
    await Effect.runPromise(a.store.commitTree("job_c1"))
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c2", 30_000n, 100_000n))
    a.close()
    const b = openSqliteStore(path, "boot_b")
    const st = await Effect.runPromise(b.store.treeState("job_root"))
    expect(st.committedAtomic).toBe(60_000n)
    expect(st.reservedAtomic).toBe(30_000n)
    b.close()
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts`
Expected: FAIL — rows not persisted.

- [ ] **Step 7: Persist in `store-sqlite.ts`**

Append to `SCHEMA`:

Historical excerpt (not current operator instructions):
```sql
CREATE TABLE IF NOT EXISTS tree_reservations (
  child_job_id TEXT PRIMARY KEY,
  root_job_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tree_root ON tree_reservations(root_job_id);
```

Load at open (after `ratings`):

Historical excerpt (not current operator instructions):
```ts
  const trees = new Map<string, Array<TreeRow>>()
  for (const row of db.query<{ child_job_id: string; root_job_id: string; amount_atomic: string; state: TreeRow["state"] }, []>(`SELECT * FROM tree_reservations`).all()) {
    const rows = trees.get(row.root_job_id) ?? []
    rows.push({ childJobId: row.child_job_id, amountAtomic: BigInt(row.amount_atomic), state: row.state })
    trees.set(row.root_job_id, rows)
  }
```

(import `TreeRow` from `./store.ts`; add `trees` to `initial`). Statements and wrappers:

Historical excerpt (not current operator instructions):
```ts
  const upsertTree = db.query(
    `INSERT INTO tree_reservations (child_job_id, root_job_id, amount_atomic, state) VALUES (?, ?, ?, ?)
     ON CONFLICT(child_job_id) DO UPDATE SET state = excluded.state`
  )
  const setTreeStateStmt = db.query(`UPDATE tree_reservations SET state = ? WHERE child_job_id = ?`)
```

and in `store`:

Historical excerpt (not current operator instructions):
```ts
    reserveTree: (root, child, amount, ceiling) =>
      Effect.tap(inner.reserveTree(root, child, amount, ceiling), (ok) =>
        Effect.sync(() => { if (ok) upsertTree.run(child, root, amount.toString(), "reserved") })
      ),
    commitTree: (child) => Effect.tap(inner.commitTree(child), () => Effect.sync(() => setTreeStateStmt.run("committed", child))),
    releaseTree: (child) => Effect.tap(inner.releaseTree(child), () => Effect.sync(() => setTreeStateStmt.run("released", child))),
```

Wrap the `reserveTree` body in `db.transaction(...)` only if `Ref.modify` is not sufficient for your runtime; the in-memory `Ref.modify` is the serialization point for one process, and the row write follows it.

- [ ] **Step 8: Run both tests and the store suite**

Run: `bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts && bunx vitest run apps/hub/test/tree-ledger.test.ts apps/hub/test/store.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

Historical command (not current operator instructions):
```text
git add apps/hub/src/store.ts apps/hub/src/store-sqlite.ts apps/hub/test/tree-ledger.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts
git commit -m "feat(hub): transactional tree reservation ledger, durable in sqlite"
```

---
