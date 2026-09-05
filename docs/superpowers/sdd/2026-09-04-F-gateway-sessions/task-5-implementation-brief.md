> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5 implementation brief — held pending source release

September 5, 2026. Read full Task5 and F5–8 interfaces again against current
core Job/Receipt/errors, Store/memory/SQLite, input gate and the complete
task5-parent-decisions.md. This is planning only: no F5 source, collected test,
database, key, HTTP service, dependency or Git change. F2 corrections remain
frozen. Start only after parent releases the stable F2/F3 gate boundary.

## Intended bounded ownership

Propose this exact implementation set for release:

- New `packages/core/src/session.ts` and `packages/core/test/session.test.ts`.
- Additive `packages/core/src/errors.ts`, `index.ts`, `receipt.ts`.
- New pure `apps/hub/src/session-ledger.ts` and
  `apps/hub/test/session-ledger.test.ts`.
- `apps/hub/src/store.ts`, `store-sqlite.ts` plus new
  `apps/hub/test/sessions-store.bun.test.ts`.
- Only if needed, a new `apps/hub/test/fixtures/session-store-child.ts` for exact
  import-safe/owned subprocess restart fixtures; no import of server.ts.
- Minimal `apps/hub/test/store.test.ts` initial-state field additions need explicit
  approval after their genuine missing-field diagnostic. Existing mock stores
  mostly spread a real Store; preserve their assertions and other task source.

Receipt sessionId/settleRefKind were originally scheduled in F6. Move their
optional schema fields into this F5 foundation only if approved, because the
atomic terminal store must decode their actual contract rather than assert-cast
unknown future fields. Include the current F3 gateway-transfer variant, not only
the plan's misleading gateway-batch. Do not change the meaning of old fields.

No sessions.ts service, server/session route, pipeline, buyer, CLI, web or paid
integration belongs to F5. Those are F6–8/9+, each with independent gates. Preserve
all A/C/D/E tables/behavior; H's statsSource and receipt projection later merge
additively. Do not fold an unrelated legacy store rewrite into this task.

## Core and internal contracts to settle before Red collection

Public core types remain Session, SessionCall, SessionReceipt, SESSION_HEADER and
the four planned named errors. Add bounded network/state/held/completeness fields
needed by the adopted design. SessionReceipt is a closed-session artifact; no
default Date.now close timestamp. SessionCall state distinguishes reserved,
settling, uncertain, settled and released. Calls expose no nonce/signature/input
or raw diagnostics. Exact atomic strings at JSON edges, BigInt internally.

Add fixed tagged errors for invalid/conflicting accounting, storage unavailable,
capacity and pending close. Keep error payloads bounded and privacy-safe. Expected
conflict/budget/closed conditions should be typed failures, not raw SQL defects.
Never copy database details into the error channel. Add them to ArcadeError where
required. Core schema code remains browser-safe and performs no IO/environment
selection at import. Ready pinned-chain enforcement belongs to the hub ledger
adapter receiving explicit validated network/config, not a hidden environment
default in the schema.

Use shared pure transition functions over immutable session/call state so the
memory adapter and SQLite adapters cannot implement subtly different accounting.
The functions return the next state, result and affected job/receipt writes. They
do not invoke a rail. Store extends the approved APIs from the independent review:
openSession/getSession/allSessions/getSessionSnapshot/reserveSessionJob/
beginSessionSettlement/finishSessionJob/markSessionUncertain/closeSession.
If putSession is retained, create-or-exact-identical only; no counter overwrite.
An idempotent begin is not another send permit: claimed is true exactly once.

Expose an explicit backend durability fact for later F7 paid-session preflight;
memory and SQLite :memory: must not claim disk durability merely because a caller
set ARCADE_DB. This is a store fact, not caller-controlled configuration. Parent
may name this readonly service property `sessionStorage: "durable" | "volatile"`.
No additional environment variable or secret is needed.

Initial nested restriction is enforced at the store too: queued job must be a root
with rootJobId equal to its own jobId, hop0, no parent and empty ancestors. F8 will
also refuse session plus non-root lineage before a challenge/admission. Never
inherit a buyer session into seller-funded children. F5 does not write tree rows.

## Persistence mechanics and boundedness

Add exactly sessions and session_calls. Retain immutable normalized binding and
the unique network/domain/payer/nonce claim in session_calls after release.
Use TEXT canonical amounts, CHECK/UNIQUE constraints where SQLite can enforce
them, and runtime decoded invariants for uint256/sums. Neither SQL floating SUM
nor Number may compute money. Canonical columns are the authority; if an indexed
column and retained JSON both exist, their equality is checked on every read/load.
Snapshots and transitions validate current disk, not a cached Session argument.

Each mutation uses synchronous db.transaction(...).immediate under existing
WAL/FULL durability, with a finite busy_timeout. Read/validate/update/commit all
occur without await. Publish exactly the committed result to memory in one
uninterruptible synchronous boundary; failures publish nothing. Return fresh
copies so caller mutation cannot edit internal state or another returned snapshot.

reserveSessionJob atomically creates reservation+queued Job; finishSessionJob
atomically persists terminal Job+immutable Receipt+call state+spent. Duplicate
binding/completion is an exact no-op; changed input digest/job/session/receipt is
a conflict. Updates after close, settled downgrade, uncertain release and nonce
reuse all refuse. markUncertain failure leaves the durable settling hold intact.
Spent must equal settled call sum; held is reserved+settling+uncertain. Every
write checks spent+held<=budget and both equal current rows.

Adopt parent's100 lifetime calls/session and10000 retained sessions; no automatic
deletion or tombstone pruning. Propose additional explicit byte limits before
implementation:16KiB binding/accounting metadata and1MiB each serialized Job/
Receipt, including UTF-8 and BigInt tags; bounded JSON depth/node counts for raw
job payloads. These are new session-path limits, not existing hub guarantees.
Later F8 must validate the terminal candidate fits BEFORE claiming settlement,
so a predictable size refusal cannot arrive only after accepted spend. Parent
should approve these exact byte/depth choices at source release.

The old boot reaper is not authority over session reservations. Exclude jobs
referenced by session_calls from its automatic queued/running rewrite, or retain
their session state independently without falsely reporting uncharged failure.
The simplest proposal is the exclusion; keep non-session reaping unchanged.
Opening a second handle must neither mutate an active session job nor release
its hold. No automatic recovery or timeout/expiry release is added.

## Exact fixture strategy and failure-first sequence

Pure Vitest tests use canonical synthetic root job ids, addresses, gateway UUIDs,
domain coordinates and fixed timestamps; no account/key is needed. Build realistic
Job/Receipt values, not plan placeholders such as0xbuyer. Test the public Store
or pure transition API, not a duplicated algorithm. Failures need meaningful
arithmetic/state assertions after the initial missing-export Red.

SQLite Bun fixtures own a fresh mkdtemp directory/database, use actual
openSqliteStore plus separately tracked inspection handles, close all handles in
finally/afterEach, and delete only the exact owned directory. Do not reuse owner
state/ARCADE_DB/HOME. Two already-open handles are created before admitting jobs;
further reopen tests specifically exercise session-safe boot behavior. Use SQL
triggers to abort queued Job insert, receipt insert, spend update or call-state
update after an earlier statement in the same transaction. Assert the entire
disk snapshot and corresponding memory view remain unchanged, then remove the
owned trigger and show a valid operation succeeds.

Required focused matrix:

1. New row/open/read/restart, >2^53 and uint256-bound money, zero initial spend,
   canonical IDs/address/network/time, exact redundant-field agreement and deep
   snapshot independence. Wrong/corrupt records fail, never appear missing/empty.
2. Two concurrent60-of100 admissions across separate handles admit one. Two
   different30 completions total60. Repeat with same-price siblings, stale snapshots,
   close/reserve race, repeated releases/commits and memory-store parity.
3. Duplicate job with changed binding/input, same nonce across sessions, and replay
   after released/settled/restart all refuse new execution. Identical reservation
   retry returns the existing handle. Two begin calls yield only one claimed:true.
4. Persistence abort/closed DB cases change neither side. Atomic queued job and
   atomic terminal receipt assertions cover failures at each constituent write.
   Failed terminal commit after simulated acceptance retains the prior settling
   amount; snapshot remaining never increases. Settled/uncertain never downgrade.
5. Crash/reopen checkpoints after reserve, after settling but before any mock send,
   after a purely simulated acceptance but before finish, and after finish before
   acknowledgement. All are local state proofs, not payments. If a subprocess is
   useful, invoke only the exact fixture entry with --no-env-file and a minimal
   explicit environment, observe a safe checkpoint, then terminate only that child
   with bounded awaited TERM→KILL. No production failpoint/environment knob.
6. Pending close refusal and final exact closed snapshot; all call membership,
   count/state/ref-kind/spend relationships checked. No invented single-batch
   count or explorer. Foreign buyer/network/rail/payee/amount/skill and duplicate
   terminal evidence fail before mutation.
7. Capacity100/101 calls and10000/10001 sessions, no deletion of unknown holds or
   claims. Validate byte/depth limits before any admission/terminal mutation;
   malformed accessor/prototype/coercible values produce fixed typed errors.
8. Existing non-session store/SQLite, C pay-test and D exact-byte document tests
   still pass; original source/fixture assertions remain intact. Root/web/nested
   TypeScript catches additive field compatibility without unsafe casts.

A SQL trigger proves rollback, not abrupt process death. A child restart proves
survival at the observed boundary, not an external accepted payment. Keep these
evidence categories distinct in the report. F8 later adds actual instrumented
rail+pipeline and HTTP ordering/uncertainty tests; F5 must not claim those now.

## Freeze/gates and outstanding release decisions

Before source release, parent confirms exact extra files, optional Receipt fields
moving forward from F6, minimal legacy empty-state fixture parity and the proposed
per-row/depth limits/backend durability property. Then collect true Reds, implement
the foundation, run only focused pure+Bun and explicit nested strict targets, and
freeze for independent review. Parent owns full repository gates and each commit.
Do not begin F6–8 while this authority is still being revised.
