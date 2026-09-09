> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 4 report: Tree reservation ledger in the store (memory + SQLite)

## What was implemented

Added a transactional tree reservation ledger to the hub store, exactly per the brief:

- `apps/hub/src/store.ts`
  - New `TreeRow` interface: `{ childJobId: string; amountAtomic: bigint; state: "reserved" | "committed" | "released" }`.
  - `StoreState.trees: Map<string, Array<TreeRow>>`, initialized in `empty()`.
  - `Store` interface gains `reserveTree`, `commitTree`, `releaseTree`, `treeState`.
  - `makeStore` implements all four:
    - `reserveTree` is a single `Ref.modify` — held = sum of amounts for rows whose state is not `"released"`; refuses (returns `false`, state untouched) when `held + amount > ceiling`; a zero ceiling refuses everything since any positive amount already exceeds it. This makes the check-and-insert atomic within the process.
    - `commitTree` / `releaseTree` use a shared `setTreeState` helper (added just above `makeStore`) that scans all roots for the matching `childJobId` and flips its state.
    - `treeState` sums `reserved` and `committed` rows separately and returns the full row list as `children`.

- `apps/hub/src/store-sqlite.ts`
  - `SCHEMA` gains `tree_reservations` (PK `child_job_id`, `root_job_id`, `amount_atomic` as TEXT, `state`) plus `tree_root` index on `root_job_id`.
  - Load-at-open block (placed after the `ratings` load) rebuilds `trees: Map<string, Array<TreeRow>>` from `SELECT * FROM tree_reservations`, reviving `amount_atomic` via `BigInt(...)`.
  - `initial: StoreState` gains `trees`.
  - Two new prepared statements: `upsertTree` (insert-or-update-state-on-conflict) and `setTreeStateStmt` (plain `UPDATE ... SET state = ? WHERE child_job_id = ?`).
  - `store` object's `reserveTree`/`commitTree`/`releaseTree` are write-through wrappers around `inner`'s in-memory implementation via `Effect.tap`, exactly matching the existing `putJob`/`putReceipt`/`putRating` pattern. `treeState` is a pure read and is left to the `...inner` spread (not overridden) — consistent with `getJob`/`allReceipts`/`ratingsFor` etc.
  - `emptyState()` (used by `StoreFromEnv` when `ARCADE_DB` is unset) gains `trees: new Map()`.
  - Did not wrap `reserveTree` in `db.transaction(...)` — the brief says to do so "only if `Ref.modify` is not sufficient for your runtime," and `Ref.modify` is already the single serialization point for one process; the SQLite row write follows it as a side effect, matching how every other mutation in this file already works.

- `apps/hub/test/store.test.ts`
  - Its local `emptyState()` helper (used to build a bare in-memory `Store` for the pre-existing fee-sweep/stats/listings tests) also had to gain `trees: new Map()`. This wasn't spelled out verbatim in the brief's task-4 code blocks, but it's a direct consequence of the brief's own merge note — every place that constructs a `StoreState` literal must carry `trees`, or the file fails `tsc --noEmit` (this `StoreState` literal is passed straight into `makeStore(Ref.Ref<StoreState>)`, so a missing property is a type error, not just a runtime gap). Confirmed necessary and sufficient — `bunx tsc --noEmit` is clean with this one-line addition and no other file constructs a `StoreState` literal.

- New tests:
  - `apps/hub/test/tree-ledger.test.ts` — vitest, in-memory store via `StoreLive`/`StoreTag`. Copied verbatim from the brief.
  - `apps/hub/test/tree-ledger-sqlite.bun.test.ts` — `bun:test`, opens a real sqlite file, writes through one `openSqliteStore` handle, closes it, reopens a second handle on the same path, and asserts `treeState` reflects what was persisted. Copied verbatim from the brief.

No other files were touched. Followed the brief's merge-note discipline: appended to `SCHEMA`/`StoreState`/`empty()`/`emptyState()`/`initial` rather than rewriting; did not touch `ListingRecord` or any other plan's future fields.

## TDD evidence

### In-memory store (vitest)

RED — before implementing `store.ts`:
Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub/test/tree-ledger.test.ts
 × tree reservation ledger > reserves within the ceiling and refuses beyond it
   → yield* (intermediate value)... is not iterable
 × tree reservation ledger > commit moves reserved to committed; release frees it
   → yield* (intermediate value)... is not iterable
 × tree reservation ledger > a zero ceiling refuses every hire
   → s.reserveTree is not a function
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

GREEN — after implementing `reserveTree`/`commitTree`/`releaseTree`/`treeState` in `store.ts`:
Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub/test/tree-ledger.test.ts
 ✓ apps/hub/test/tree-ledger.test.ts (3 tests) 32ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### SQLite durability (bun test)

RED — after the in-memory store was implemented but before `store-sqlite.ts` gained `trees`:
Historical excerpt (not current operator instructions):
```
$ bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts
(FiberFailure) TypeError: undefined is not an object (evaluating 's.trees.get')
  at apps/hub/src/store.ts:232:22 (reserveTree, called via openSqliteStore's inner store)
 0 pass
 1 fail
```
(This is the correct failure mode: `emptyState()`/`initial` in `store-sqlite.ts` didn't carry `trees` yet, so the sqlite-backed `StoreState` had no `trees` map for `reserveTree` to read.)

GREEN — after adding the `tree_reservations` table, load-at-open block, prepared statements, write-through wrappers, and `trees` in `initial`/`emptyState()`:
Historical excerpt (not current operator instructions):
```
$ bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts
 1 pass
 0 fail
 2 expect() calls
```

## Full verification run

Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub packages/core
 Test Files  1 failed | 18 passed (19)
      Tests  5 failed | 227 passed (232)
```
The 5 failures are all in `apps/hub/test/preflight.test.ts` (spawn-based tests that shell out to a subprocess and assert on its stdout within a fixed window). Re-run in isolation:
Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub/test/preflight.test.ts
 ✓ apps/hub/test/preflight.test.ts (7 tests) 14737ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
All 7 pass standalone — confirms these are the pre-existing spawn-timeout failures under the parallel suite that the task instructions called out in advance, not a regression from this change.

Historical excerpt (not current operator instructions):
```
$ bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts && bunx vitest run apps/hub/test/tree-ledger.test.ts apps/hub/test/store.test.ts
 1 pass / 0 fail (bun)
 ✓ apps/hub/test/store.test.ts (12 tests)
 ✓ apps/hub/test/tree-ledger.test.ts (3 tests)
 Test Files  2 passed (2) / Tests 15 passed (15)
```

Historical excerpt (not current operator instructions):
```
$ bun test .bun.test
```
Ran across all 4 `*.bun.test.ts` files in the repo (`apps/hub/test/store-sqlite.bun.test.ts`, `apps/hub/test/tree-ledger-sqlite.bun.test.ts`, `packages/runner/test/cli-init-guard.bun.test.ts`, `packages/runner/test/config.bun.test.ts`). Both hub-store files are 100% green (confirmed in isolation: `bun test apps/hub/test/store-sqlite.bun.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts` → 8 pass, 0 fail). `packages/runner/test/cli-init-guard.bun.test.ts` shows flaky, timing-dependent failures (1–3 of its tests time out at the hardcoded 5000ms spawn timeout, varying run to run) — pre-existing, unrelated to this task: `git diff --stat HEAD` (before commit) touched only `apps/hub/src/store.ts`, `apps/hub/src/store-sqlite.ts`, and `apps/hub/test/store.test.ts`; nothing under `packages/runner`. Confirmed by running that file standalone, which still shows the same class of spawn-timeout failure.

Historical excerpt (not current operator instructions):
```
$ bunx tsc --noEmit
(clean, no output)
```

## Files changed

- `apps/hub/src/store.ts` — `TreeRow`, `StoreState.trees`, `empty()`, `Store` interface additions, `setTreeState` helper, `makeStore` implementations.
- `apps/hub/src/store-sqlite.ts` — `tree_reservations` table + index in `SCHEMA`, load-at-open, `initial.trees`, `upsertTree`/`setTreeStateStmt` prepared statements, write-through wrappers, `emptyState().trees`.
- `apps/hub/test/store.test.ts` — local `emptyState()` helper gained `trees: new Map()` (required for `tsc --noEmit` to stay clean; no assertions changed).
- `apps/hub/test/tree-ledger.test.ts` (new) — vitest in-memory tests.
- `apps/hub/test/tree-ledger-sqlite.bun.test.ts` (new) — bun:test sqlite durability test.

Commit: `c7f422e` — `feat(hub): transactional tree reservation ledger, durable in sqlite`

## Self-review

**Completeness.** All four `Store` methods (`reserveTree`, `commitTree`, `releaseTree`, `treeState`) implemented in both the in-memory store and the sqlite write-through layer. Both test files present and exercised through RED → GREEN.

**Quality / discipline.** Matched existing patterns exactly: `Ref.modify` for the atomic check-and-insert (mirrors `backfillFeeSweep`'s use of `Ref.modify` for its own atomic read-modify-write), `Ref.update` for simple state transitions, `Effect.tap` write-through wrappers identical in shape to `putJob`/`putReceipt`/`putRating`. `SCHEMA`, `StoreState`, `empty()`/`emptyState()`/`initial` were all appended to, never rewritten, per the merge note — nothing from a future plan (`pay_tests`, `erc8004_docs`, `sessions`, `ListingRecord` fields) was touched or anticipated. No restructuring elsewhere in either file.

**Testing — real behavior, not just shape.**
- Refuse-beyond-ceiling: covered by test 1 (`60_000 + 60_000 > 100_000` refused, first reservation still holds) and test 3 (zero ceiling refuses any positive amount).
- Release-then-reserve: covered by test 2 — commits `job_c1` (60k moves to committed), reserves then releases `job_c2` (30k freed back), then successfully reserves `job_c3` for 40k, and asserts final `committedAtomic`/`reservedAtomic` are exactly `60_000n`/`40_000n` — this specifically exercises that a released row's amount stops counting toward `held`.
- SQLite durability: reserve one child, commit it, reserve a second child (left in `reserved` state), close the handle, reopen on the same path, and assert both `committedAtomic` and `reservedAtomic` survive the round trip with correct bigint values.
- Output is pristine — no console noise, no skipped/todo tests, no `.only`.

**Concerns.**
- None blocking. Two pre-existing, unrelated flaky issues surfaced during the full-suite runs, both spawn/subprocess timing issues, neither touched by this change:
  1. `apps/hub/test/preflight.test.ts` — explicitly flagged in the task instructions as a known host-dependent spawn-timeout issue under the parallel suite; verified it passes 7/7 in isolation.
  2. `packages/runner/test/cli-init-guard.bun.test.ts` — same class of issue (hardcoded 5000ms spawn timeout), not mentioned in the brief but confirmed pre-existing via `git diff --stat` (this task never touched `packages/runner`) and reproduced standalone.
- `setTreeState`'s linear scan over all roots (`for (const [root, rows] of trees)`) to find a `childJobId` is O(roots × rows-per-root) rather than O(1), matching the brief's code verbatim; fine at the hub's stated scale (thousands of receipts/reservations, not millions) and consistent with the file's own stated durable-snapshot-not-database tradeoff.

## Fix round 1: refuse duplicate child reservations

### Finding (from review)

`reserveTree` (`apps/hub/src/store.ts`) accepted the same `childJobId` twice, pushing a second `TreeRow` into the in-memory `trees` map for the root. `tree_reservations.child_job_id` is the SQLite PRIMARY KEY and `upsertTree`'s `ON CONFLICT` clause only updates `state`, not `amount_atomic` — so on the next restart the second reservation's amount was silently dropped from the reloaded row, and `held` (recomputed as the sum over rows for that root) under-reported what was actually outstanding. A later reservation could then be admitted past the true ceiling.

### Fix

In `apps/hub/src/store.ts`, inside the same `Ref.modify` body in `reserveTree`, added two guards before the existing ceiling check:

1. `if (amountAtomic <= 0n) return [false, s]` — a non-positive reservation amount is refused outright (the "optionally" item from the finding; implemented because it's a cheap, unambiguous safety check with no cost to any existing behavior — no existing test relied on a zero/negative amount succeeding).
2. A scan over **all** roots' rows (`for (const rows of s.trees.values())`), refusing (`[false, s]`, state untouched) if any row anywhere already has this `childJobId`. A child job id is unique hub-wide, so this correctly catches a duplicate reserved against a *different* `rootJobId` too, not just the same one.

The SQL `upsertTree` statement and its `ON CONFLICT(child_job_id) DO UPDATE SET state = excluded.state` clause were left exactly as they were — per the finding, this path can no longer be reached with a conflicting id from `reserveTree`, and the clause still serves its original purpose of making `commitTree`/`releaseTree` replays idempotent against the same row.

No sqlite schema or write-through wrapper changes were needed — the fix is entirely in the in-memory `Ref.modify`, which is the single serialization point the SQL write already follows.

### Tests added

- `apps/hub/test/tree-ledger.test.ts` — `"a duplicate childJobId is refused"`: reserves `job_c1` once (succeeds), reserves it again with the same id (refused), asserts `treeState(...).children` has exactly one row.
- `apps/hub/test/tree-ledger-sqlite.bun.test.ts` — `"refuses a duplicate childJobId, so a restart doesn't collapse two reservations into one row"`: reserves `job_dup` for 10,000 (succeeds), reserves `job_dup` again for 90,000 on the same open handle (refused), closes and reopens the store, and asserts the reopened `treeState` shows exactly one child row with the *first* amount (10,000n) — directly exercising the restart-survival property the finding was about.

### TDD evidence

RED — reverted `apps/hub/src/store.ts` to the pre-fix commit (`git checkout -- apps/hub/src/store.ts`), ran the new tests against it:

Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub/test/tree-ledger.test.ts
 ❯ apps/hub/test/tree-ledger.test.ts (4 tests | 1 failed)
   × tree reservation ledger > a duplicate childJobId is refused
     AssertionError: expected true to be false
       at apps/hub/test/tree-ledger.test.ts:47:19  (expect(out.b).toBe(false))
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

Historical excerpt (not current operator instructions):
```
$ bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts
apps/hub/test/tree-ledger-sqlite.bun.test.ts:
  expect(second).toBe(false)
  Expected: false
  Received: true
(fail) tree ledger survives restart > refuses a duplicate childJobId, so a restart doesn't collapse two reservations into one row
 1 pass
 1 fail
```

GREEN — reapplied the fix (`git apply` of the saved diff) and reran:

Historical excerpt (not current operator instructions):
```
$ bunx vitest run apps/hub/test/tree-ledger.test.ts apps/hub/test/store.test.ts
 ✓ apps/hub/test/tree-ledger.test.ts (4 tests) 25ms
 ✓ apps/hub/test/store.test.ts (12 tests) 27ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

Historical excerpt (not current operator instructions):
```
$ bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts
 2 pass
 0 fail
 6 expect() calls
```

Historical excerpt (not current operator instructions):
```
$ bunx tsc --noEmit
(clean, no output)
```

### Files changed (this round)

- `apps/hub/src/store.ts` — duplicate-id guard + non-positive-amount guard in `reserveTree`.
- `apps/hub/test/tree-ledger.test.ts` — new duplicate-refusal test.
- `apps/hub/test/tree-ledger-sqlite.bun.test.ts` — new duplicate-refusal-across-restart test.

Commit: `9b51bc6` — `fix(hub): refuse duplicate child reservations in the tree ledger`

### Self-review (fix round)

- Guard order: amount validity, then duplicate-id, then ceiling — all before any state is touched, so a refusal on any of the three leaves `s` completely unmodified (`return [false, s]`), matching the existing convention for the ceiling check it sits beside.
- The duplicate check is intentionally hub-wide (all roots), not scoped to `rootJobId`, since the finding and the interface both treat `childJobId` as globally unique — scoping it to one root would have missed a duplicate reserved under a different (possibly wrong) root, which is the more dangerous case.
- Verified via full RED/GREEN cycle against the actual pre-fix commit rather than reasoning about it — the failure output above was captured by literally checking out the pre-fix file, not simulated.
- No regressions: `apps/hub/test/store.test.ts` (12 tests, unrelated store coverage) and the full `tree-ledger` + `tree-ledger-sqlite` suites are all green; `bunx tsc --noEmit` is clean.
- Concerns: none new. The `amountAtomic > 0n` validation is a strict superset of prior behavior (nothing before relied on non-positive amounts succeeding), so it's a pure hardening with no observed behavioural cost.
