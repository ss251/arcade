> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5–8 independent accounting review — September 5, 2026

Read-only design review, not an implementation or reproduced test result. Read the
full F global constraints and Tasks 4–8, the parent's accounting readiness note,
and the actual store/SQLite, paid route, pipeline, Rail, VerifiedPayment,
SettledPayment, Job and Receipt contracts. F2/F3 are active independent scopes;
this proposal neither modifies those sources nor grants live authority. F1's
one-deposit/one-payment authorization is consumed.

## Separate F4 review result

The pure registry is CLEAN. An independent run at 18:19:30 IST passed 10/10
Vitest cases; an explicit TypeScript program targeting rails.test.ts with the
actual root options returned zero diagnostics. Default precedence, first extra
precedence, copied/frozen name inventory, unknown-name refusal and identical
RailTag default are exercised. The report truthfully excludes server boot,
discovery, pipeline selection and live rail proof. No F4 source was changed.

## Findings in the literal plan and current integration points

- Plan F5, lines 1204–1256: the proposed memory-first putSession and unrestricted
  JSON upsert can publish an uncommitted update, replace immutable identity, and
  disagree with indexed columns. F6, lines 1390–1431, uses an aggregate volatile
  map and stale Session values. Two equal-price jobs can release each other's
  holds; two completions can overwrite spend. These are source-derived failure
  cases, not newly executed Reds.
- F8, lines 1950–1981: releasing on receipt.settled=false or catchAllCause is
  unsafe once settlement can have been dispatched. Current pipeline.ts:260–267
  folds typed settlement failures into an unsettled receipt. A response timeout,
  malformed acceptance, interruption, or receipt-write failure is not proof of
  non-payment. Session accounting must be authoritative before the external
  effect, not D's best-effort post-receipt hook at pipeline.ts:148–163.
- Current store-sqlite.ts:131–154 reaps queued/running jobs without knowing whether
  settlement started. Neither that status nor absence of a receipt proves no
  spend. Opening a second store handle also runs this reaper; a boot id alone
  does not prove another process is dead. Do not use it to release session holds.
- A unique job id is necessary but insufficient. EIP-3009/Gateway signatures bind
  domain, payer, payee, amount, time and nonce, not sessionId or input. Concurrent
  retries can present one authorization in different sessions/jobs. F3's current
  attempts map is explicitly process-local (gateway.ts:12–13, 147–148, 188–194).
  Add a durable, hub-wide authorization claim; do not parse diagnostic prose to
  infer whether a rail sent a request.
- Current SQLite putJob/putReceipt are memory-first (store-sqlite.ts:265–287), and
  memory putReceipt appends duplicates (store.ts:331). The new session path cannot
  compose those methods and claim atomic accounting/evidence. Do not broaden this
  task into an unrelated rewrite of every non-session mutation.
- F7's promised calls array differs from its count at plan line 1712. Remaining
  omits held funds, close races work, and the example accepts a URL token. Current
  server.ts:1246–1254 also tells an unsettled poller they were not charged: the
  new session uncertainty path must not emit that claim or release output.

## Smallest durable authority and interfaces

Keep the required Session/SessionCall/SessionReceipt names and existing required
fields, with bounded additive fields. Session needs immutable network, not the
network selected by a later process. Treat spentAtomic as confirmed local rail
acceptance; for Gateway this is accepted transfer spend, not mined batch or
withdrawable recipient balance. Expose heldAtomic separately. No budget is an
escrow or global account balance; a buyer can have other independent obligations.

Use two new tables: sessions plus session_calls. The latter is the reservation,
authorization tombstone and terminal evidence index, not a volatile aggregate.
Do not add a second parallel journal unless a concrete implementation needs it.

```ts
type CallState = "reserved" | "settling" | "uncertain" | "settled" | "released"
// Internal binding: validated own data, never a caller-supplied proof flag.
interface SessionBinding {
  sessionId: string; jobId: string; buyer: string; seller: string
  skillId: string; skillVersion: string; rail: RailName; network: string
  asset: string; verifyingContract: string; domainName: string; domainVersion: string
  payTo: string; amountAtomic: bigint; nonce: string
  validAfter: bigint; validBefore: bigint; requestDigest: string
}
interface SessionSnapshot {
  session: Session; heldAtomic: bigint; remainingAtomic: bigint
  calls: ReadonlyArray<SessionCall>; complete: boolean
}
// Effect errors are bounded tagged variants, never raw SQL/provider diagnostics.
openSession(initial: NewSession): Effect<Session, SessionError>
getSession(id: string): Effect<Session | undefined, SessionError>
allSessions: Effect<ReadonlyArray<Session>, SessionError> // bounded inventory
getSessionSnapshot(id: string): Effect<SessionSnapshot | undefined, SessionError>
reserveSessionJob(binding: SessionBinding, queued: Job):
  Effect<{ created: boolean; jobId: string }, SessionError>
beginSessionSettlement(sessionId: string, jobId: string):
  Effect<{ claimed: boolean }, SessionError>
finishSessionJob(args: SessionTerminal): Effect<void, SessionError>
markSessionUncertain(sessionId: string, jobId: string): Effect<void, SessionError>
closeSession(id: string, atMs: number): Effect<SessionSnapshot, SessionError>
```

These are proposed shapes, not exported source. `SessionTerminal` is a closed
union: pre-settlement release with terminal job/receipt, or accepted settlement
with terminal job/receipt and the locally returned SettledPayment. Its immutable
identity/money fields must match the existing binding exactly. It cannot accept
an arbitrary amount, arbitrary caller-created settled receipt, or a trust boolean.
The service must validate the rail result's payer, exact amount and allowed
reference kind/shape before committing. The rail's returned acceptance is not an
independent chain verifier. A wrong/missing result holds the full reservation.

Preserve `putSession` only if useful as create-or-identical-existing-row checking;
it must never be a mutable spend/close API. Keep newSessionId and openSession helper
names. Replace the unsafe aggregate reserve/release/commit signatures with
job-correlated effects; do not keep a stale-snapshot overload which appears safe.
`inFlightAtomic` becomes an Effect reading the authority, not a synchronous global
map. `sessionReceipt` accepts one validated closed snapshot, or verifies the full
correlated inputs and refuses contradictions; it must not trust an arbitrary
allReceipts array or invent closedAtMs using Date.now().

### Storage rules

- Sessions have immutable id/buyer/budget/rail/network/openedAtMs; new spend is zero.
  Canonical nonzero addresses, IDs, bounded integers/timestamps and uint256 amounts
  are checked at every write and load. Use exact TEXT amounts plus BigInt arithmetic;
  never SQL SUM on TEXT, SQLite REAL or Number conversion. Reconstruct from one
  canonical representation, or verify redundant JSON/columns agree on every load.
- session_calls has job_id PRIMARY KEY, indexed session_id, immutable binding,
  state and timestamps, optional fixed terminal reason/reference plus private
  terminal receipt/job bytes as needed. Add a UNIQUE authorization key built from
  chain + domain name/version/contract + payer + nonce. Retain claims even after
  release; a new authorization is required for a new execution. No signature,
  token, private key or arbitrary diagnostics are part of the new ledger.
- A retry matching all binding/request fields returns created:false and the
  existing handle; it does not execute or spend twice. A changed input/listing/
  amount/session/domain claim fails. Only the first durable reserved→settling
  transition returns claimed:true. Repeating that transition MUST NOT yield a new
  send permit, even if the caller presents the same row. Use normalized canonical
  request bytes/digest, not raw property order or untrusted provider metadata.
- Each mutation runs inside one synchronous BEGIN IMMEDIATE transaction: read
  current disk rows, decode/check invariants, calculate with BigInt, mutate, commit.
  WAL + synchronous FULL already exist. No await/network/Effect fork inside the
  transaction. Publish the exact resulting memory snapshot only after commit, in
  the same uninterruptible synchronous boundary. SQLite session reads/snapshots
  must query disk, not an old inner Ref; two already-open handles must agree.
  The memory test store uses one Ref.modify with the same pure transition rules.
- reserveSessionJob writes the queued Job and new call reservation together before
  dispatch/202. finishSessionJob commits call transition, spent update, terminal
  Job and immutable receipt together, before output or D/E side effects. Failed
  SQL/commit leaves no published mutation. A crash after acceptance before this
  transaction completes leaves settling held, not spendable. A crash after commit
  reloads exactly one receipt and the correct spend. Identical completion retries
  are no-ops; conflicts fail without rewriting an earlier receipt.
- Derive held = sum(reserved, settling, uncertain); spent = sum(settled), and check
  persisted spent agrees. Enforce spent + held + requested <= budget atomically.
  A count/amount inconsistency is unavailable, never silently repaired or zeroed.
  close uses the same lock, requires held==0, and atomically prevents any later
  reservation; duplicate close may retain the planned session_closed refusal.
- Proposed explicit bounds: 100 lifetime calls/session and 10,000 retained sessions
  per store, fixed small row/response bounds, finite busy timeout. Cap exhaustion
  refuses without deleting evidence or unresolved claims. These are implementation
  choices for parent approval, not claims about a shipped configuration. Never
  prune unresolved entries or reuse nonce claims to regain quota. Safe archival
  is a separate future policy.

## Transition and pipeline placement

```text
reserved --validated output + durable one-time claim--> settling
reserved --definite local no-settle terminal----------> released
settling --validated rail acceptance + atomic finish-> settled
settling --timeout/error/crash/unknown----------------> uncertain (or retained settling)
```

No transition returns settling/uncertain/settled to reserved or released. A failed
attempt to mark uncertain is itself safe because the settling row already holds
the budget; marking a previously settled row uncertain must refuse, never downgrade.
Do not promise bounded-time reconciliation or release on expiry:
an authorization could have been accepted before it expired. Future read-only
reconciliation needs exact nonce/payer/payee/asset/amount/domain/payment evidence;
it never resends settlement or mints a new authorization. No public reconciliation
mutation endpoint is needed in F5–8.

F8 keeps input→delist→session resolution→lineage→challenge/verify order. After
verify, recheck canary/delist plus buyer/network/rail/amount/payee/domain against
the actual session and requirements, then allocate a hub job id and reserve from
current authority. A headerless 402 never reserves. Successful admission precedes
runner dispatch. After shouldSettle succeeds, persist the settling barrier before
calling rail.settle, even if the latter throws before returning an Effect. Only
claimed:true may invoke it. No catch/retry wrapper may re-enter that call.

Use the session-specific atomic finish path instead of ordinary putJob/putReceipt
composition. Post-barrier failure returns fixed session_settlement_uncertain with
held amount and no output/no 'no charge' promise. A definite pre-barrier refusal
may return settled:false and release the hold; that means this hub forbids cashing
this job, not that a valid signature has been cryptographically revoked. Preserve
the ordinary no-session branch and its existing tests without broad refactoring.

Nested calls need an explicit decision, not accidental inheritance. Session budget
belongs to its recovered buyer; a seller-funded sub-hire must not automatically
spend that buyer's session. An explicitly same-buyer session child still receives
normal lineage checks and both ceilings. Its session admission/finish must preserve
the corresponding tree row atomically (or refuse that combination safely until
implemented). In particular, the existing pipeline onError/releaseTree path must
not release a session child's tree hold after an uncertain spend. This is a narrow
session-path adaptation, not a claim that all old tree multi-process semantics are
now fixed. Root children remain a flat descendant list; no Gateway mined tree
commitment is inferred.

## F7 wire/privacy and evidence contract

- Preserve the six open-response keys, including rail/network; opening performs no
  deposit/signature/settlement. Enforce closed request shapes, canonical bounded
  dollar strings, nonzero addresses, a small body plus whole-body deadline, and
  no uncontrolled sessions/calls allocation. Only configured rails can be chosen.
- Private session reads/closes require exact canonical x-session-token only, never
  URL/query/referrer transport; all responses within this namespace are private,
  no-store, including failures. Validate method/path/token before private store IO.
  Use the H3 canonical ASCII token guard when branches merge, not F's older raw
  Buffer comparison. Stable configured hub secret + durable store are required for
  real paid sessions even on loopback; otherwise restart loses private access.
  Test/memory mode may be explicitly non-durable, never mislabeled as crash-safe.
- GET returns the promised calls array, not count. Add network, held, complete;
  remaining means budget-spent-held. Each SessionCall needs an explicit accounting
  state so settled:false cannot masquerade as proven non-payment. Return all bounded
  admitted jobs, including pending/uncertain rows, from one atomic snapshot. Unknown
  refs stay absent; stable fixed reasons only. No signature/nonce/raw input/output
  or other sessions' history is exposed.
- Close while any hold exists returns fixed 409 session_pending with the truthful
  bounded summary; it does not mark closed and fabricate a complete receipt.
  Final calls and aggregate spend are correlated by unique job/session/buyer/rail/
  network/seller/skill/amount; contradictory or missing terminal evidence refuses.
- Include gateway-transfer in the additive settleRefKind contract. UUID references
  are accepted transfer IDs, not transaction hashes or a count of mined batches.
  N references do not imply N batches, and matching refs do not independently prove
  one batch. Gateway reference explorer stays null. Fee breakdown must retain the
  actual rail's evidence distinction: F3 pays the signed amount to seller, while
  existing pipeline splitFee is an accounting allocation, not proof of a Gateway
  on-chain splitter payout. No new fee-transfer/mining claim should be introduced.
- Public H1 receipts already use a whitelist. Keep session IDs/accounting details
  out; do not replace it with F8's obsolete rest-spread omission example. F9/F10/H
  consumers must decode the actual additive null/state/held contract before use.

## Failure-first sequence to require before implementation freeze

1. Store parity and restart: exact >2^53 atomic values; immutable field mismatch,
   corrupted JSON/column disagreement, closed DB and abort triggers. Observe disk
   and memory unchanged on failure, including insert-before-commit failure.
2. Two already-open handles: concurrent 60+60 reservations under 100 admits one;
   two 30 completions total 60; close racing reserve has one valid serialization;
   stale putSession cannot reset spent/closed. Repeat on memory Ref semantics.
3. Distinct equal-price jobs: duplicate completion/release never touches sibling;
   changed-binding duplicate job rejected. Same nonce raced across sessions/restart
   executes at most once; released tombstone remains. Both settling claim callers
   receive at most one true send permit. All counters remain exact.
4. Actual session pipeline with instrumented local rail: no settle on invalid output;
   proof durable settling exists when settle is entered; store trigger failure
   prevents send; synchronous throw/interruption/timeout/accepted-then-receipt-failure
   holds budget. No automatic replay and no false 'not charged' poll response.
5. Crash injection at every boundary: before admission commit, after admission,
   after settling commit but before send, after mock acceptance before finish,
   during atomic finish, and after finish before HTTP response. Restart must never
   make an ambiguous amount available or count an acceptance twice. Opening a
   second handle must not release a live first handle's session call.
6. Correlation mutations: wrong session/buyer/network/rail/payee/domain/nonce/job/
   amount/skill/ref kind; contradictory accepted result; reused Gateway UUID; foreign
   receipt and duplicate job rows. Fail closed with fixed diagnostics and no output.
7. Headerless probe/input/delist/lineage refusal before accounting IO; signed buyer
   mismatch before admission. Preserve absent-header root behavior and A/C/D/E
   tests; explicit nested session test exercises both holds and uncertainty.
8. Owned actual HTTP route fixtures: canonical method/path/token, query-token
   refusal, no-store failures, streamed body cap/deadline, restart with same secret,
   pending close refusal, calls array plus correct remaining, limits and sanitized
   malformed state. Await only owned listeners/children and prove cleanup.

No new tests were executed for these proposed invariants in this review. The only
executed F checks were the ten pure F4 cases and explicit nested TypeScript above.
No source, dependencies, private live state, keys or Git were modified. This private
note is ready for parent API decisions and bounded F5 release.
