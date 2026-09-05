> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 6 report — Ledger commit/release and the receipt tree in the pipeline

## Implemented

`apps/hub/src/pipeline.ts` (`runJob`):

- **Commit/release, inside `finish`, before any persistence.** For a child job
  (`args.lineage.hop > 0`), the first thing `finish` does is
  `yield* settled ? store.commitTree(args.jobId) : store.releaseTree(args.jobId)`.
  Every branch of `runJob` funnels through `finish` (no-settlement decision, settlement
  failure, settlement success), and `broker.dispatch`'s `Effect.timeoutFail` /
  `Effect.catchAll` turn a timeout / `NoRunnerAvailable` / `RunnerDisconnected` /
  unexpected defect into a terminal `JobOutcome` that also reaches `finish` via the normal
  `shouldSettle` path — so a timeout or a lost runner still commits/releases, and
  server.ts's `catchAllCause` around `runJob` never needs to (nothing after `finish`
  returns can crash before the reservation is resolved).
- **Tree computed once, before the settle decision, not inside `finish`.** After
  `outcome` comes back from the broker (children are terminal by then — the parent's
  sandbox awaited each hire), and before `shouldSettle`, a root (`hop === 0`) reads
  `store.treeState(args.jobId)` + `store.allReceipts`, builds `children: ReceiptChild[]`
  from unreleased tree rows joined against the matching receipt (skillId, settled,
  settleTx), and computes `treeHash = treeHashOf(args.jobId, children)` and
  `ceiling = ceilingAtomicFor(args.listing.bounds.maxSubSpendUsd)` (imported from
  `./lineage.ts` rather than re-parsing `maxSubSpendUsd` by hand, per the review note —
  it already guards against unparseable seller-controlled values). The result is held in
  a `let tree | undefined` local, referenced by closure inside `finish`. This placement
  (rather than the brief's literal in-`finish` snippet) is what lets a future Task 7 pass
  `tree` into `rail.settle` before `putReceipt`, per the merge note's ordering rule.
- `Receipt.make` now spreads `children/treeHash/treeCeilingAtomic/treeCommittedAtomic`
  when `tree` is defined, and unconditionally sets
  `authorizationNonce: args.verified.payload.payload.authorization.nonce`.
- New imports: `ReceiptChild`, `treeHashOf` from `@arcade/core`; `ceilingAtomicFor` from
  `./lineage.ts`.

`apps/hub/src/server.ts` (`GET /jobs/:id/result`): the `receipt: {...}` object now also
stringifies `treeCeilingAtomic`/`treeCommittedAtomic` and maps `children[]` to
`{ ...c, priceAtomic: c.priceAtomic.toString(), explorer: c.settleTx === undefined ? null : explorerTxUrl(c.settleTx) }`,
matching the brief exactly.

`apps/hub/src/ui.ts` (`renderReceiptRows`): a new `renderChildRow` helper renders each
`ReceiptChild` as `↳ <skillId> · <price> · settled|tx-link|"not settled"` in an indented
`<tr class="child"><td colspan="7">`, appended after its parent row via
`${(r.children ?? []).map(renderChildRow).join("")}`. `ReceiptChild` has no `reason`
field (it's a commitment record, not a full receipt), so the "reason" slot the brief
describes renders as "not settled" rather than a specific cause. Added one CSS rule
(`tr.child td{...}`) for the indent/muted styling, consistent with the page's existing
semantic-colour rules (`.settled`/`.unsettled` reused, not redefined).

## Tests

New: `apps/hub/test/pipeline-tree.test.ts` — written verbatim from the brief's Step 1
(including the stub broker's `runnerForJob`). One test: a child job is reserved manually
via `store.reserveTree`, run to a settled receipt, then a root job runs and its receipt is
asserted to carry `children[0]` matching the child, `treeHash === treeHashOf(...)`, and
`treeCommittedAtomic === 10_000n`; `store.treeState` also confirms `committedAtomic`.

### TDD evidence

RED (before implementation, `bunx vitest run apps/hub/test/pipeline-tree.test.ts`):
Historical excerpt (not current operator instructions):
```
AssertionError: expected 0n to be 10000n // Object.is equality
 ❯ apps/hub/test/pipeline-tree.test.ts:40:36
   expect(out.st.committedAtomic).toBe(10_000n)
```
(`commitTree` was never called, so the reservation stayed `"reserved"`, which
`treeState`'s `committedAtomic` sum excludes.)

GREEN (after implementation):
Historical excerpt (not current operator instructions):
```
✓ apps/hub/test/pipeline-tree.test.ts (1 test) 69ms
```

### Full suite

`bunx vitest run apps/hub packages/core` — 255 tests total, 250–251 pass consistently;
the only failures are in `apps/hub/test/preflight.test.ts` (4–5 of its 7 tests, a
different subset each run), which spawns the hub as a real subprocess and asserts on its
stdout under a timing budget. Confirmed host-related, not a regression: running
`preflight.test.ts` alone (no contention from the other 21 files running in parallel)
passes 7/7 every time, and the file it tests (`preflight()` in server.ts) was not touched
by this task — only the unrelated `/jobs/:id/result` handler further down was edited.
`apps/hub/test/lineage-http.test.ts` (the other file flagged as spawn-flaky in the task
context) passed in every run of the full suite here. `pipeline.test.ts` (10 tests) and the
new `pipeline-tree.test.ts` (1 test) passed in every run.

`bunx tsc --noEmit` — clean, no output, exit 0.

## Files changed

- `apps/hub/src/pipeline.ts` — commit/release + tree computation + receipt fields
- `apps/hub/src/server.ts` — `/jobs/:id/result` stringifies tree fields, maps children
- `apps/hub/src/ui.ts` — indented child rows under parent receipts, `.child` CSS rule
- `apps/hub/test/pipeline-tree.test.ts` — new, from the brief verbatim

## Self-review

**Completeness.**
- Commit/release on every terminal path: verified by tracing all `finish` call sites
  (`decision.settle === false`, `rail.settle` failure, `rail.settle` success) and
  confirming `broker.dispatch`'s timeout/catchAll always resolve to a `JobOutcome` that
  flows into `shouldSettle` rather than escaping the `Effect.gen`. No path returns from
  `runJob` without calling `finish`.
- Root receipt has `children`/`treeHash`/`treeCeilingAtomic`/`treeCommittedAtomic`:
  covered by the new test's assertions (`children[0]`, `treeHash`, `treeCommittedAtomic`).
  `treeCeilingAtomic` itself isn't asserted by the brief's test but is wired identically
  (spread from the same `tree` local) and exercised implicitly since `ceilingAtomicFor`
  runs on every root.
- `/jobs/:id/result` stringifies bigints: done for `treeCeilingAtomic`,
  `treeCommittedAtomic`, and each child's `priceAtomic`; `explorer` computed per child.
- UI child rows: implemented and typechecks; no existing `ui.test.ts` coverage collided
  with the new markup (grepped — no test references `renderReceiptRows`'s colspan or
  children).

**Quality/discipline.** Kept the tree computation as a single `let` local rather than
threading it through `finish`'s parameters, per the context note's explicit override of
the brief's literal Step-3 placement — this is the one deliberate deviation from the
brief's code block, and it's the placement the merge note (Task 7 needs `tree` before
`rail.settle`) requires. Used `ceilingAtomicFor` instead of re-inlining `parsePrice` per
the review note. No changes to `store.ts` or `store-sqlite.ts` — confirmed their
`commitTree`/`releaseTree`/`treeState` already exist and are wired (from Tasks 4/5), so
nothing needed there.

**Concerns / open items for later tasks.**
- `ReceiptChild` has no failure-reason field, so a child's UI row can only say
  "not settled" rather than why — matches the schema as landed in Task 5; not something
  this task's scope covers changing.
- The merge note's ordering rule ("build tree → shouldSettle → settle →
  `store.putReceipt` → then best-effort side effects") is satisfied as written today;
  Tasks C/D/F will need to insert their own guarded blocks without disturbing this order,
  per the brief's land-order note.

---

## Fix round 1 (review found three Important issues)

Commit: `be413a0` — "fix(hub): release tree reservations on crash, test the release
paths, keep child job ids off the public feed"

### 1. Crash path leaves a child reservation held

**Root cause.** `finish` committed/released a child's reservation as its first step, but
`finish` is only reached via the ordinary `shouldSettle` → settle branches. A defect
raised anywhere before that point — a throw inside `Receipt.make`/`ReceiptChild.make`, a
store defect, `validateOutput` throwing, or (as the added test proves) a defect from
`broker.dispatch` itself — never reaches `finish`, and server.ts's `catchAllCause` around
`runJob` only logs the crash; it never touches the ledger. The reservation is then held
forever.

**Fix (`apps/hub/src/pipeline.ts`).** Restructured `runJob` from a single
`Effect.gen(...)` expression into `{ let ledgerResolved; const job = Effect.gen(...);
return job.pipe(Effect.onError(...)) }`:
- `ledgerResolved` starts `true` for a root (`args.lineage.hop <= 0` — it never held a
  reservation) and `false` for a child.
- Inside `finish`, the instant `store.commitTree`/`store.releaseTree` succeeds,
  `ledgerResolved = true`. This has to happen at that exact point (not later) because
  `finish` still does more after it — `Receipt.make` could in principle throw — and once
  the ledger call has actually succeeded, a later defect must NOT re-release (or
  re-release-after-commit) the same reservation.
- The whole `job` effect is wrapped in `Effect.onError((cause) => ledgerResolved ?
  Effect.void : Effect.flatMap(StoreTag, (store) => store.releaseTree(args.jobId)))`.
  `Effect.onError` fires on a typed failure, a defect (`Effect.die`), or an interruption
  — exactly the class of thing `catchAllCause` in server.ts was only logging — and is a
  no-op once `finish` already resolved the ledger.
- Corrected the comment at the top of `finish`'s ledger block (previously claimed
  "`finish` is the ONLY place that holds a receipt ... so no reservation is ever left
  held", which was the false claim the review caught) to state exactly what `finish`
  covers (ordinary terminal branches) versus what the new `Effect.onError` net at the
  bottom of the function covers (everything else), and why `ledgerResolved` exists.

**Test.** Added `"releases the reservation when the child's dispatch dies before
'finish' ever runs"` to `pipeline-tree.test.ts`: a `dyingBroker` whose `dispatch` returns
`Effect.die(new Error("boom"))` for a child with an existing reservation. Runs
`runJob(...)` through `Effect.exit`, then asserts `Exit.isFailure(exit)` and
`store.treeState(root).reservedAtomic === 0n`.

RED (crash-net temporarily reverted to confirm the test catches the bug — see "Extra
verification" below): `expected 10000n to be 0n` — the reservation stayed `"reserved"`.
GREEN (fix restored): passes.

### 2. The release path was untested

Added two tests to `pipeline-tree.test.ts`, both new and passing:
- **`"releases the reservation when the child does not settle (outcome failed) — the
  root's tree comes back empty"`.** A `stubBySkill` broker returns a `status: "failed"`
  outcome for the child (`ok` for the root). After the child runs:
  `store.treeState(root).reservedAtomic === 0n`, `committedAtomic === 0n`; after the root
  runs, `receipt.children` is `[]` (the released row is filtered out of the tree by the
  existing `c.state !== "released"` check in `pipeline.ts`).
- **`"releases the reservation when the child's outcome succeeds but the rail settle
  fails"`.** Built a `TestRailState` with `failSettlement: true`
  (`{ ...makeTestState(...), failSettlement: true }`, the flag `RailTest`'s `settle`
  already checks) so the child's outcome is a clean success but `rail.settle` fails with
  `SettlementFailed`. Asserts `receipt.settled === false`, `receipt.settleTx ===
  undefined`, and the reservation is released (`reservedAtomic === 0n`,
  `committedAtomic === 0n`).

`pipeline-tree.test.ts` now has 4 tests (was 1); all pass.

### 3. `/receipts` public feed leaked child job ids and the settlement nonce

**New file `apps/hub/src/receipts-feed.ts`** — a pure `publicReceipt(r: Receipt)`
function, deliberately NOT inlined in `server.ts`: `server.ts` boots a real
`Bun.serve` and runs `preflight()` (which can `process.exit`) as an import-time side
effect, so importing it from a test means spawning a subprocess (the pattern
`lineage-http.test.ts` already uses). A pure function in its own module needs none of
that and is directly unit-testable.

`publicReceipt` strips, at every depth:
- `jobId` (top level and per child) — the identifier `/jobs/:id`/`/jobs/:id/result` key
  on.
- `authorizationNonce` — the EIP-3009 nonce, scoped to whoever holds the job token.
- `buyer` — unchanged from before (a wallet address + skill id is a purchase history).
- **`rootJobId` / `parentJobId` — stripped beyond what the review literally asked for.**
  Writing the requested test ("no jobId at any depth") surfaced that for a ROOT receipt,
  `rootJobId` is literally the same string as its own `jobId` — so the existing
  redaction of the top-level `jobId` was being completely undone by `rootJobId` sitting
  right next to it in the same object. Stripping it (and `parentJobId`, which names an
  ancestor's job id on a child receipt) was the only way to make "no job id anywhere in
  the public feed" true rather than true-except-for-a-renamed-copy-of-the-same-field.
  `hop` (a number) and `ancestors` (a list of SKILL ids, not job ids) are kept —
  they describe shape without naming a call. Flagging this explicitly since it goes past
  the literal wording of the fix request (which named only `authorizationNonce` and
  `children`): if the coordinator wants `rootJobId`/`parentJobId` restored to the public
  feed instead, that's a one-line revert in `receipts-feed.ts`.

`children[]` is remapped to exactly `{skillId, priceAtomic: string, settled, settleTx?,
explorer}` — no `jobId`.

`server.ts`'s `/receipts` handler is now `return json(receipts.map(publicReceipt))`; the
old inline redaction logic (and its now-stale comment) is gone. `GET /jobs/:id/result`
is untouched and still returns full child rows (`priceAtomic`/`explorer` added, `jobId`
kept) — it is token-gated, so a child's own job id there is not a leak.

**Test.** New `apps/hub/test/receipts-feed.test.ts`, 4 tests, importing `publicReceipt`
directly (no spawn):
1. `"carries no jobId, buyer, or authorizationNonce at any depth"` — builds a root
   `Receipt` with a `children: [ReceiptChild.make(...)]` and `authorizationNonce` set,
   asserts the JSON-stringified output does not contain the root or child job id
   strings, the literal string `"authorizationNonce"`, the nonce value, or the buyer
   address; and asserts the object has no `jobId`/`buyer`/`authorizationNonce`
   properties.
2. `"keeps the tree shape a public reader needs..."` — asserts `treeCeilingAtomic`/
   `treeCommittedAtomic` are stringified and `children` matches exactly
   `{skillId, priceAtomic, settled, settleTx, explorer}`.
3. `"stringifies the top-level atomic fields and still computes price/explorer"`.
4. `"omits children/treeCeilingAtomic/treeCommittedAtomic when the receipt has none (a
   plain child receipt)"` — a receipt with no tree fields produces none of those keys.

Test 1 initially failed against a `publicReceipt` that only stripped
`authorizationNonce`/`children[].jobId` (`expected ... not to contain
'job_root000000000000'` — the string was present via `rootJobId`), which is the RED
that led to also stripping `rootJobId`/`parentJobId` described above; GREEN after that
change.

### Minors (reviewer, addressed)

- `pipeline.ts` tree-computation comment now explains children are terminal BY
  CONSTRUCTION: a child only ever calls `broker.dispatch` from inside the parent's
  sandboxed run, which the parent's own `broker.dispatch` call awaits — so every hire is
  already committed or released by the time the parent's `outcome` comes back, which is
  what makes `treeHash`/`treeCommittedAtomic` a stable pair.
- The `skillId` fallback for a missing child receipt is now `cr?.skillId ??
  c.childJobId` (was `""`) — an un-landed child stays identifiable in the tree instead
  of blank.

### Extra verification performed

To confirm the new crash-net test actually exercises the fix (not a false positive):
temporarily reverted the `Effect.onError` wrapper in `pipeline.ts` (replacing
`return job.pipe(Effect.onError(...))` with `return job`), ran
`bunx vitest run apps/hub/test/pipeline-tree.test.ts -t "dies before"` — it failed with
`expected 10000n to be 0n`, confirming the test is load-bearing — then restored the file
from a scratchpad backup and re-ran the full file to confirm all 4 tests pass again.

### Commands run and results

- `bunx tsc --noEmit` — clean, no output, exit 0 (run twice: after the `pipeline.ts`
  crash-net change, and again after the `receipts-feed.ts` change).
- `bunx vitest run apps/hub/test/pipeline-tree.test.ts apps/hub/test/pipeline.test.ts
  apps/hub/test/receipts-feed.test.ts` — 18/18 pass (4 + 10 + 4).
- `bunx vitest run apps/hub packages/core` — 262 tests total, 257 pass; the only
  failures are the same pre-existing `preflight.test.ts` subprocess-spawn flakiness
  noted in the original report (4-5 of its 7 tests fail under full-suite parallel load,
  a different subset each run; 7/7 pass every time run in isolation). `preflight.test.ts`
  was not touched by this fix round. Every other file, including all three
  tree/receipts-feed files, passed in every run.

### Files changed (fix round 1)

- `apps/hub/src/pipeline.ts` — crash net (`ledgerResolved` + `Effect.onError`), corrected
  comments, `childJobId` fallback for `skillId`
- `apps/hub/src/server.ts` — `/receipts` now delegates to `publicReceipt`
- `apps/hub/src/receipts-feed.ts` — new, pure `publicReceipt` helper
- `apps/hub/test/pipeline-tree.test.ts` — 3 new tests (failed-outcome release, settle-
  failure release, crash-before-finish release), plus `stubBySkill`/`dyingBroker` helpers
- `apps/hub/test/receipts-feed.test.ts` — new, 4 tests

### Self-review (fix round 1)

- All three Important issues addressed with a passing regression test each; the crash-
  net test was verified RED-without-the-fix / GREEN-with-it, not just written and left
  green.
- The `rootJobId`/`parentJobId` stripping in `receipts-feed.ts` goes beyond the literal
  fix request — called out above rather than silently expanding scope, with the exact
  revert if the coordinator disagrees.
- No changes to `GET /jobs/:id/result` (still token-gated, still returns full child
  rows) or to `apps/hub/src/ui.ts` in this round — neither was implicated by the review.
- `bunx tsc --noEmit` clean; full suite green apart from the pre-existing, host-related
  `preflight.test.ts` flakiness.
