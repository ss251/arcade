> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 5 report: Hub lineage derivation and refusals at the paid endpoint

## Implemented

- `apps/hub/src/lineage.ts` (new) — `resolveLineage(store, secret, header, listing, nowMs, maxHop)`,
  copied verbatim from the brief's Step 3. Verifies the hub-issued capability
  (`verifyHireCapability`), loads the claimed parent job from the store, refuses on a
  finished/unknown parent, a cycle (`listing.id` already in `ancestors`), or depth beyond
  `maxHop`; a `null` header returns the `ROOT_LINEAGE("")` placeholder.
- `apps/hub/src/server.ts` — wired into the paid branch (`/x/:seller/:skillId` POST) at the
  position the brief's canonical order puts it: after the input gate, before the
  `header === null` 402 challenge. A forged/expired/cyclic/too-deep capability is refused
  with `402 {error: "lineage_invalid"|"lineage_cycle"|"lineage_depth", detail}` before the
  challenge is even issued. After `rail.verify` succeeds and `jobId` is minted:
  - the placeholder root lineage is resolved to the real `jobId` (`lineage0.hop === 0 ? ROOT_LINEAGE(jobId) : lineage0`)
  - for `hop > 0`, the tree budget is reserved against the root job's listing
    `bounds.maxSubSpendUsd` via `store.reserveTree`; a refusal returns
    `402 {error: "tree_budget_exceeded", detail}` — this happens only on the paid retry
    (the code path with a payment header), never on the probe, because the `header === null`
    branch already returned above it
  - the queued `Job` row carries `rootJobId`, `parentJobId` (spread, only when defined),
    `hop`, `ancestors`
  - a `hireCapability` is minted (`mintHireCapability(hubSecret, jobId, Date.now() + (timeoutSec + 60) * 1000)`)
    only when `listing.bounds.maxSubSpendUsd > 0`
  - `lineage` and `hireCapability` are passed into `runJob({...})`
  - Imports added: `DEFAULT_MAX_HOP, HIRE_CAPABILITY_HEADER, ROOT_LINEAGE, mintHireCapability`
    from `@arcade/core`, `resolveLineage` from `./lineage.ts`.
- `apps/hub/src/broker.ts` — `dispatch` args gain `readonly parentJobId?: string; readonly hireCapability?: string`;
  `conn.send({ ..., _tag: "JobAssignment", ... })` includes both, spread-conditionally
  (omitted when `undefined`, required by `exactOptionalPropertyTypes: true`).
- `apps/hub/src/pipeline.ts` — `RunJobArgs` gains `readonly lineage: Lineage; readonly hireCapability?: string`;
  `broker.dispatch(...)` now passes `parentJobId`/`hireCapability` (conditionally spread);
  both the `Job.make` call and the `Receipt.make` call inside `finish` now carry
  `rootJobId`, `parentJobId` (conditional), `hop`, `ancestors`.
- `apps/hub/test/lineage.test.ts` (new) — the brief's 6 cases verbatim: no header → root;
  valid capability → child; cycle refused; depth refused; forged capability refused;
  finished parent refused.
- `apps/hub/test/pipeline.test.ts` — `setup()`'s `runJob({...})` call now passes
  `lineage: ROOT_LINEAGE("job_testtesttesttest01")`; added `ROOT_LINEAGE` to the
  `@arcade/core` import. This was the only `runJob` call site outside `src/`.

No changes were needed to `packages/core` — `Lineage`, `ROOT_LINEAGE`, `childLineage`,
`mintHireCapability`, `verifyHireCapability`, `HIRE_CAPABILITY_HEADER`, `DEFAULT_MAX_HOP`,
and the lineage/tree-budget errors, plus the `Job`/`Receipt`/`JobAssignment` schema fields,
all already existed from Tasks 1–4 and needed only importing.

## TDD RED/GREEN evidence

RED — `bunx vitest run apps/hub/test/lineage.test.ts` before `lineage.ts` existed:

Historical excerpt (not current operator instructions):
```
FAIL  apps/hub/test/lineage.test.ts [ apps/hub/test/lineage.test.ts ]
Error: Cannot find module '../src/lineage.ts' imported from '.../apps/hub/test/lineage.test.ts'
Test Files  1 failed (1)
     Tests  no tests
```

GREEN — same command after implementing `apps/hub/src/lineage.ts`:

Historical excerpt (not current operator instructions):
```
✓ apps/hub/test/lineage.test.ts (6 tests) 96ms
Test Files  1 passed (1)
     Tests  6 passed (6)
```

## Tests + results

- `bunx vitest run apps/hub packages/core --exclude "**/preflight.test.ts"`:
  **19 files, 232 tests, all pass** (includes the new `apps/hub/test/lineage.test.ts` — 6,
  `apps/hub/test/pipeline.test.ts` — 10, `packages/core/test/lineage.test.ts` — 9,
  `packages/core/test/receipt-tree.test.ts` — 3).
- `bunx tsc --noEmit`: clean, no errors.
- `bun test apps/hub/test/store-sqlite.bun.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts`:
  9 pass, 0 fail — sanity check that the new `Job` lineage fields round-trip through sqlite
  without breaking the durable store (not in the required suite list, run defensively since
  `Job.make` calls changed).
- `apps/hub/test/preflight.test.ts` (part of `bunx vitest run apps/hub`): flaky on this host
  under load — spawns `bun run apps/hub/src/server.ts` as a real subprocess with a 3.5s
  timeout per case; when run as part of the full `apps/hub packages/core` suite (heavy
  parallel collection, ~130s collect phase), some of its 7 cases intermittently report
  `refused: false` / empty stdout, which is `spawnSync` timing out rather than the process
  actually failing to refuse. Verified pre-existing and unrelated to this task:
  - Ran the file in isolation: `bunx vitest run apps/hub/test/preflight.test.ts` — **7/7 pass**.
  - Ran the exact "refuses without ARCADE_HUB_SECRET" scenario directly via a standalone
    `spawnSync` probe script — process exits with status `2` and prints the expected refusal
    message, confirming `server.ts`'s preflight logic itself is correct; the vitest failure
    is a subprocess-timeout artifact of contention when the whole suite runs together.
  - Re-ran the combined suite twice; the failure count varied (4 failures, then 2 failures,
    always in `preflight.test.ts`, never elsewhere) — consistent with host-load flakiness,
    not a deterministic regression from this change.

## Files changed

- `apps/hub/src/lineage.ts` (new)
- `apps/hub/test/lineage.test.ts` (new)
- `apps/hub/src/server.ts`
- `apps/hub/src/broker.ts`
- `apps/hub/src/pipeline.ts`
- `apps/hub/test/pipeline.test.ts`

## Self-review

- Completeness: all four refusal codes (`lineage_invalid`, `lineage_cycle`, `lineage_depth`,
  `tree_budget_exceeded`) are reachable and returned with `402` and a `detail` string.
  `hireCapability` is minted conditionally and threaded through `runJob` → `broker.dispatch`
  → `JobAssignment`. Lineage fields (`rootJobId`, `parentJobId`, `hop`, `ancestors`) are on
  the initial queued `Job` row (server.ts), the terminal `Job` row and the `Receipt`
  (pipeline.ts's `finish`), and `RunJobArgs.lineage` is required (not optional) so no caller
  can silently omit it.
- Canonical order: verified the diff places lineage resolution after the input gate and
  before the `header === null` 402 challenge (a forged/bad capability is refused before any
  challenge is issued, even on a probe), and places the tree reservation after `jobId` is
  minted and only on the branch reached after `rail.verify` — i.e., never on the probe path,
  since that path returns inside the `header === null` block above the reservation code.
  Tasks 6 (delisted check) and 8 (session header / `callRail`) have not landed on this branch
  yet, so there was nothing between the input gate and lineage to reorder around, and `rail`
  (not `callRail`) is still the only rail in scope here — correct for the current state of
  the codebase.
- `exactOptionalPropertyTypes: true` (repo-wide) meant every optional field threaded through
  (`hireCapability`, `parentJobId`) had to be added via conditional spread
  (`...(x === undefined ? {} : { x })`) rather than assigned directly as `x` when `x` might
  be `undefined` — done consistently in `server.ts`, `pipeline.ts`, and `broker.ts`, matching
  the existing pattern already used elsewhere in these files (e.g. `feeSplitter`, `settleTx`).
- Discipline: only the files the brief lists were touched; no changes to `internal/`, no
  secrets touched, no destructive git operations, worktree respected throughout.
- Testing: full required suite plus tsc pristine; the one non-pristine signal
  (`preflight.test.ts` under combined-suite load) was independently reproduced as
  environmental and not a regression, per the task's pre-authorization to report it as such.

## Concerns

- None blocking. One observation for whoever lands Task 6/8 next: once `callRail` exists,
  the lineage block in `server.ts` should keep using `rail.challenge`/`rail.verify` calls it
  doesn't itself make (it makes none — `resolveLineage` never touches the rail), so lineage
  wiring should need no changes when the session-header task lands; it only needs to stay
  positioned between the delisted check and the 402 challenge per the brief's canonical order.

---

# Fix report (round 1) — three Important issues from review

## Issues addressed

**1. Unguarded `parsePrice` on a seller-controlled `maxSubSpendUsd` (server.ts ~:866).**
`parsePrice(String(rootListing.right.listing.bounds.maxSubSpendUsd))` ran with no try/catch
in the fetch handler. `Bounds.maxSubSpendUsd` is `Schema.Number.pipe(Schema.positive())`,
which accepts values `parsePrice` cannot parse: `0.0000005` stringifies to `"5e-7"`,
`0.1234567` has seven decimal places (one more than `parsePrice` allows), `1e21`
stringifies with an exponent — all three throw. A seller whose listing declared such a
`maxSubSpendUsd` would 500 every sub-hire under that root, after the buyer's payment had
already been verified.

Fix — `ceilingAtomicFor(maxSubSpendUsd: number | undefined): bigint` in
`apps/hub/src/lineage.ts`: returns `0n` for `undefined`, non-finite, or non-positive input,
and wraps `parsePrice(String(...))` in try/catch, returning `0n` on any parse failure. `0n`
is the safe reading of "could not be priced" — it makes `reserveTree` refuse with the
already-existing `tree_budget_exceeded` 402 rather than crash the request. The `server.ts`
call site now reads:
Historical excerpt (not current operator instructions):
```ts
const ceiling =
  rootListing !== undefined && rootListing._tag === "Right"
    ? ceilingAtomicFor(rootListing.right.listing.bounds.maxSubSpendUsd)
    : 0n
```
Unit-tested in `apps/hub/test/lineage.test.ts` with exactly the cited inputs
(`0.0000005`, `0.1234567`, `1e21`) plus `undefined`, `0`, negative, `NaN`, and `Infinity` —
7 tests, `describe("ceilingAtomicFor", ...)`.

**2. `ARCADE_MAX_HOP` fails open on garbage (server.ts ~:800).**
`Number(process.env["ARCADE_MAX_HOP"] ?? DEFAULT_MAX_HOP)` turns any non-numeric value into
`NaN`, and `lineage.hop > NaN` is always `false` — so a misconfigured env var silently
disabled the depth check it was meant to configure, rather than falling back to the default.

Fix — `maxHopFromEnv(value: string | undefined): number` in `apps/hub/src/lineage.ts`:
`undefined` or blank (after `.trim()`) returns `DEFAULT_MAX_HOP`; otherwise `Number(value)`
must be `Number.isInteger(n) && n >= 0` or it also falls back to `DEFAULT_MAX_HOP`. Note the
blank-string case is handled explicitly and separately from `undefined` — `Number("")` is
`0`, which passes a naive `Number.isInteger(n) && n >= 0` check and would have silently
*disabled* the guard at its tightest setting instead of defaulting, so blank is treated as
"unset" up front. Call site: `const maxHop = maxHopFromEnv(process.env["ARCADE_MAX_HOP"])`.
Unit-tested with the four required cases (`"three"` → 3, `""` → 3, `"-1"` → 3, `"2"` → 2)
plus `undefined` → 3 and `"0"` → 0 — 5 tests, `describe("maxHopFromEnv", ...)`.

The now-unused `DEFAULT_MAX_HOP` import was dropped from `server.ts`'s `@arcade/core`
import list (still exported from core and re-imported inside `lineage.ts`, which needs it
directly).

**3. No server-level test locked the ordering invariant.**
Added `apps/hub/test/lineage-http.test.ts`, following `preflight.test.ts`'s
spawn-the-real-process pattern (read first, per the instruction) but keeping the process
alive for the whole file rather than one-shot per case, since these assertions are all
against the same running hub:

- `beforeAll` spawns `bun run apps/hub/src/server.ts` with `ARCADE_RAIL=test`, a fixed
  `ARCADE_HUB_SECRET`, and a pid-salted port (`21000 + pid % 4000`) to avoid colliding with
  `preflight.test.ts`'s own `:8787` bind or a parallel worker. No `RAILWAY_*` /
  `ARCADE_PUBLIC_URL` is set, so `preflight()` returns immediately (the laptop case) and the
  process actually serves.
- A real `WebSocket` client acts as a minimal fake runner: it builds and signs a real
  `Hello` (same `helloDigest` + `account.signMessage` the real runner daemon uses,
  `packages/runner/src/daemon.ts:130-145`, read for the exact shape) announcing two
  listings, `root-skill` (deliberately **no** `maxSubSpendUsd` — this is what case (c)
  needs) and `child-skill`, and waits for `{_tag: "Ack", ok: true}`. It never answers any
  `JobAssignment` it receives — by construction, any job dispatched to it stays `queued` for
  the life of the test, which is exactly the live-parent state a hire capability needs to
  name, and proves case (c)'s premise (a queued job, not a fabricated one) without needing
  to reach into the hub's process to write a row directly.
- `payForRootJob()` uses `@arcade/buyer`'s `fetchWithPayment` (aliased for tests in
  `vitest.config.ts`; a real probe → sign (against `RailTest`, no chain) → retry) as a real
  buyer client against the real HTTP endpoint, to mint one genuine root job whose id is used
  as the named parent for cases (a)/(c).
- Three assertions, each a real `fetch` against the spawned process:
  - (a) POST `/x/.../child-skill` with a forged `x-arcade-hire-capability` (minted with a
    different secret) and a valid body → `402 {error: "lineage_invalid"}`.
  - (b) POST `/x/.../root-skill` with a valid body and no header → `402` with a non-empty
    `accepts[]` (the ordinary root challenge).
  - (c) POST `/x/.../child-skill` with a **valid** capability (same `ARCADE_HUB_SECRET`,
    naming the live `root-skill` job) and no payment header → still `402` with `accepts[]`,
    and explicitly **not** `tree_budget_exceeded` — since `root-skill`'s listing declares no
    `maxSubSpendUsd`, `ceilingAtomicFor(undefined) === 0n` would refuse instantly if the
    reservation ran on this probe. It must not run at all before `rail.verify`.

**Test self-validation.** To confirm (c) actually locks the invariant rather than passing
vacuously, I temporarily sabotaged `server.ts` (inserted a stub that returned
`tree_budget_exceeded` whenever `lineage0.hop > 0`, immediately after computing `lineage0`
and before the `header === null` branch — i.e. moved a reservation-shaped refusal onto the
probe path) and re-ran `lineage-http.test.ts`: (a) and (b) still passed, (c) failed exactly
as expected (`expected 'tree_budget_exceeded' not to be 'tree_budget_exceeded'`). Reverted
immediately after — `git diff` on `server.ts` at commit time shows only the two call-site
changes from issues 1 and 2, no trace of the sabotage.

## Commands run + output

- `bunx vitest run apps/hub/test/lineage.test.ts` — **18/18 pass** (6 original
  `resolveLineage` cases + 7 new `ceilingAtomicFor` + 5 new `maxHopFromEnv`).
- `bunx vitest run apps/hub/test/lineage-http.test.ts` (isolated) — **3/3 pass**, ~7-11s
  (subprocess boot + WS handshake + one real payment round trip dominate the time).
- `bunx vitest run apps/hub packages/core` — **20 files, 254 tests collected, 249 pass**;
  the 5 failures are all in `apps/hub/test/preflight.test.ts` (spawn-timeout artifacts under
  combined-suite host load, the same pattern reported in the base Task 5 report — now with
  one more concurrently-spawning subprocess test in the mix, which made it somewhat more
  likely to show up this run: 5 failures here vs. 2-4 in the base-round runs).
- `bunx vitest run apps/hub packages/core --exclude "**/preflight.test.ts"` — **20 files,
  247 tests, all pass** (includes `lineage.test.ts` — 18, `lineage-http.test.ts` — 3,
  `pipeline.test.ts` — 10, core's `lineage.test.ts` — 9).
- `bunx vitest run apps/hub/test/preflight.test.ts` (isolated) — failed 5/7 on one run
  immediately following the combined-suite run above (evidently the host was still under
  load from the just-finished subprocess-spawning tests), then **7/7 pass** on an immediate
  re-run with no code changes in between — reconfirms this is host contention, not a
  regression from this fix round.
- `bunx tsc --noEmit` — clean, no errors, run twice (once after the pure-function fixes,
  once after the new HTTP test file).

## Files changed (fix round)

- `apps/hub/src/lineage.ts` — added `ceilingAtomicFor` and `maxHopFromEnv`.
- `apps/hub/src/server.ts` — call sites updated to use both; dropped the now-unused
  `DEFAULT_MAX_HOP` import (still used internally by `lineage.ts`).
- `apps/hub/test/lineage.test.ts` — appended `describe("ceilingAtomicFor", ...)` (7 tests)
  and `describe("maxHopFromEnv", ...)` (5 tests).
- `apps/hub/test/lineage-http.test.ts` (new) — the ordering-invariant HTTP test, 3 tests.

## Self-review (fix round)

- Both new pure helpers live in `lineage.ts` next to `resolveLineage`, as directed, and are
  exported so the test file can reach them directly — no reliance on env-var side channels.
- `ceilingAtomicFor` intentionally treats `0` and negative the same as "no budget" (`0n`),
  matching the schema's own `Schema.positive()` constraint on `maxSubSpendUsd` — a listing
  that somehow carried a non-positive value is treated identically to one that declared
  none, rather than as a distinct error.
- `maxHopFromEnv`'s blank-string special case was the one non-obvious part: a purely
  numeric coercion (`Number.isInteger(Number(v)) && Number(v) >= 0`) would have made `""`
  behave as `0` (tightest possible depth limit) instead of the intended default — caught by
  writing the required test cases first and noticing `""` needed its own branch.
- The HTTP test does not reach into the hub process's store or Effect runtime at any point —
  every fact it relies on (the root job's id, its `queued` status, the listing's declared
  bounds) is established the same way a real buyer or seller would establish it: a signed
  `Hello`, a real HTTP challenge/retry. That is what makes it a lock on the *wiring* rather
  than a restatement of `lineage.test.ts`'s unit coverage.
- Confirmed via the sabotage-and-revert exercise (above) that case (c) is not a vacuous
  assertion — it fails when the invariant it is meant to protect is actually broken.
- No production code path was left in a sabotaged state — the sabotage was reverted before
  running the final verification pass or committing.

## Concerns

- `apps/hub/test/lineage-http.test.ts` is the slowest test in the hub suite (~7-11s
  standalone, boot + WS handshake + one real payment dominate) and, like
  `preflight.test.ts`, spawns a real OS process and binds a real port — on a sufficiently
  loaded CI host it could need the same "known flaky under contention, passes in isolation"
  treatment `preflight.test.ts` already carries. I did not add a retry or increase its
  timeout beyond `beforeAll`'s explicit `20_000`ms, since in every run here (including
  immediately after the combined-suite run that stressed the host) it passed on the first
  try — only `preflight.test.ts` itself showed contention symptoms.
