> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 1 report: Input gate — validate the body before any payment work

## Status: DONE

Commit: `ed9832c` — `feat(hub): validate input against the listing schema before any payment work`

## Resolved ambiguity — `inputGate` lives in a new module, not `server.ts`

`apps/hub/src/server.ts` runs `Effect.runPromise(Effect.scoped(main.pipe(Effect.provide(AppLive)))).catch(...)`
at module scope, and `main` calls `Bun.serve` then `yield* Effect.never`. Importing `server.ts`
from vitest would start a real Bun server and hang the test run (or throw if `AppLive`'s layers
— `StoreFromEnv()`, `BrokerLive`, `railLayer()` — can't initialize without env/DB setup).

Per the brief's pre-resolved ambiguity, I moved `inputGate` into a new small pure module,
`apps/hub/src/input-gate.ts`, and import it from both `apps/hub/src/server.ts` and
`apps/hub/test/input-gate.test.ts`. The test therefore imports from `../src/input-gate.ts`
instead of `../src/server.ts` (brief's Step 6 literal text says the latter). Everything else
follows the brief verbatim, including the exact `inputGate` implementation, doc comment intent,
and the wiring inside the paid-endpoint branch of `server.ts`.

## What I implemented

1. **`apps/hub/src/validate.ts`** — renamed `validateOutput` → `validateJson` (all internal
   recursive calls updated), and added `export const validateOutput = validateJson` as an
   alias, with the doc comment noting it's kept for existing call sites. Updated the module's
   top doc comment to reflect it now serves both the input gate and settlement.

2. **`apps/hub/src/input-gate.ts`** (new) — exports the pure `inputGate(listing, body)` helper
   exactly as specified in the brief (returns `null` on a valid body, or
   `{ error: "input_invalid", detail: "body does not satisfy the listing's inputSchema for ${listing.id}" }`
   otherwise), plus a doc comment explaining why it isn't inline in `server.ts`.

3. **`apps/hub/src/server.ts`**:
   - Added `import { inputGate } from "./input-gate.ts"`.
   - In the paid-endpoint branch (`if (callMatch !== null && req.method === "POST")`), moved
     body parsing to immediately after `const { listing, seller } = found.right`: reads
     `req.text()`, parses JSON (empty string → `{}`), returns `400 {error:"input_invalid",
     detail:"body is not JSON"}` on a parse failure, then calls `inputGate(listing, input)` and
     returns `400` with the gate's payload if it's non-null — all before `parsePrice`, the 402
     challenge, or any payment/verification work.
   - Deleted the old `const input = await req.json().catch(() => ({}))` further down the
     branch (payment work now runs on the already-parsed, already-validated `input`).

4. **`packages/core/src/errors.ts`** — added `InputInvalid` as a new `Data.TaggedError` in a
   new "Input (apps/hub paid endpoint, before any payment work)" section placed above the
   Payment section (matches the file's existing "grouped by stage" convention), and added it
   to the `ArcadeError` union. `Data` was already imported. `packages/core/src/index.ts` uses
   `export * from "./errors.ts"`, so `InputInvalid` is automatically re-exported — no change
   needed there.

5. **`apps/hub/test/validate.test.ts`** — this file already existed with a full 32-test suite
   for `validateOutput` (I did not overwrite it). Added `validateJson` to the import and
   appended the brief's `describe("validateJson", ...)` block (4 tests: accepts conforming
   object, rejects missing required key, rejects pattern miss, `validateOutput` is the same
   reference as `validateJson`) as a new top-level `describe` block. Total: 36 tests.

6. **`apps/hub/test/input-gate.test.ts`** (new) — the brief's 3 tests, with the import changed
   to `../src/input-gate.ts` per the resolved ambiguity above, plus a doc comment explaining
   the deviation.

## TDD evidence

### RED / GREEN — `validateJson` (validate.ts)

I renamed `validateOutput`→`validateJson` before writing the test text into the file, so to get
honest RED evidence I reverted just `apps/hub/src/validate.ts` to its pre-change state via
`git checkout -- apps/hub/src/validate.ts` (file already tracked, safe to restore), ran the
test, then restored the renamed version from a backup copy and re-ran.

RED — `bunx vitest run apps/hub/test/validate.test.ts` (validate.ts at HEAD, `validateJson` not exported):
Historical excerpt (not current operator instructions):
```
FAIL  apps/hub/test/validate.test.ts > validateJson > rejects a pattern miss
TypeError: (0 , validateJson) is not a function
FAIL  apps/hub/test/validate.test.ts > validateJson > keeps validateOutput as an alias
AssertionError: expected [Function validateOutput] to be undefined
 Test Files  1 failed (1)
      Tests  4 failed | 32 passed (36)
```
(The other 2 of the 4 new tests — "accepts a conforming object" and "rejects a missing required
key" — also failed with the same `TypeError`, elided above; vitest showed [2/4] and [3/4] in the
truncated tail.)

GREEN — same command, `validateJson`/alias restored:
Historical excerpt (not current operator instructions):
```
✓ apps/hub/test/validate.test.ts (36 tests) 21ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

### RED / GREEN — `inputGate` (input-gate.ts)

Moved `apps/hub/src/input-gate.ts` out of the tree, ran the test, then restored it.

RED — `bunx vitest run apps/hub/test/input-gate.test.ts` (module absent):
Historical excerpt (not current operator instructions):
```
FAIL  apps/hub/test/input-gate.test.ts [ apps/hub/test/input-gate.test.ts ]
Error: Cannot find module '../src/input-gate.ts' imported from '.../apps/hub/test/input-gate.test.ts'
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN — same command, module restored:
Historical excerpt (not current operator instructions):
```
✓ apps/hub/test/input-gate.test.ts (3 tests) 4ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Full verification (Step 9 + Step 10)

`bunx vitest run apps/hub/test/input-gate.test.ts apps/hub/test/validate.test.ts apps/hub/test/openapi.test.ts apps/hub/test/pipeline.test.ts`:
Historical excerpt (not current operator instructions):
```
✓ apps/hub/test/validate.test.ts (36 tests)
✓ apps/hub/test/input-gate.test.ts (3 tests)
✓ apps/hub/test/openapi.test.ts (24 tests)
✓ apps/hub/test/pipeline.test.ts (10 tests)
 Test Files  4 passed (4)
      Tests  73 passed (73)
```

`bunx vitest run apps/hub packages/core` (run twice for consistency):
Historical excerpt (not current operator instructions):
```
Test Files  1 failed | 15 passed (16)
     Tests  2 failed | 215 passed (217)
```
Both failures are in `apps/hub/test/preflight.test.ts`:
- `preflight — durability > refuses a public deployment with no ARCADE_DB, and names the consequence`
- `preflight — durability > refuses when ARCADE_DB is set but sits outside the mounted volume`

Both `expected false to be true` on a `refused` boolean returned by a spawned subprocess check
— this is the resource-contention flakiness class the task brief flagged (previously observed
as 5 spawn-timeout failures on this host; this run showed 2, same two tests, both times).
Confirmed environmental and unrelated to this change:
- `apps/hub/test/preflight.test.ts` run **in isolation** (`bunx vitest run apps/hub/test/preflight.test.ts`)
  passes all 7 tests every time.
- Neither `preflight.test.ts` nor whatever source file it exercises is touched by this task's
  diff (only `validate.ts`, `server.ts`, `input-gate.ts`, `errors.ts`, and the two test files
  listed above changed).
- Did not attempt to fix, per the task instructions.

`bunx tsc --noEmit`: no output, exit clean.

## Files changed (commit `ed9832c`)

- `apps/hub/src/validate.ts` (modified)
- `apps/hub/src/server.ts` (modified)
- `apps/hub/src/input-gate.ts` (new)
- `packages/core/src/errors.ts` (modified)
- `apps/hub/test/input-gate.test.ts` (new)
- `apps/hub/test/validate.test.ts` (modified)

## Self-review

- **Completeness**: every brief step covered — validator renamed with alias, `InputInvalid`
  error added (and unioned, and auto-exported via `export *`), `inputGate` implemented and
  wired at the top of the paid-endpoint branch exactly where the brief shows, old
  `req.json().catch(() => ({}))` line removed, both new test files created, all required
  commands run.
- **Quality**: names, doc comments, and code shape match the surrounding Effect/tagged-error
  conventions. `input-gate.ts`'s doc comment explains the one deviation from the brief's literal
  text so a future reader isn't confused about why `inputGate` isn't in `server.ts`.
- **Discipline**: no restructuring beyond what the brief asked for; the new branch code is a
  small, self-contained block at the very top of the paid-endpoint branch, as instructed, ready
  for later tasks (lineage checks) to build on top of. Did not modify `pipeline.ts` (not
  required — `validateOutput` alias keeps its existing import working unchanged).
- **Testing**: `apps/hub/test/validate.test.ts`'s pre-existing 32 `validateOutput` tests were
  preserved rather than overwritten (the brief's Step 1 code block would have replaced the
  whole file; since the file already existed with substantial coverage, I appended the new
  `describe("validateJson", ...)` block instead — this keeps both the old and new tests green
  and is the safer, brief-intent-preserving choice). Both RED states were captured honestly by
  temporarily reverting/removing the implementation, not skipped.

## Concerns

- The two `preflight.test.ts` failures under full-suite load are worth noting to whoever reviews
  this branch's overall test health, though they are pre-existing/environmental and out of this
  task's scope, per instructions.
- `apps/hub/src/input-gate.ts` is a new file not named in the brief's file list. It's small
  (19 lines, one exported function) and necessary to keep the test suite side-effect-free; flag
  if a later task in the plan expects `inputGate` to be importable from `server.ts` directly —
  it currently is only importable from `input-gate.ts` (server.ts imports and uses it, but does
  not re-export it).
