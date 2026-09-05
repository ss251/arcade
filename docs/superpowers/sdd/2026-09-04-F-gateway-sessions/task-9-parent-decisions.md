> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9/F10 parent decisions — September 6, 2026

## Active-session quote refinement — 02:58 IST

Within the same F9 eight paths, approve BuyerSession.quote and Promise quote.
Arguments are seller (serviceName URL segment), skillId, input and optional
maxWaitMs; Promise options add optional AbortSignal. Return frozen priceAtomic,
rail, network, serviceName, skillId, skillVersion and canonical listing seller
wallet. It uses captured origin/identity, bounded listing validation and the
actual-input challenge with both private session headers. No signer entry,
reservation/debit, capability output or metadata/default-rail price fallback.
Unavailable/invalid/closed operations fail with fixed diagnostics. Every later
call performs its own fresh actual-input probe; quotes are not signing authority.
This supports explicit F10 arcade_quote while preserving session token privacy.
No extra source file or funding/live authority follows from this refinement.

Parent accepts the complete task9-buyer-readiness.md (SHA-256
2dc2df3a82d19bdb77bfacbe52342cd8685279daeef0aa5658b724063994d46c)
subject to the frozen F7/F8 implementation interfaces. Source remains held until
their reviewed commits. These decisions supersede unsafe literal plan snippets,
not the task's intended buyer session and MCP capabilities.

## Funding-independent SDK and captured authority

Approve moving ensureGatewayDeposit from F9 to the explicit F11 funding boundary.
F9 is not represented as implementing funding. Open, call, close and all MCP tools
must never deposit or withdraw implicitly. F1's one-shot authority is consumed;
no live execution or credential access follows from any local implementation.

Capture validated origin, signer/account identity, selected ready pinned chain,
budget, rail and injected fetch once; retain the session capability only in a
closure. Validate exact F7 wire shapes and canonical decimal amounts. Session
operations cannot silently fall back to sessionless payment or foreign ENS hubs.
Either preserve an independently gated same-origin ENS path or explicitly refuse
that session operation before signing. Preserve F2 request snapshots, signer
recovery, one signed retry, and the existing ENS beforeSign gate. Recheck captured
chain agreement and exact requirements before every signature.

Use the validated dual-header session context on actual-input quote, unsigned
probe, signed retry, and result polling. Poll with the separate job capability in
its header and query-free validated same-origin job URL. No session-plus-hire
lineage, redirects, credential inheritance, runner/child capability or raw remote
errors. Reuse bounded transport primitives where compatible; choose explicit
response bounds after the real F8 wire shape freezes, not an arbitrary output
truncation. Every phase must use the captured injected fetch.

## Lifecycle and uncertainty

Expose bounded read-only status() as well as openSession/call/close. Validate
snapshot arithmetic, call/reference uniqueness and exact captured authority.
Closed receipt validation uses the actual core closed-artifact contract and
correlates buyer, session, rail, network and budget; never synthesize timestamps
or deduplicate corrupt references.

Claim each operation's local attempt before its mutation/signing boundary so
rerunning the same Effect cannot authorize another purchase. Separate explicit
call() invocations remain separate purchases. No automatic open, paid POST or
close retries. Preserve original interruption while retaining conservative issued
exposure if a cancellation or failure arrives after signing.

F8's fixed session_settlement_uncertain 503 is reconciliation-required, not a
nonpayment result. Reserved/settling 202 remains pending. A lost/invalid close
retains its token and blocks new calls. Recover only via F7's authenticated GET
closed_receipt from the same persisted closed snapshot, not duplicate close.
A fully validated pending 409 can leave the client open. An uncertain open must
not auto-create a replacement. Never claim an issued authorization was revoked
by local cancellation or a hub release.

## MCP cumulative ceiling

Preserve and extend serializePurchase to cover lifecycle operations. Latch
opening/closing before IO and prevent concurrent orphan opens. Keep settled spend
and issued-but-unconfirmed exposure across open/close; session budget is a second
ceiling, not a reset of the existing process ceiling. Cap each signature by caller
cap, configured per-call cap, process remaining and validated hub remaining.
Unavailable status fails closed. Actual-input quotes must use the session rail
and both headers. Route through the captured BuyerSession, not a naked session ID.

Correlate each operation/job once when reconciling; never add final receipt totals
again. A released/closed hub ledger alone does not revoke an issued authorization
or clear existing conservative local exposure. Report hub held/remaining and local
authorized exposure distinctly, and distinguish wallet USDC from Gateway available
or pending credit. No fabricated zero for unavailable data. After a successfully
closed session, later intentional ordinary calls may use the original cumulative
ceiling, but no failed session operation is silently replayed on that path.

## Verification and release

Keep F9 and F10 separate atomic steps. Genuine behavioral Reds must cover the
readiness matrix, especially authority mutation, dual headers on all phases,
strict wire mismatch, interruption/issued uncertainty, repeated Effect execution,
lost-close read-only recovery and MCP lifecycle/concurrency/exposure conservation.
No generic legacy diagnostic rewrite, dependency upgrade or new external action.
Parent owns independent review, full repository tests/types and commits. F11 owns
its separate journaled funding safety design; F12 live evidence is unavailable
under the current no-new-spending instruction, not a reason to run F13 fallback.

## F8 capability contract accepted after independent legacy-route review

Session job tokens are an opaque, distinct arcade-session-job HMAC realm, not the
ordinary job token. F9 owns session polling with x-arcade-session, x-session-token and
x-job-token on an exact-origin token-free result URL; reject token query material.
Do not delegate to current ordinary callSkill polling, which ignores job_token,
and never silently fall back to a headerless ordinary route. F10 consumes this
captured BuyerSession contract. F8 authenticates both capabilities before Store IO
and proves session membership before returning persisted settled output. Released
Jobs can legally retain output internally, so neither release nor ordinary job
status is an alternate output channel. No new client retry or issuer migration.

## Independent SDK/MCP readiness findings accepted

Parent fully read task9-independent-readiness-review (SHA-256
3651c602bcf7f2020033dbb3a1a208c02567b6c7597374fa75a2324faae2a576).
Its findings are source composition, not executed runtime Reds. Accept both.

F9 BuyerSession itself needs a private captured-budget/issued-exposure ledger,
not only MCP's process counters. Reserve before signer invocation and retain
signer-entered but unresolved authority even if the signed POST is lost before
hub admission. Cap later signatures by captured budget/exposure AND validated
hub remaining. Correlate operation/job/amount/terminal reference exactly once;
known overlap must not be counted twice, and unknown overlap must never enlarge
capacity. Hub absence, release or close cannot revoke an issued authorization.
No exported reset, global session, implicit retry or wallet-wide guarantee.

F10 propagates installed MCP handler extra.signal through queue/lifecycle/session
operations and into Effect.runPromise. Check abort before joining and immediately
after acquiring the queue lease. A cancelled middle waiter cannot run later or
release its successor ahead of the active predecessor. Actual MCP cancellation
and disconnect tests must prove no later signing, plus conservative exposure if
signer entry already occurred. Do not reflect signal.reason in public errors.

Carry all six reviewed implementation checks into tests: operation attempt state
allocated outside Effect evaluation; snapshot before awaiting; abort/deadline guards
before signer and paid forwarding (a late signer cannot restart work); exact new
three-header polling with an overall elapsed deadline; locally observed signing
provenance and strict correlated paid response before output; and captured public
identity for read-only status/budget/close without a fresh key retrieval. A test
rail label does not make a real EIP-style signer exposure-free. Uncertain503 is
reconciliation-required, not another pending poll or a paid resubmission.

## Frozen F8 wire and trusted listing coordinates

F8 author report0afc09de4d72b24f5e555ebd059b9404285328a598dac4eb4a2509e8296dce9c
freezes the exact accepted/pending/uncertain/released/settled shapes and error
codes. Parent full F8 gate passed2529Vitest119/409Bun4170assert36/rootwebstrict0;
independent final router/publication review and commit still precede F9 source.
The new result reads an actual selected validated Job/Receipt pair, not a receipt
followed by global Job lookup. No query capability fallback is accepted.

Existing buyer argument seller names the URL service segment, not necessarily a
wallet address. F8 requires that segment equal listing.serviceName. Preserve
compatible naming or explicitly name serviceName, with bounded canonical segment
validation; do not require a wallet-shaped URL segment and break real listings.

Parent re-read current public GET/listings/:id: it provides seller wallet,
service/id/version/price, but no splitter coordinates/fee. Approve a bounded
same-origin listing read and narrow metadata projection before signing. Bind its
exact service/id/version/seller/price to challenge and eventual terminal evidence.
Ignore public stats/evidence metadata as authority/instructions; do not retain an
unbounded public response. Direct Gateway/Test/EIP challenge payTo equals listing
seller. EIP splitter requires exact challenge payTo===extra.feeSplitter, known
version, pinned USDC domain and accepted/challenged agreement. No new RPC or hub
schema field. Splitter ownership and fee remain trusted hub handshake assertions,
NOT independently verified pre-sign by this SDK. Correlated terminal seller and
fee arithmetic cannot retroactively prove independent pre-sign fee authorization.
Preserve any existing ENS beforeSign gate rather than weakening it for splitters.

## Final source handoff acceptance

Parent fully read the212-line task9-source-handoff at
472df04aa4b580a5347bccd6c7f79c2f3e08da0d4412239806b3f3873a9ecff4.
Approve its exact eight source/test paths, finite transport bounds, actual root/
subpath/Promise/native loopback test matrix and explicit first-lane refusal of
session ENS/name or hire lineage before IO/signing. Ordinary ENS/hire behavior
stays unchanged. ServiceName uses the existing32-character grammar. No change to
shared fetch-with-payment.ts: use exported actual F2 signer/domain/encoding code,
and a separate own-data JSON snapshot/one-paid-retry session transport. Existing
Blob/general request behavior is preserved, not claimed reused by that JSON lane.

Approve additive openSessionPromise with a frozen capability-private Promise
facade for call/status/close. Each method runs its one issued Effect once; explicit
AbortSignal goes into that computation and original tagged errors are preserved
using the existing Promise-boundary pattern. No implicit cleanup close/open,
deposit, resumption or retry. Test actual package imports without assuming caller
scripts share the SDK's Effect runtime. Keep the session's monotonic issued total
bounded before signer entry; confirmed/unresolved are classifications of it, not
extra debits. Freeze initial public API with the genuine-Red checkpoint before
F10 consumes it. Implementation release follows F8's reviewed atomic commit.

F8 committed1953256 with exact30reviewedpaths (13source/test,17publicSDD); all
source/public reviews and fullgate passed. F9 is now released. To parallelize the
same eight paths, G14 owns session.ts/session-wire.ts/session.test.ts and additive
index.ts/promise-api.test.ts. B9 exclusively owns session-http.ts/session.bun.test.ts/
fixtures/session-runtime.ts. No scope expansion. Root takes F10 preparation;
G3's already grounded F11 preparation precedes its independent F9 review.

Fix the internal transport API together: sessionRequest(fetch,url,init,
{signal,deadlineMs,maxBytes}) -> Promise<{status,body:unknown}>. Absolute monotonic
deadline; five-second whole request/body bound capped by remaining overall time;
fixed local failures, no signal.reason/provider prose. Prefer the trusted own
GET/POST header/stable-string-body subset needed by this SDK, not a new general
Blob/stream payment surface. No redirects, credentials inheritance or retry.
Native transport tests are separate from actual root/subpath/Promise/production
hub-facade integration, which B9 owns after G14's public API is available.
