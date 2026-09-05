> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 selected session receipt getter — implementation freeze

September 6, 2026 (Asia/Kolkata). Delegated getter slice after F7 commit `61fe5ca`; not acceptance of the separate F8 router/pipeline implementation. Read complete actual Task 8/global constraints, current task8-parent-decisions, integration-readiness and source-handoff, actual F5 ledger/Store/SQLite and F6 contracts. Latest observed splitter-fee provenance decisions supersede older configured-fee prose. The ts-testing skill guided failure-first tests using the existing Vitest/Bun stack. The plan's unavailable superpowers/Context7 routing was not replaced by network access; existing local Effect patterns/types were inspected under the no-network scope.

## Exact scope and API

Only four source/test files changed:

- `apps/hub/src/session-ledger.ts`: one required SessionStore interface declaration.
- `apps/hub/src/store.ts`: getter through existing sessionStoreApi, three required error imports, and the approved optional readonly `splitterFeeBps?: number | undefined` / `splitterNetwork?: string | undefined` ListingRecord declarations with their provenance comment.
- New `apps/hub/test/session-receipt.test.ts`.
- New `apps/hub/test/session-receipt.bun.test.ts`.

```text
getSessionReceipt(sessionId: string, jobId: string)
  => Effect<Receipt | undefined, SessionError>
```

No store-sqlite, core schema, F5 transitions, F6 service, router, pipeline, payment, dependency or migration change. The metadata declarations do not themselves observe or stamp a contract; the separately owned successful-handshake path must populate them. Missing legacy observations are not inferred from current boot fee settings.

The getter rejects non-string/coercible/malformed IDs before calling `read`: exact lowercase `ses_` +32hex and `job_` +16–128 ASCII alphanumeric suffix. No trimming, coercion or repair. It uses the selected backend read exactly once, then existing full ledger validation. Unknown selected session or foreign/missing call membership raises SessionNotFound, never a global receipt lookup. Valid reserved/settling/uncertain returns undefined without synthesizing evidence. Both settled and released return a defensive copy of the actual persisted Receipt after correlated Job/Receipt digests and all existing terminal invariants validate. The receipt's optional persisted fields are preserved; nothing is reconstructed from Job or SessionCall.

Malformed input is SessionInvalid; selected read failure, missing terminal receipt, mismatched/duplicate/corrupt evidence is fixed SessionStorageUnavailable for both backends. No provider error or corrupted bytes are reflected. The current synchronous uninterruptible adapter boundary is preserved; no asynchronous retry, compensating write, remote proof or cancellation/rollback claim is added. Read Effects remain repeatable fresh reads, not mutation attempt latches.

## Genuine failure-first chronology

Times below are UTC on September 5 (September 6 IST).

1. 20:11:14 initial Vitest attempt: seven failures, but six were my fixture mistake using a nonexistent `emptyStateForTests` export. Only the seventh reached the missing getter. Corrected only the test to construct the actual typed empty StoreState locally; no production helper/export was added. Those six setup failures are not source Reds.
2. 20:11:15 actual SQLite Bun: **0 pass / 2 fail**, both reached the missing `getSessionReceipt` after successfully opening/reserving through the real Store. Owned DB handles/directories were cleaned up.
3. 20:11:45 corrected Vitest fixture, still before any production change: **0 pass / 7 fail**, all reached the missing getter while exercising pending, terminal, foreign membership and before-read ID policy.
4. Added the narrow getter/interface/metadata declarations: 20:12:32 **7/7 Vitest and 2/2 Bun / 10 assertions Green**.
5. Added corruption, exact-boundary, copy, repeated-read, current-disk and query-bound coverage: **18/18 Vitest and 12/12 Bun / 54 assertions** passed on their first run. These are supplemental passing coverage, not additional Reds.
6. Parent corrected an inaccurate explanatory comment about JS `$` and trailing newlines. Kept the explicit scalar/length/alphabet policy but removed that claim; no test assertion or behavior changed. Trailing-whitespace cases are passing canonical-input coverage, not a reproduced JS-regex defect.

## Final focused verification

Final checks completed 20:16:25 UTC with frozen source:

```text
bun --no-env-file x --no-install vitest run apps/hub/test/session-receipt.test.ts apps/hub/test/session-ledger.test.ts apps/hub/test/sessions.test.ts apps/hub/test/store.test.ts
bun --no-env-file test ./apps/hub/test/session-receipt.bun.test.ts
```

**87/87 Vitest / four files** (18 new getter, 27 unchanged kernel, 30 unchanged F6, 12 unchanged Store), 5.55s. **12/12 Bun / 54 assertions / one file**, 346ms. No HTTP server, child process, external fetch, account or key was used by the new getter tests. Each Bun fixture owns a `mkdtempSync` SQLite directory, closes every writer/reader/inspection handle (including restart handles), then removes that exact owned temporary directory. No fixture process remains running.

Exact TypeScript check used installed `typescript` via `bun --no-env-file -e`, absolute root tsconfig path, `ts.readConfigFile`, `ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath), undefined, configPath)` and `createProgram` with exactly the four owned files as absolute rootNames. Options are the real parsed root options plus noEmit:true/incremental:false. Collected config, parse and all pre-emit diagnostics: **EXACT_F8_GETTER_ROOTS=4 DIAGNOSTICS=0**, exit0. No nested test was excluded. No full repository gate was run.

## What the tests actually establish

- Memory: all three pending states return undefined unchanged; settled/released actual receipts retain persisted fields; returned objects and nested ancestor arrays cannot mutate later reads. Wrong/foreign membership does not select another receipt. Scalar invalid inputs, coercible objects and trailing whitespace cause zero read/mutate calls. Valid minimum/maximum job suffixes cause exactly one selected read.
- Missing/duplicate/foreign/changed receipt, missing/changed terminal Job and unexpected pending receipt are unavailable, with no state repair. Stored accessors are refused without invoking them; raw reader diagnostics remain absent. Reusing a read Effect observes newly persisted terminal evidence and remains read-only after close.
- SQLite: an already-open second handle observes newly reserved/terminal state; close/reopen preserves the actual settled or released receipt without reseeding. Corrupt selected receipt/Job/call evidence fails; explicit fixture restoration through another handle is observed on the next read. A deleted terminal receipt remains unavailable, not pending or synthesized.
- Actual query spying records **four SELECT statements**, all scoped to the selected session: header, calls, correlated jobs and correlated receipts. The latter three retain `session_id = ? LIMIT 101`; actual `EXPLAIN QUERY PLAN` confirms `session_calls_session` index use and queries return only the selected rows. Holding an independent immediate write transaction still permits the read. No getter mutation, global allReceipts/allSessions query, SQL sum/coercion, table or cache was introduced.

Memory deliberately retains bounded whole-state validation and its array representation: corruption in another memory session can make the read unavailable. SQLite reuses the existing current selected-session read transaction and does not decode unrelated corrupt terminal receipt data. It loads up to the existing 100-call session evidence bound, **not a newly optimized one-row physical getter**. The query evidence does not claim remote database durability or a general process-crash test; existing F5 owns those separate proofs.

## Frozen SHA-256 inventory and preserved foundation

```text
76665c4f2be176705bb219aabf3f462b5880116847a80f3163b241a82bf2a265  apps/hub/src/session-ledger.ts
4bc13814caff3002c0b9c64f82d415da8a698dbbedd578a80a8902ce1d6f4385  apps/hub/src/store.ts
b2a99525fd5e6a81c9cf7b802fe9e53d623cabdcd591b4e970f908d475558e80  apps/hub/test/session-receipt.test.ts
d5d7038f53d7216bf27e792672b5af525394a7959a395d84995d3322284f426d  apps/hub/test/session-receipt.bun.test.ts
```

Unchanged SQLite and F6:

```text
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```

A read-only in-memory hash audit removed only the exact additions from the two modified F5 files and compared them against the retained `task5-reference-correction.md` inventory: both reconstruct their original hashes exactly. The other twelve F5/payment files match directly. Thus all fourteen foundation files are unchanged outside the expressly owned additive interface/getter/metadata/import scope. No file was rewritten by this hash check. Owned-file trailing-whitespace scan has no matches (rg exit1 means no matches).

Source/test freeze is ready for G3's independent review and the parent's later combined gate/commit. No Git command, source outside ownership, public-copy edit, full suite, dependency, network, live spending, F1 approval reuse or G/H change occurred. The separate F8 author owns capability authentication, strict public projections and payment/result integration; this internal getter alone is not an authenticated HTTP endpoint or settlement proof.
