> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 selected terminal bundle correction — parent implementation

September 6, 2026, 02:12 IST. This supersedes only the receipt-only consumer
design, not the original getter report or independent review chronology.

Parent source review identified that a validated selected receipt followed by a
separate global getJob could lose the first read's terminal digest authority.
G14 reproduced this with the actual memory Ref/Store/F5 terminal: a wrapper calls
the real getSessionReceipt, then changes only terminal output before getJob.
The draft router returned200 with changed output (expected503), one genuine Red.
SQLite getJob separately revalidates terminal digests and was not shown vulnerable
to that same raw disk race. No general hostile Store/Proxy compromise claim.

Parent took exclusive ownership of the same four getter paths from B9. Added
getSessionTerminal(sessionId,jobId), returning undefined for pending or the
defensive actual {job,receipt} pair from exactly one selected validated read.
The existing getSessionReceipt API remains a projection of the same helper.
Canonical scalar ID refusal precedes IO; selected membership and all unchanged
F5 terminal digests/invariants precede copying. No global Job lookup, cache,
new table, migration, SQL change, F6 change or kernel transition change.
The unchanged memory whole-state and SQLite bounded selected-session distinctions
remain. The receipt reason-accessor test still is not a general JS Proxy sandbox.

Root added seven Vitest and two native SQLite cases before implementing the API.
At02:10:25, Vitest18passed/7failed, all seven new failures reached missing method.
The chained Bun phase did not run after Vitest failure; run separately before
implementation, it gave12passed/2failed/54assertions, both missing method after
successful actual disk seeding. A mistakenly drafted unused test-only type was
removed before either run and is not counted as a Red. Original tests unchanged.

Correction uses the existing safe synchronous selected read and copies both Job
and Receipt before returning. Tests cover all three pending states; settled and
released pair equality, independent nested copies, one selected read, no mutation;
canonical pre-IO refusal and foreign membership; real post-read memory output
mutation with original pair intact and next read unavailable. SQLite tests use
actual already-open second handles, four SELECTs per terminal read, copy isolation,
close/reopen and modified persisted output failing digest validation. Temporary
handles/directories are owned and cleaned; no listener or network is involved.

At02:11:10 final focused run:94Vitest/fourfiles (25getter,27kernel,30F6,12Store),
14nativeSQLiteBun/68assertions/onefile, exit0. Installed TypeScript used absolute
root config/read+parse directory, the four absolute owned roots, original options
plus noEmit/incrementalfalse: EXACT_F8_BUNDLE_ROOTS=4 DIAGNOSTICS=0. No full suite.

G14 owns adapting the router to consume the same-read pair, without getJob.
Its retained regression will assert original-output200 when mutation happens
after the actual bundle returns, then a subsequent corrupted read503. This is
snapshot integrity, not a promise to observe writes after a completed read. The
original one-failure chronology remains recorded. Combined router acceptance,
independent bundle review, public copies and full gate remain pending.

No credentials, live payment, F1 replay, deposit/withdrawal, deployment, public
push, dependency change or source outside the four getter paths was performed.

Frozen fingerprints (last three are unchanged SQLite/F6 foundations):

```text
9eddd13eb1d8a5462aac3a905cb2fef05d14509407fc22b9e7859a7109a66b32  apps/hub/src/session-ledger.ts
ce1649dac5d9c809b45efaa02d4741db3172c10036afa3ef78ffa6077d1a2e55  apps/hub/src/store.ts
59170ddc1f2a3a614dea2c21b514cc7107c168e7758d74a1c7acd49784091d76  apps/hub/test/session-receipt.test.ts
f8a756678c10c1005d5044e168599d49540b0b743257f058f44452d6e2966bdb  apps/hub/test/session-receipt.bun.test.ts
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```
