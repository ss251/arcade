> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5 durable session foundation — implementer freeze

Frozen 2026-09-05 at 15:07 UTC, after the interrupted turn resumed in place.
Parent independent review, full repository gates, public artifacts and commit are
pending. This is a focused implementation report, not a live-payment result.

## Scope and instructions

Read the full Plan F global rules and Task 5, current core Job/Receipt/errors,
Store/memory/SQLite, and the complete accounting review, parent decisions and
implementation brief. Used the ts-testing skill: existing Vitest/Bun tooling,
behavioral Reds before fixes, real SQLite transactions and owned process fixtures,
and exact TypeScript options without excluding an inconvenient test.

Only the twelve source/test files in the hash inventory below were edited for
F5. The existing store test changed only its two missing state maps, the explicit
StoreState return annotation/type import, and the parent-approved fixed
missing-receipt guard; all original assertions remain. No F6 service, route,
pipeline, buyer, CLI, UI, dependency, F1, live credential or Git work occurred.
No full suite was run. Each temporary SQLite directory was fixture-owned and
removed after closing its handles. Each child used an empty environment and
--no-env-file; observed checkpoints were followed by SIGKILL of that exact child,
awaited exit and cleanup. No fixture invoked a rail or remote network.

## Implemented contract

Core exports Session, SessionCall, closed SessionReceipt, SESSION_HEADER and fixed
tagged session errors. Receipt gains optional sessionId and settleRefKind fields.
These are structural accounting types, not escrow, wallet-balance or mined-payment
proofs. The schemas enforce canonical fields plus budget/time/state/closed-receipt
aggregate consistency. They do not select an environment or perform IO.

Store exposes openSession, getSession, allSessions, getSessionSnapshot,
reserveSessionJob, beginSessionSettlement, finishSessionJob,
markSessionUncertain and closeSession. There is no unsafe putSession overload.
The backend supplies sessionStorage: memory and SQLite memory/temporary databases
are volatile; disk SQLite means tested local restart persistence, not a promise
about host/volume retention.

The shared pure transition kernel atomically owns reservation plus queued Job,
and terminal Job plus immutable Receipt plus spent/state. Amounts remain BigInt
and canonical decimal TEXT; no Number or SQL aggregate computes money. Holds
include reserved, settling and uncertain. A one-shot begin returns claimed:true
only once; repeated calls are not another send permit. A reserved call may release;
settling/uncertain may not release, time out, downgrade or silently retry.

Admission compares canonical session/buyer/seller/rail/network/asset/domain/
payTo/amount/nonce/validAfter/validBefore/skillId/explicit skillVersion and a digest
derived from actual bounded queued input. Identical authorization retries return
the original job ID and original evidence, ignoring only a newly proposed job ID
and queue timestamp. A proposed ID already owned by any session or legacy Job or
Receipt still conflicts. Job has no version field; explicit binding version is
checked against terminal Receipt, not invented from Job. Root-only lineage is
enforced; this foundation does not combine session and sub-hire tree ledgers.

Gateway terminal results require the explicit gateway-transfer category and a
canonical UUID. For explicitly bound EIP-3009/test rails only, an omitted optional
kind plus a nonzero 32-byte hash normalizes to onchain as a reference category.
Neither category independently proves mining. F3 SettledPayment correlation is
not independent proof of recipient credit; F8 must close over the actual verified
binding and rail effect. Gateway batch proof is not implemented.

Legacy putJob/putReceipt cannot overwrite session-owned IDs, including through a
stale second SQLite handle. Legacy receipts cannot invent session membership;
fee backfill excludes session evidence. Other legacy signatures and behavior
remain. Session jobs are excluded from the old boot reaper.

## Durable layout and bounded-query correction

Exactly two new tables: sessions and session_calls. Sessions retain canonical
header JSON with redundant call_count and held_atomic as well as the existing
session coordinates. Calls retain immutable binding, state and evidence digests,
not copies of Job/Receipt bodies or issued signatures. Authorization keys are
hub-wide UNIQUE; nullable settlement_key is also UNIQUE. No API deletes retained
calls or authorization tombstones.

SQLite selected reads and mutations query only the chosen session and at most
100 calls plus its corresponding Jobs and Receipts. Queries use LIMIT 101 to
detect an invalid overflow, then reject anything above 100. A status read has one
header lookup/count check and three indexed evidence queries; unrelated Job JSON
is not decoded. Mutations use synchronous BEGIN IMMEDIATE, read current disk,
validate and commit before returning a result. They do not publish a partial
legacy memory snapshot. Global authorization/reference checks use exact indexes.

Every mutation also compares at most 10,000 retained integer call_count columns
to actual session_calls COUNT under the same writer lock. This is count-only
global metadata work, not evidence loading or money aggregation. Boot checks
header/count agreement and orphan call ownership before any legacy reaper write.
Selected reads compare their actual call count/held sum against the retained
envelope and columns. Missing/extra call rows therefore fail closed against
retained counters, including active second-handle deletion followed by attempted
same-nonce admission in another session. This is not authentication against an
actor coordinating row deletion with counter/metadata rewrites.

The existing allReceipts/statsFor APIs are intentionally global. They return
fresh session terminal receipts after restart and cross-handle writes, validate
each bounded receipt/call/header correlation, and refuse missing/corrupt receipt
evidence. They do not repeatedly load every sibling Job. A malformed terminal Job
can fail its selected session read while global receipt statistics still use a
separately valid correlated receipt. This scope distinction is explicit, not a
claim that every global API is per-session bounded or paginated.

The runtime query spy observed all three actual selected evidence SQL statements.
EXPLAIN QUERY PLAN used session_calls_session for each, and UNIQUE autoindexes
for authorization_key and settlement_key. The one-call fixture returned one row
for each selected evidence query. The 100-call fixture retained all 100 rows after
release/reopen and refused call 101. The 10,000-header fixture refused session
10,001 without deleting rows; its final run took about 108 ms. The tests observe
the two count-only preflight queries and no SQL SUM/CAST in those operations.
These are local query/bounds checks, not a production throughput benchmark.

New-path serialization bounds: 16 KiB metadata, 1 MiB each canonical Job/Receipt,
UTF-8 bytes, depth 64 and 65,536 visited nodes. Canonical property ordering uses
code-unit order, not locale collation. Cycles, accessors, unexpected evidence
fields, raw reserved __bigint keys and malformed/non-data input refuse without
coercion. The exact 1 MiB Job boundary is tested. F8 must prevalidate predictable
terminal size before claiming the one-shot settlement barrier; this store does
not make an oversized accepted result safe to retry.

## Genuine failures and follow-up chronology

Preserved the earlier missing-export/adapter Reds and all partial source on
resume. The initial six adapter failures were missing API/durability behavior;
they do not prove deeper arithmetic assertions had already executed. The first
adapter Green was six tests/26 assertions.

Nine subsequent cases produced five real failures: stale legacy Job overwrite,
invented session receipt, fee-backfill overwrite, mutable returned session Job/
Receipt evidence, and accessor execution. Fixes reached 15 Bun tests/53 assertions.
The raw __bigint case passed immediately under the new serializer and is coverage,
not a claimed preexisting Red.

After resume, corrected a test-title collection error caused by formatting BigInt
with %j. The next core run genuinely failed three cross-field tests: overspend,
contradictory call state and nonzero held balance in a complete receipt. They then
passed with the schema refinements. A later pure run genuinely exposed locale
ordering and silently stripped extra Job evidence fields. The nested malformed
outcome test also required a fixture correction: pass the intended raw bad object
instead of having Job.make reject it before the Store API was reached.

A corrupt noncanonical disk JSON write genuinely returned SessionInvalid instead
of SessionStorageUnavailable; the current-disk load boundary was corrected.

Parent preliminary review added two genuine legacy-ID semantic-retry Reds and
three deletion/reopen Reds. The latter showed a missing reserved/released call
becoming an empty complete session; reopening actually reaped the now-orphan Job.
An additional genuine Red showed selected status parsing unrelated corrupt Job
JSON. These tests remain unchanged and pass after indexed selected loading,
counter envelopes and pre-reaper checks. Finally, another genuine Red showed
active deletion from a different session freeing its nonce for new admission;
the approved count-only preflight now rejects it before creating the proposed Job.

Actual SQL trigger tests cover call/Job insertion, session/call/Job terminal
updates, receipt insertion and failed uncertainty annotation. A deferred foreign
key fixture also causes a real COMMIT failure, rolling back prior writes. These
prove SQLite rollback, not remote acceptance. Four actual child-process deaths
prove observed local checkpoints: reserved; settling before any send; a purely
simulated acceptance object before finish; and settled before acknowledgement.
They do not prove that an external service accepted or mined anything.

Strict checking exposed genuine empty-state field parity, then the invariant
Ref/never[] inference requiring the explicit StoreState annotation. The existing
nullable arithmetic diagnostic was separate and fixed with the approved explicit
missing-receipt guard, preserving its assertion. Implementation-local narrowing/
inference and the draft statsFor arity diagnostics were fixed too; no strict
option was weakened and no file excluded.

## Final focused verification

Completed 2026-09-05, 20:36:55–20:37 IST. All final commands exited zero.

```sh
bun --no-env-file x --no-install vitest run packages/core/test/session.test.ts apps/hub/test/session-ledger.test.ts apps/hub/test/store.test.ts apps/hub/test/paytest-store.test.ts apps/hub/test/erc8004-docs.test.ts
```

67/67 Vitest across five files: 12 core schema, 25 pure/session-memory, and 30
existing Store/pay-test/registry-document cases. Final duration 6.22 seconds.

```sh
bun --no-env-file test apps/hub/test/sessions-store.bun.test.ts apps/hub/test/store-sqlite.bun.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts apps/hub/test/paytest-store-sqlite.bun.test.ts apps/hub/test/store-erc8004-docs.bun.test.ts
```

63/63 Bun tests, 264 assertions across five files: 39 session cases and 24 existing
SQLite/tree/pay-test/document cases. Final duration 8.42 seconds.

An exact-target TypeScript createProgram used the real root tsconfig options,
noEmit:true and incremental:false, including all twelve files listed below and
their real dependency traversal. Result: EXACT_F5_ROOT_OPTIONS_DIAGNOSTICS=0.
This includes the nested hub tests that the root include glob normally omits;
it is not a full repository/web type gate. Reproduction body:

```ts
import ts from "typescript"
const root = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
if (root.error) throw Error("config")
const parsed = ts.parseJsonConfigFileContent(root.config, ts.sys, process.cwd())
const files = [
  "packages/core/src/session.ts", "packages/core/src/errors.ts",
  "packages/core/src/index.ts", "packages/core/src/receipt.ts",
  "packages/core/test/session.test.ts", "apps/hub/src/session-ledger.ts",
  "apps/hub/src/store.ts", "apps/hub/src/store-sqlite.ts",
  "apps/hub/test/session-ledger.test.ts", "apps/hub/test/sessions-store.bun.test.ts",
  "apps/hub/test/fixtures/session-store-child.ts", "apps/hub/test/store.test.ts"
]
const program = ts.createProgram(files, { ...parsed.options, noEmit: true, incremental: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => "\n"
}))
console.log("EXACT_F5_ROOT_OPTIONS_DIAGNOSTICS=" + diagnostics.length)
process.exitCode = diagnostics.length ? 1 : 0
```

## Frozen SHA-256 inventory

```text
a339b4bd34936e68f7297762e9e1e554e8873bce3f405b669abfc635640520c7  packages/core/src/session.ts
3676c2b95e12ed6aa7091f9718d0079b5d804a6c65a7f3f72f6580df46148700  packages/core/src/errors.ts
ecd1fd43329225b40af28db86dda710b8a0978bc7a617600c24c390d54c05c52  packages/core/src/index.ts
e27679bf79e0f157ac6b223ac3ddbec25f987c348683c39e8148cb5ae49c9851  packages/core/src/receipt.ts
931c75782bc45f6e49e9b0bf7541d3164ba897c81d60aca2eff12529618e4fbe  packages/core/test/session.test.ts
5e6568a2922a390afea6dcc3860dec16c5164e83bbc82ccf2cfab4eb86b6df7b  apps/hub/src/session-ledger.ts
233311c6b7880e3a3426e25810a35d1b0ce05843311a4a9fad8611de6c0175e4  apps/hub/src/store.ts
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
5f773901dd0246d22a410b6ccb5777d9fb3f7307ca2a73cd0a8f0e04347d50cf  apps/hub/test/session-ledger.test.ts
f1e1d7968fc646fbb96dfd1a65d0eda267b3cf6279c8b2d43e4ff5c70712eabc  apps/hub/test/sessions-store.bun.test.ts
dd8bb43c58923e0934983b9a42522dd484caf785b3e90cd4d822e675a80739c1  apps/hub/test/fixtures/session-store-child.ts
2b99d3422b7bf6b93534c5a08873acbff424e37b48b7f1bd251c5e18ff039030  apps/hub/test/store.test.ts
```

No tests or owned child processes remain running. F1 approval remains consumed.
No new live authority is inferred. F6–8 integration, private capabilities, output
schema proof, money-uncertainty orchestration and eventual live evidence remain
downstream work, not claims of this foundation.
