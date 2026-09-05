> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 independent readiness review

September 6, 2026 (Asia/Kolkata). Read-only audit; this ignored note is the sole
write. No source/test/generated/Git/full-suite/network/key/live action. G3 remains
held. Read F6 parent decisions and complete implementation readiness, literal F6
and F7 interface, current F5 kernel/Store/SQLite transaction contracts, core session
schemas/errors/receipt, F4 Rails, payment result types and public receipt projector.
This is facade readiness, not an F6 implementation PASS or a repeated F5 gate.

The proposed thin factory is suitable for release after the parent's F5 commit.
The actual kernel, Store, SQLite, core session and Receipt SHA256 values match the
five frozen source entries in `task-5-reference-correction.md`. No F5
source change is needed for the facade. The concrete clarifications below should
be included in F6's release/tests.

## Exact API and admission boundaries

- Import `SessionStore`, `SessionBinding`, `SessionTerminal`, `SessionSnapshot`
  from `apps/hub/src/session-ledger.ts`; `Store` extends SessionStore. Actual Rails
  lives in `apps/hub/src/rails.ts`, with `default: Rail`, `get(name)` and `names`.
  There is no defaultName, amount-based reserve/commit, synchronous in-flight getter,
  or Store.putSession. Preserve Store results `{created, jobId}` and `{claimed}`.
- `commit` should take only the settled SessionTerminal variant; `release` only
  the released variant, with matching runtime checks. Both delegate the complete
  terminal unchanged to `finishSessionJob`. A wrapper that forces a supplied
  object's kind to released/settled would hide caller misuse and cross the boundary.
  Never replace canonical binding fields or normalize actual settlement evidence.
- `beginSessionSettlement` takes only session/job IDs. Therefore the approved
  volatile-backend guard requires an authoritative `getSessionSnapshot`/`getSession`
  read to learn that session's rail before the single atomic begin. The readiness
  note's literal "one begin delegation" needs this narrow read allowance. Check
  only immutable identity/rail here; F5 owns current hold/budget/barrier authority.
  Validate the returned session ID against the requested ID for adversarial Store
  fixtures. Read/guard failure must not invoke begin or any compensating write.
- Opening resolves the requested built rail, or the actual configured default,
  before applying `sessionStorage !== durable && selectedRail !== test`. The mere
  presence of a real rail must not disable a separately selected test rail. Reserve
  similarly rejects newly admitted real work on volatile storage. Do not apply that
  admission guard to finish, markUncertain, or terminal read/close reconciliation:
  durable evidence must still be recorded if settlement was already attempted.
- Treat the supplied chain as explicit trusted assembly configuration, and keep
  readiness/network agreement with the pinned config; do not use ambient
  `loadChainConfig()` defaults or treat a caller's `status: ready` as chain proof.
  F5 independently checks ready supported CAIP-2/rail combinations. Rail has no
  chain property; F6 cannot infer provider-network consistency from its name.

## Wrapper input and failure-channel risks

- F5 deliberately normalizes bounded own-data before reading routing fields
  (`normalizeSessionCommand`, session-ledger.ts:245). A new F6 `binding.rail`,
  `buyer.toLowerCase()`, object spread or schema decode before that boundary can
  invoke accessors, or silently discard forbidden extra fields that F5 would
  reject. Keep malformed input rejection before mutation; use bounded own-data
  validation/copy when the facade must inspect fields, preserving the existing
  limits. Do not recreate the ledger algorithm. Include getters, extra fields,
  invalid IDs and noncanonical injected IDs in the facade tests.
- `Effect.suspend(() => store.method(...))` makes synchronous invocation defects
  observable but does not by itself turn them into a typed failure. A catchAll-only
  wrapper misses defects; an unconditional catchAllCause can erase interruption.
  Preserve interruption as interruption, preserve approved SessionError instances,
  and map unexpected non-interruption Store failures/defects to fixed
  SessionStorageUnavailable. No retry, timeout release, cause serialization, SQL,
  provider prose, authorization data or compensating mutation belongs here.
- Reject malformed/unbounded rail strings before putting them in
  SessionRailUnavailable. That error has a string payload; passing an arbitrary
  user string through it is not automatically a fixed safe diagnostic. Known but
  unbuilt rail names can retain their specific typed unavailable error. F7 must
  still expose a fixed public error code rather than serialize SessionError fields.
- F5 adapters wrap synchronous transactions in `Effect.uninterruptible` (store.ts:
  245). An interrupted caller is not proof that a committed operation did not happen.
  F6 must not turn interruption into successful release or silently re-execute begin.
  A begin result lost after commit leaves the hold; no second permit is issued.
- Preserve semantic retry results before higher-level closed-session policy.
  F5 permits an identical previously claimed authorization to return its original
  job ID even after closure; it checks that retry before rejecting a new admission.
  An eager F6 closed/complete check would change the approved retry contract.
  Repeated begin on settling/uncertain/settled is claimed:false; released is conflict.

## Snapshot and receipt projection risks

- `SessionSnapshot.complete` is exactly `heldAtomic === 0n` (session-ledger.ts:234), and can
  be true for a newly opened session. A closed artifact additionally requires actual
  persisted `session.closedAtMs`. Neither complete alone, no calls, nor a default
  current time can close it. Core SessionReceipt now enforces held zero, terminal
  calls, exact sums/counts, time bounds, unique jobs and rail-compatible references.
- Actual `closeSession` atomically returns its committed snapshot. A duplicate
  close throws SessionClosed with persisted closedAtMs (session-ledger.ts:293); it does not
  return an idempotent receipt. Preserve that error, with snapshot projection as a
  separate read operation if needed later. Never issue a second read to assemble
  the successful close artifact or overwrite close time on a retry.
- Return calls as the bounded authoritative array, not a count or a join against
  allReceipts. Remaining is budget minus spent minus held. Keep exact bigint values,
  including above 2^53, and every reserved/settling/uncertain state visible in status.
  Projection should whitelist Session/SessionCall fields and return fresh objects
  and arrays. Do not spread a Receipt/binding into a status or expose nonce, input,
  authorization, private diagnostics or extra Store fixture fields.
- Frozen F5 changed the old reference assumptions: test rail uses kind `test` with
  `0xtest...`; EIP uses nonzero lowercase hash/onchain; Gateway requires explicit
  gateway-transfer/canonical UUID. SettledPayment's optional kind does not include
  test: leave an actual TestRail result unchanged and let F5 perform its approved
  missing-kind normalization. Do not reinterpret it as onchain or cast in a new kind.
- The current kernel rejects reused settlement references across distinct jobs in
  the same network/rail; core SessionReceipt also rejects duplicate settled-call
  references. Therefore the plan's two jobs sharing `0xbatch` is invalid. Listing
  distinct references is a projection, not permission to repair corrupt duplicates
  or claim multiple accepted transfers became one mined/withdrawable batch.
- FROOT's actual publicReceipt still rest-spreads Receipt (receipts-feed.ts:26–38),
  which would leak optional sessionId. This is the already recorded pre-F7/F8
  projection gate, not F6 source scope. Keep it explicitly pending and preserve the
  later H1 whitelist/H4 honest reference-link semantics; do not move H ahead of F.

Recommended focused additions to the existing F6 proposed test list: complete but
open refusal; duplicate-close typed behavior; accepted semantic retry after close;
volatile begin with stored real rail versus selectable test rail; finish/uncertain
delegation despite volatile backend; getter/extra-field rejection; interruption
without retry/release; exact real-TestRail category; duplicate-reference refusal;
deep-copy projection independence. These tests were not executed in this audit.

No new release, deployment or spending authority is inferred. Parent owns F5
gate/commit and F6 source release; F1 authority remains consumed.
