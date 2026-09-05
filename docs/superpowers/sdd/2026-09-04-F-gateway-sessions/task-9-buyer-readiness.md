> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9/F10 buyer readiness — exact session authority and uncertainty

September 6, 2026. Planning only; this ignored note is the sole write. No source,
tests, generated output, dependency, Git, full suite, network, key, signing,
deposit or live action. G/H remain held. Parent reports F5 committed `8b8ebb2`;
F6–8 interfaces must freeze before the dependent F9/F10 source releases.

Read complete actual Tasks 9–10, F7 parent decisions/readiness, current buyer
index/fetch-with-payment/MCP/hire, F2 signer/replay code and review, F3 evidence,
F1 deposit runtime/report and installed Circle client's actual deposit method.
The proposed plan snippets are substantially stale: they send no session token,
trust unvalidated JSON, close on any response, omit injected fetch during call,
reset/ignore concurrency boundaries, claim one mined batch and retry SDK deposit.

## Smallest integration and fixed authority

F9 owns new buyer session module/tests plus narrow index/fetch-with-payment changes.
F10 then owns MCP tools/dispatch/tests over the frozen BuyerSession API. Preserve
existing sessionless behavior and F2 signed-request snapshots/Blob bounds/one-paid-
retry guard. No new global session in the SDK, imported hub Store, account provider,
remote registry, session query token, hidden deposit or automatic mutation retry.

Expose the useful `openSession`, `BuyerSession.call`, `close` names; add a bounded
read-only `status()` because F10 promises authoritative hub-side remaining budget.
Capture validated origin, account address/signer, requested budget bigint, selected
ready chain, fetch implementation and time/bound configuration once. BuyerSession
may expose immutable id/rail/network/buyer/budget; token stays only in its closure.
No token in enumerable properties, JSON, getters, errors, logs or MCP output.

- Origin is an exact HTTPS origin, or literal loopback HTTP origin, without
  credentials, path, query, fragment, whitespace or backslash ambiguity. Construct
  route paths from validated seller address/skill ID; reject target path injection.
  Never send session credentials to an ENS-resolved foreign hub. Either support
  same-origin ENS under existing independent ENS gates or refuse that session call
  explicitly; never downgrade it to sessionless payment.
- Capture canonical buyer identity and stable signer callback rather than continuing
  to read mutable caller fields. F2 locally recovers Gateway signatures; preserve
  that check and explicitly reject changed signer/account/network bindings. The
  caller's later mutation cannot change hub, rail, budget, fetch or authority.
- Input budgetUsd follows F7's canonical positive decimal-string grammar, at most
  six fractional places and exact uint256 atomic bound. No Number, exponent, sign,
  dollar-prefix, whitespace, string coercion or default zero. Parsing errors are
  fixed, never parsePrice's input-reflecting message. An omitted rail accepts only
  a validated built rail returned by the hub; a requested rail must match exactly.
- Opening validates exact HTTP 201 and the six F7 fields `session_id`,
  `session_token`, `rail`, `network`, `budget`, `note`. ID is ses_ plus 32 lowercase
  hex; token exactly 32 lowercase hex; rail a known literal; network the captured
  ready pinned chain; budget display parses exactly to the requested atomic budget.
  Reject missing/excess/malformed fields or mismatches. Do not trust/follow/fence
  arbitrary hub note text as instructions; produce local factual messaging.

F2 `paymentRequirementsKind` and `signGatewayAuthorization` currently re-read the
selected pinned config. F9 must check that it still agrees with the captured
session config before every signature, refusing drift rather than silently
selecting another network. No F2 signer rewrite or weaker custom domain selector.
The final gate must independently match session rail, network, resource, asset,
payee/seller policy and per-call cap before either signer runs. Gateway requires
GatewayWalletBatched; EIP requires the USDC domain. A test rail uses the existing
test simulation contract, not a claim that USDC-shaped metadata proves a real rail.
Preserve/combine the existing ENS beforeSign authority gate instead of replacing it.

## Both session headers across the entire private call

Use one validated session-context object internally, rather than adding a naked
sessionId option with an optional token. Reject partial/present-empty/duplicate or
conflicting headers and any simultaneous hire lineage before probe/signature.

| Request | Required scope |
| --- | --- |
| POST /sessions | No session credentials; one opening mutation |
| Actual-input unsigned quote and paid-call probe | x-arcade-session + x-session-token, same captured origin |
| Exactly one signed retry | Same two headers, exact F2-snapshotted request, one payment header |
| GET /jobs/:id/result polling | Same two session headers plus the separately validated job capability |
| GET session status / POST close | Canonical session token; include the ID header consistently if F7 permits it |

`callSkill` currently sends no headers when polling. Its same-origin exact-job-path
poll URL validation must remain. For the session path, extract the existing validated
job token from the returned query into x-job-token and use a query-free request;
current server already supports x-job-token. Never put the session token into any
URL. Never reflect the original capability-bearing poll URL in error.method.
All requests use redirect:error, credentials:omit, bounded bodies/deadlines and
owned cancellation. A injected fetch must be used for open, quote/probe/retry,
poll/status and close; the literal plan accidentally drops it from session.call.

MCP's actual-input `quoteAt` currently uses publicJson with no protected headers.
Session calls must quote the session rail with both headers, not the public default
rail or catalogue fallback. Keep advisory `arcade_quote` honest about which rail it
quoted; do not claim the session is affordable from an unrelated default challenge.

## Strict wire decoding and safe local failure channels

Session HTTP transport must validate status, content type/framing, byte limits,
fatal UTF-8 and closed JSON shapes under a total body deadline. No unbounded
response.json()/text(), unchecked Record cast or spread of remote result fields.
Reuse a bounded helper where appropriate; choose explicit limits sufficient for
100-call status/closed receipts and the frozen F8 terminal payload. Initial proposal:
16 KiB open/errors, 128 KiB status/close; reconcile terminal-output cap with F8's
actual bounded Job/Receipt envelope rather than truncating successful output.

- Status validates session ID/rail/network/budget against captured authority and
  exact dollar/atomic strings, <=100 calls, unique canonical job IDs, states,
  rail-specific references and arithmetic. Remaining = budget-spent-held. Pending
  calls contribute held; complete means held zero and does not imply closed.
  Never silently omit corrupt calls, trust a calls count, or substitute local zero.
  The approved optional `closed_receipt` is omitted for open sessions and carries
  the exact core closed-artifact JSON only when the same authoritative snapshot
  has persisted closedAtMs and is complete. Validate it with the closed decoder
  below and require agreement with the enclosing status; closed:boolean alone is
  not a recovered final artifact.
- Closed receipt converts exact decimal atomic strings to core SessionReceipt for
  its arithmetic/terminal/time/reference refinements, then projects exact JSON
  strings back if retaining SessionReceiptJson. Correlate sessionId, buyer, rail,
  network and budget with captured session. Require persisted closedAtMs, held zero,
  complete true and no pending call. Copy whitelisted objects/arrays independently.
- Current corrected F5 rejects duplicate settled-call references, including two
  jobs sharing a Gateway transfer. Do not deduplicate corruption into a valid-looking
  receipt. Gateway UUID/transfer, EIP hash/onchain and simulated test/0xtest remain
  distinct; gateway-batch is not an accepted current session completion.
- F8 result must correlate accepted job ID, session, skill/seller/buyer, rail/network,
  price and terminal evidence with this operation's local signed amount. Its final
  receipt shape is not frozen yet: specify one strict decoder after freeze, including
  whether priceAtomic and display price are both present. Preserve fencedResult as
  the model-facing result; raw seller output only goes to structured consumers.
- Existing fetchWithPayment/callSkill have input/provider/body-reflecting errors,
  and MCP's outer handleTool prints Error.message. Session-specific boundaries must
  translate all such failures/defects to fixed local codes with phase semantics,
  without changing unrelated legacy diagnostics opportunistically. Preserve
  interruption; never serialize raw Cause, token, buyer input or remote note/body.
  A small buyer-local discriminant distinguishing definitely unsigned from issued/
  uncertain is preferable to classifying payment safety by reflected prose. If
  exact phase is unavailable, conservatively keep the reservation.

## Lifecycle, close failure and read-only recovery

Each open/call/close operation claims its local attempt before its mutation/signing
boundary. Re-running the same Effect must not cause another POST or authorization;
separate explicit call() invocations are separate purchases. No Effect.retry around
open, paid POST or close. Only bounded reads/pending polls may retry, with no repeated
signing. A second 402 cannot request a second authorization. Request cancellation
does not revoke an issued authorization or prove that a hub mutation was absent.

Use an explicit local lifecycle: opening, open, closing, close-uncertain, closed.
Reject calls racing an in-progress/uncertain close before any new signature. Mark
closed only on a fully validated successful closed receipt or a matching validated
read-only `closed_receipt`; never mark it closed merely because JSON parsed. A validated pending
409 leaves the session usable subject to its held budget. A lost/invalid close
response keeps capability and uncertainty, never discards the session or silently
falls back to ordinary payment. An uncertain open without its response must not
auto-open a replacement; it created no payment authority but may have orphaned a row.

**Approved F7 read-only recovery contract:** authenticated GET status may include
`closed_receipt` only when its authoritative snapshot has persisted closedAtMs and
is complete. F7 derives it through F6.sessionReceipt from that same snapshot: no
additional read, write or fabricated time. The field contains exact core closed
artifact JSON, remains bounded to 100 calls, and is omitted for open sessions.
F9 retains the token on failed/uncertain close and may use bounded status reads to
recover and validate this artifact before marking closed. An unavailable/invalid
artifact keeps uncertainty; never automatically reopen, redeposit, retry close or
another mutation. Duplicate close stays 409 SessionClosed, not a recovery strategy.

## F10 MCP: one lifecycle and cumulative process ceiling

Current MCP already has spentAtomic, reservedAtomic and serializePurchase spanning
discovery through completion. Keep that mechanism and extend its lease to open and
close; a bare global `session` check followed by await allows concurrent opens to
orphan one. Latch opening/closing before IO and keep uncertain lifecycle state. No
tool accepts/returns tokens, private keys, account selectors or a capability override.
Use strict new argument schemas and fixed errors, not TreeFormatter dumps of private
values. Open/close are non-idempotent local state mutations; opening spends/escrows
nothing, closing submits/withdraws nothing. Remove the plan's one-batch promises.

- A session budget may not exceed current process budget minus settled spend and
  outstanding reservations. Opening does not spend it; existing settled spend is
  never reset on open/close. For each serialized call cap the signed amount by the
  minimum of caller cap, configured per-call cap, process remaining, and validated
  hub remaining. The hub still atomically decides admission; a stale quote grants
  no extra budget. If status is unavailable, fail closed instead of guessing.
- Route through the captured BuyerSession.call, not naked callSkillImpl plus ID.
  Preserve captured account/rail/network and both headers. Keep local reservation
  before signing and retain it on post-sign transport/result uncertainty. Track
  known job/operation accounting to avoid incrementing spend again during status/
  close reconciliation; never add final receipt.spentAtomic a second time.
- A matching terminal hub release can describe local ledger release, but cannot
  cryptographically revoke an issued authorization. Existing MCP intentionally
  retains any issued but unconfirmed authorization. Do not silently weaken that
  cumulative rule because session status reports released or closed. Keep separate
  labels for hub held/remaining and local authorized-exposure reservations; local
  conservation remains unless independently correlated evidence resolves it under
  an approved policy. Unknown outcomes must not become "you were not charged."
- arcade_budget reports validated hub status alongside process spent/reserved/
  remaining. Wallet on-chain USDC is distinct from Gateway available/pending funds
  and local session budget. Unavailable balances/status remain unavailable. Closing
  retains unresolved local exposures, even if a valid hub closed receipt is returned.
- Do not reset queues/counters/session via production tools or on lifecycle errors.
  Existing __resetBudget/new dependency seams are test-only and must not abandon
  active test leases. After an explicit successful close, later intentional calls
  may use the ordinary path with the same cumulative process ceiling; no automatic
  fallback/replay of the failed session operation occurs.
- Keep seller-funded hire isolation: no session capability in hire.ts, runner
  environment, sandbox, broker payload or child callSkill. Parent root session and
  seller sub-hire retain independent payers and ceilings. Reject session+lineage
  client-side before requests; F8 independently enforces the same restriction.

## Deposit helper: explicit separate scope decision

Never call ensureGatewayDeposit from openSession, session.call, close or MCP open.
The literal five-attempt client.deposit loop is unsafe even if rate-limit text is
detected: installed Circle 3.2.0 deposit sends approve/deposit and then calls
waitForTransactionReceipt (dist/client/index.js:922–963). An error can arrive after
mutation. It also deposits the entire requested minimum, not the shortfall, and a
fixed four-second sleep does not prove exact credit. It conflicts with repository
receipt-polling rules and the already accepted F1 correction.

F1's actual approved evidence is one explicit 0.5 USDC deposit and one 0.001 payment,
with durable intent/hash journaling before sends and bounded read-only reconciliation.
Buyer available became 499000 atomic; recipient remained 1000 pending/0 available.
No automatic deposit/verify/settle retry, mined-batch promise or reusable spending
authority follows. F3 proves local verification/accepted-transfer handling; delayed
live acceptance after runner work and eventual batch/credit remain separate evidence.

Recommended smallest F9 release: keep session SDK funding-independent and defer
the convenience deposit helper to the explicit F11 deposit/withdraw boundary.
Record this as a parent-approved task split, not a stub success or complete F9
funding implementation. If parent insists on the F9 helper, release a separate
bounded adapter: exact pinned chain/asset/wallet/account, canonical decimal minimum,
validated available balance, exact positive shortfall, bounded gas and required
allowance only, durable one-shot attempt ownership/intent/hash records, one send
per mutation, and receipt/balance reads only after uncertain submission. It needs
its own failure/crash/concurrent-invocation tests. F1 runtime is fixed-gate/keychain/
journal scoped and must not simply be imported into the public SDK or broadened to
reuse its consumed approval. No raw privateKey in MCP/tool args or API errors.

## Intended focused coverage and handoff

After F7/F8 freeze and explicit source release, genuine behavioral tests should
cover strict open/status/close decode and mismatches, >2^53/uint256 money, all header
phases including actual-input quote and repeated result polls, foreign origin/ENS/
redirect and lineage refusal before signing, mutable caller/headers/account drift,
one signature/retry with actual F2 recovery, uncooperative bounded response cleanup,
malicious note/error/token sentinels, issued-versus-unsigned failure distinction,
pending/lost/invalid close and no duplicate mutation, duplicate-reference rejection,
MCP concurrent open/call/close races, unchanged process ceiling across sessions,
no double-count on reconciliation and no implicit funding/hire inheritance.

Use existing Vitest/Bun fixtures and injection seams with public dummy accounts,
not real credentials or remote calls. Existing F2 replay/ENS/hire/MCP budget tests
remain intact. Root compiler options must include every new nested test and exact
wire decoder. Parent owns full gates/commits; no tests were run for this readiness.
Task 12 is normal live evidence and Task 13 conditional fallback per current F7
decision. Neither may spend here; F1 authority is consumed.
