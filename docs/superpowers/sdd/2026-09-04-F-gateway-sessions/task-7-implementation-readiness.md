> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F7 route readiness — private, header-authenticated session surface

Prepared September 6, 2026 (Asia/Kolkata). Readiness only: no source, collected
tests, dependency, Git, provider, key, RPC or live action. H7 remains held.
Read complete Plan F Task 7 (1493–1754), Task 8 (1755–2025), global constraints,
task5-parent-decisions.md, task6-parent-decisions.md and the complete F6 readiness;
checked current F4 boot/registry, server tokens/paid route/public feeds, money,
frozen corrected F5 schemas, SessionStore and transition semantics. Used the
ts-testing skill to propose real behavioral coverage, not assertion-only examples.

## Smallest release and dependencies

- New apps/hub/src/server-sessions.ts: import-safe bounded route factory/handler,
  explicit configured dependencies, fixed JSON projection and errors. Preserve
  handleSessionRoute's name; adapt arguments to the actual frozen F6 service.
- apps/hub/src/server.ts: instantiate once with the existing secret/registry/chain
  snapshot and mount before the paid branch. No second Store, registry, provider,
  facilitator, accounting map or session secret. No paid-path change in F7.
- New apps/hub/test/session-endpoints.test.ts plus an actual-production-router
  session-endpoints.bun.test.ts and one narrow owned preload fixture as needed.
- Before emitting session receipts, narrowly exclude sessionId in existing
  apps/hub/src/receipts-feed.ts and regress in receipts-feed.test.ts plus HTTP.
  Do not bring H1 forward or rewrite its future whitelist in this task.
- Canonical ASCII token comparison can stay in the new helper. If sharing it with
  existing jobTokenOk, release that narrow server guard/test explicitly; no need
  to add Node crypto to core or export a test-only empty Store helper. Existing
  emptyStateForTests is already available in current store.ts.

F6 does not yet have frozen exports. Its reviewed proposal is
makeSessions({store, rails, chain, newId?}), with openSession, snapshot,
closeSession and sessionReceipt; coordinate exact signatures after F6 freeze.
The actual frozen Store offers getSessionSnapshot and atomic closeSession(id,time),
not putSession or a receipts-based close. F7 must not bypass this service/ledger.

## Endpoint contract and minimum policy

1. POST /sessions stays unauthenticated: opening declares a local budget and does
   not deposit, sign, verify payment, execute, settle or promise funding. Require a
   closed JSON object containing buyer, budgetUsd and optional rail only. Normalize
   a syntactically valid nonzero 20-byte buyer to lowercase. Proposed explicit
   boundary: budgetUsd is a bounded canonical decimal STRING (whole digits, optional
   1–6 fractional digits, no sign/exponent/$/whitespace/leading-zero ambiguity),
   converted exactly to positive uint256 atomic units. Do not String/coerce numbers,
   null, objects or arrays; parsePrice errors contain input and must never escape.
   This string-only restriction is an explicit new boundary for F9/F10, not a claim
   that the literal F7 implementation already enforced it.
2. Resolve an omitted rail to the exact built F4 default; a present value must be
   a known literal and actually built. No prototype lookup, environment fallback,
   support RPC or provider construction. Network comes from the same trusted ready
   chain used to build Rails, never request data or hardcoded ARC_CAIP2.
3. Return the planned 201 fields session_id, session_token, rail, network, budget,
   note (the literal code actually lists these six names). Token is issued only
   in this private response. The note says local budget only; Gateway requires an
   independently funded Gateway balance and references accepted transfers, not one
   mined batch/withdrawable credit; test is simulated; EIP calls settle separately.
4. GET /sessions/:id requires canonical /^ses_[0-9a-f]{32}$/ and ONLY a canonical
   32-lowercase-hex x-session-token. HMAC domain separation stays
   arcade-session:<id>, separate from arcade-job:<id>. Reject malformed/non-ASCII,
   duplicate/comma-joined headers and query-token attempts before ANY Store IO.
   No cookies, Authorization fallback, token query parsing or URL echo. Status,
   close and malformed /sessions namespace methods/routes all use private,no-store.
5. Missing/wrong/foreign token and unknown valid ID have the same fixed 404 body.
   Only after authentication read one selected authoritative snapshot. Expose
   session_id, rail, network, budget, spent, held, remaining, calls, complete, closed.
   Money display fields use exact formatPrice; each call.priceAtomic is an exact
   decimal string, never Number. calls is the bounded array, not its length;
   remaining = budget - spent - held. Preserve reserved/settling/uncertain states.
   This is a read only: no rail lookup needed merely to read retained evidence,
   no release/retry/close/verification, and no global allReceipts/allSessions scan.
6. POST /sessions/:id/close authenticates first, then accepts only empty body or
   empty JSON object under the same bounds, captures one valid time, and invokes
   atomic F6 close once. Return the core closed SessionReceipt with bigint fields
   serialized as decimal strings and persisted close time. Pending/uncertain holds
   => 409 session_pending; repeat close => 409 session_closed, never rewrite time.
   Closing only freezes local accounting; no withdrawal, submission or batch close.
7. Explicit error mapping, never spreading tagged errors: input_invalid 400,
   session_not_found 404, session_rail_unavailable/session_pending/session_closed
   409, capacity as a fixed bounded refusal (propose 429 session_capacity), and
   storage/defect as 503 session_unavailable. No IDs, buyer, budget, token, request,
   SQL path, exception Cause or provider text in errors. Authenticated successful
   calls/closed receipt retain their planned private job IDs; public surfaces do not.

Proposed HTTP limits for parent approval: 16 KiB UTF-8 bodies, 5s complete body
deadline and at most 32 active session handlers (fixed overload refusal). Validate
Content-Type JSON for nonempty bodies, finite Content-Length if present, exact
declared/observed bytes and actual streamed bytes when absent; fatal UTF-8 decode.
Stop/cancel an owned body read on abort/deadline and prevent any late parser/store
mutation. These are new session HTTP limits, not existing paid-request guarantees.
No generic server middleware/body refactor. F5 already limits 100 lifetime calls,
10,000 retained sessions, row bytes and a 1s SQLite busy timeout. Request timeout
cannot undo/prove absence of a completed synchronous atomic transaction; never
retry a write to compensate for a lost response. Status remains the recovery path
for a caller retaining its capability; lost open responses are not auto-recreated.

## Backend, secret and privacy facts in this base

- Current server preflight checks secret/DB mainly for public deployment; loopback
  may boot with random per-process hubSecret and volatile Store. F7 must explicitly
  require a nonempty, bounded configured stable ARCADE_HUB_SECRET AND actual
  store.sessionStorage === durable before creating/enabling real paid sessions.
  Do not infer durability from an ARCADE_DB string (:memory: is volatile). An
  unavailable real-session feature must not prevent unrelated test sessions.
  Stability across restarts is an operator obligation, not something value length
  proves. Reuse the captured secret, never reload it per request; never print it.
- Keep secret/config admission checks distinct from authenticated historical reads
  and terminal evidence recording; configuration changes cannot erase an existing
  hold or authorize an uncertain release. F6 already owns backend defense in depth.
- Current FROOT receipts-feed.ts spreads ...rest, so the new sessionId WOULD leak
  if receipts were emitted now. Capture a real failing fixture with sessionId before
  a narrow exclusion. Preserve all existing A/C/D/E public fields/privacy; later H1
  whitelist remains the canonical integration. No raw IDs in public feed/HTML/new
  discovery metadata/log diagnostics; no session list endpoint is proposed.
- Current FROOT jobTokenOk compares JS string length then Buffer length indirectly;
  32 non-ASCII characters can throw in timingSafeEqual. H3's fix is not here yet.
  Canonical regex before comparison avoids this in sessions; shared fix should have
  an actual existing /jobs regression and preserve normal job token behavior.

## F8 handoff — do not implement literal best-effort accounting

Preserve A's paid check order: listing/input, C delisting, session gate, lineage,
challenge/verify. Parent explicitly APPROVED: require canonical x-session-token
with x-arcade-session on BOTH initial 402 probes and paid retries; authenticate
canonical ID/token in constant time before any session Store IO. Missing, wrong,
malformed or Unicode values share the fixed private,no-store not-found response.
Present-but-empty headers cannot silently fall back to sessionless behavior.
The literal F8 ID-only resolver distinguishes missing/closed/rail state and would
bypass this boundary. This is an explicit parent-approved privacy adaptation;
F9/F10 must forward both headers with protected capability storage, never queries.
A token never substitutes for the separately
recovered payer matching the stored buyer. Never accept a session ID from JSON or
query. A request combining a session with non-root hire capability must refuse
before challenge/admission; seller-funded sub-hires keep their own sessionless
funding and must not inherit buyer session credentials.

F8 must use the session's rail for challenge AND verify AND settlement; preserve
actual listing seller/splitter/payee and trusted domain/network/asset bindings.
Probe causes no job or budget write. After verification, build the full canonical
SessionBinding with exact nonce/time/input digest/version and atomically reserve
with the queued root Job. Use returned ORIGINAL jobId: created:false means no new
dispatch. Never call legacy putJob/putReceipt for session-owned rows (F5 forbids it).
Prevalidate predictable bounded terminal shapes before one-shot begin. Invoke the
rail only after durable claimed:true, containing synchronous throws. Publish output
only after correlated atomic finish accepted by the ledger. Definite pre-barrier
nonsettlement can release; post-barrier error/timeout/interruption/unknown keeps
the full hold (settling/uncertain), no output, resend, expiry release or compensation.
Current pipeline catches rail failure as settled:false; that is unsafe for this
new branch. No literal post-receipt Effect.tap(commit) or catchAllCause(release).

Gateway terminal kind is gateway-transfer with canonical UUID, test is actual
0xtest simulation, EIP is onchain hash; gateway-batch has no current accepted
completion. Reference shape/category is not independent mining/balance proof.
Private status is authoritative local accounting, not a remote reconciliation
service. F8 poll uncertainty must not reuse current blanket 'you were not charged'
copy; no fake terminal receipt or raw diagnostics to force a terminal poll result.
Sessionless paid paths, canaries, A lineage and best-effort D/E side effects stay
otherwise unchanged. Root owns the later integration/full gates.

## Failure-first behavioral test matrix after release

- Missing handler/import and actual POST /sessions 404 give genuine initial Reds;
  actual production server fixture, not a duplicate test router. No source changed
  merely to manufacture failures. Existing correct cases are labeled coverage.
- Open validates closed data, nonzero/case-normalized buyer, exact minimum/uint256
  boundary/>2^53 money, number/exponent/overprecision/null/array/excess/reflected
  private input, unavailable/prototype rail; zero writes/calls on rejection.
- Empty/oversize/lying-length/chunked/stalled/invalid-UTF8 bodies, external abort,
  late uncooperative body and active limit prove finite cleanup/no late writes.
- Every session response (201/200/400/404/409/429/503, malformed paths and methods)
  is private,no-store. Wrong/missing/Unicode/uppercase/foreign/query/duplicate
  tokens have identical 404 and zero Store IO; token A cannot read/close B.
- Real memory Store + real RailTest produce root session reserved/settling/
  uncertain/released/settled snapshots; >2^53 exact arithmetic, held-subtracted
  remaining, calls array and real test references. No fake committed receipt.
- Close all pending states refuses unchanged; successful closed artifact uses
  actual persisted time; repeated/concurrent close cannot overwrite it. Unknown
  valid ID is 404; no read path touches rails, allReceipts or accounting mutations.
- Real sessions refuse volatile backend or missing stable secret even on loopback;
  test route remains available. Fresh owned disk DB + same secret across exact
  child restart preserves token/status/closed artifact; wrong secret fails 404.
  Two handles observe current holds. Do not call this remote durability proof.
- A one-shot Store typed error, synchronous throw and Effect.die return fixed503,
  leak no sentinel bytes and perform no compensating writes; healthy next request
  recovers. Aborted read remains cancellation; no detached mutation retry.
- PublicReceipt unit Red plus actual tokenless /receipts bytes exclude sessionId,
  job/buyer/nonce/root/parent/child IDs while preserving existing allowed evidence.
  Existing /jobs non-ASCII guard regression only if that shared edit is released.
- F8 later: actual selected-rail probes, verified foreign payer, semantic retry,
  cross-session nonce race, pending close, runner failure before barrier vs timeout
  after barrier, duplicate finish and restart; assert dispatch/settle once and
  held/spent/remaining/no-output, not the plan's tautological address comparison.

Use existing Vitest and focused Bun actual-router fixtures. Children get explicit
allowlisted env, --no-env-file, fixed dummy credentials only when required,
owned ephemeral loopback ports/DB and no external fetch/preconnect. Await stream
drains and owned TERM-to-KILL reaping; verify listener refusal after close. Exact
root TS options must explicitly include nested new tests; root tsc alone excludes
them. Parent owns full gates/commits. No tests were run for this readiness note.
