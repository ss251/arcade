> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5–8 accounting safety readiness — parent source audit, 2026-09-05

Read full Plan F Tasks5–8 and the current store, SQLite, pipeline and paid-path
contracts. This is an implementation decision note, not source changes or tested
behavior. Preserve the plan's product, atomic task commits, no-spend session-open,
default rail compatibility and settle-only-after-valid-output. F1 live scope is
consumed; this note authorizes no key, deposit, settlement or recovery transaction.

## Demonstrable gaps in the illustrative plan

1. F5's Effect.tap(inner.putSession, SQL) changes memory before durable write. A
   closed/failing database could appear to commit spend or close in memory only.
   Existing C/D persistence corrections demonstrate the required write-before-publish
   pattern. The immutable buyer/budget/rail/openedAt fields also cannot be replaced
   through an unrestricted JSON upsert whose SQL indexed fields disagree.
2. F6 keeps only an aggregate process-local in-flight map. Two completions can read
   the same stale session snapshot and overwrite spend; a second release/commit can
   resolve someone else's reservation. Work must be correlated by unique job id,
   not only session id and amount. Close/reserve/commit need atomic current-state
   checks, not an earlier row captured before awaiting signature verification.
3. F8 releases budget on every settle failure or escaping defect. Once a settle POST
   is dispatched, timeout/disconnect/malformed response or failed receipt persistence
   does not establish non-payment. F1 deliberately refused automatic replay for the
   same reason. A crash after acceptance but before spent persistence cannot restore
   the ceiling. Boot reaping a job to failed does not prove an authorization unspent.
4. F7's interface promises calls as SessionCall[], but its example returns a count.
   It accepts tokens from query strings (privacy leak), lacks response no-store,
   bounds neither bodies nor identifiers, and allows close while work is in flight.
5. The F6 receipt example trusts every caller-supplied receipt and deduplicates refs
   as though equal refs proved one batch. Filter/bind buyer, session, rail/network,
   unique jobs and exact money; a transfer UUID is not a mined-batch count. Public
   receipt feeds must continue to exclude session id and other private grouping.

## Required implementation direction before source release

- Make persistence validate immutable session identity and exact canonical amounts;
  never publish to memory before successful SQLite commit. Read the durable authority
  for decisions, and test two handles/stale snapshots, rollback and restart.
- Use durable job-correlated reservations with monotone terminal states. Atomic
  reserve checks current closed state and spent + unresolved + requested <= budget.
  A uniquely claimed authorization/job cannot be committed or released twice.
- Persist a settling/uncertain barrier BEFORE invoking a spending rail. Known
  pre-settlement output failure may release; any post-dispatch ambiguity remains
  held, including after restart. Accepted settlement must not become spendable
  again because receipt/storage failed. No automatic send/reconciliation writes.
- Keep settled spend distinct from unresolved held amounts. A closed or recovered
  session cannot claim all calls settled or complete while outcome is unknown;
  refuse close or explicitly return incomplete status until read-only reconciliation
  provides enough evidence. Do not count held funds as an established charge.
- Core session schemas may add bounded network/reservation/evidence fields needed
  for these guarantees; F7–10 clients must decode the actual implementation contract.
  Preserve required named public APIs where safe, but do not preserve stale snapshot
  or aggregate-amount signatures that undermine unique ownership.
- Header-only canonical token comparison; private,no-store on all session namespace
  responses; fixed diagnostics; bounded body/deadline and open-session resource use.

The durable-reservation details/API remain to be independently reviewed before F5
source release. Add failure-first tests for every listed race/crash boundary; a
missing import is not evidence that a money invariant was reproduced. Scope any
pipeline changes to session accounting, preserving non-session behavior and A/C/D/E.
