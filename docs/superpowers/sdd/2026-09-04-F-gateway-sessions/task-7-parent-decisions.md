> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F7 parent readiness decisions — September 6, 2026

Parent read the full actual F7/F8 plan, current server/rail/token/public projection
contracts and complete task7-readiness.md. Approve the bounded import-safe route
module, narrow server wiring and behavioral unit/actual-router test ownership.
F7 source waits for F6 reviewed commit. Do not add a second accounting service,
provider, registry, public session-list endpoint or dependency.

Adopt the proposed 16 KiB UTF-8 body, 5-second full-read deadline and 32 active
session-handler bounds with fixed 429 capacity refusal. Reject invalid/lying
length, invalid UTF-8, trailing/excess data and stalled/aborted reads before any
write; cancellation must prevent late mutation. A timed-out response does not
undo an already committed synchronous write and never permits automatic retry.

Adopt canonical positive decimal-string budgetUsd with at most six decimal places,
bounded by exact uint256 atomic units; no numeric coercion, exponent, sign, dollar
prefix, whitespace or ambiguous leading zeros. Preserve the six open fields and
the actual snapshot status array/network/held/remaining/completeness contract.
Use fixed errors only, with 503 for storage defects and no private reflected data.

Canonical IDs and lowercase 32-hex header-only tokens must be validated before
constant-time comparison and any session Store IO. All namespace paths, methods
and errors are private,no-store. Never read a query token. Missing/wrong/foreign/
malformed token and unknown ID use the same fixed 404. Accept only empty close
body or empty JSON object, with persisted close time and pending/duplicate refusal.

Real-session creation/admission requires the captured configured nonempty bounded
stable hub secret and backend-derived durable storage, including loopback. Do not
disable a selected test rail merely because real rails are also built. Historical
reads and terminal/uncertainty reconciliation must not be blocked to hide evidence.
Stability across restart is an operator requirement, not proof from string length.

Approve narrow failure-first publicReceipt sessionId exclusion before any route
emits session evidence. Preserve the later H1 whitelist on canonical integration.
Approve a shared canonical ASCII token comparator in the server-side session
module and narrow existing jobTokenOk use, with an actual /jobs Unicode regression;
do not add Node-only crypto to browser core or alter ordinary valid job tokens.

For F8, both x-arcade-session and x-session-token are required even on an initial
402 probe, before session reads; separately recover and match the payer. A present
empty/invalid session header never falls back. F9/F10 must forward both protected
headers; neither query nor seller-funded sub-hire inheritance is permitted.
These are explicit privacy adaptations to the illustrative plan.

## Read-only recovery of a closed artifact

The F9/F10 review identified that a lost successful close response cannot recover
the authoritative artifact from a boolean closed status alone. Add optional
closed_receipt to authenticated GET status ONLY when the same returned snapshot
has persisted closedAtMs and is complete. Build it through F6.sessionReceipt from
that same snapshot, not a second read or a new close. It contains the exact core
closed artifact JSON and remains bounded by 100 lifetime calls; omit it while open.
Document this additive field for F9/F10/H. The buyer retains its capability after
close error/uncertainty and can recover via this read, never replaying the POST or
inventing the timestamp. MCP actual-input quotes also need both session headers
when a session is selected; no silent default-rail fallback.

F8 must preserve actual rail fee/reference semantics: a Gateway accepted transfer
is not a mined splitter payout. Review current fee allocation/accrual and D
attestation assumptions before the session pipeline source release; do not emit
unsupported fee-transfer, mined-chain or no-charge claims from UUID evidence.

F1 approval is consumed. Task 12 is the normal Gateway live-evidence script and
must not spend during this local implementation. Task 13 is the conditional
fallback track in the actual plan, not automatically triggered after a passing F1.
Historical notes referring generically to a separate F13 live run remain historical;
neither label supplies new payment, withdrawal or deployment authority.

## F7 source-release clarifications — September 6, 2026

F6 committed as 5d61133 before source release. Approved import-safe route factory:
makeSessionRoutes({ sessions, rails, sessionStorage, hubSecret, configuredHubSecret })
returns the handler; server constructs one F6 service from the exact same Store,
Rails and selected chain. Capture secret/config once. The configured secret must
match the captured actual secret, be nonempty and at most 4096 UTF-8 bytes for
real opens, alongside the backend-derived durable fact. F6 retains its independent
Store admission guard. A narrow trusted now() seam for deterministic time tests is
allowed; production close captures one time. Transport handler count is not an
accounting ledger. Server-only canonical comparator and HMAC/auth helpers may be
exported for F8, without paid-branch wiring in F7.

For GET/close, canonical path/method and token authentication precede capacity
consumption, so wrong/missing/malformed tokens retain the fixed 404 even while
32 authenticated/open-body handlers are busy. They consume neither Store IO nor
a body-read slot. Unauthenticated open still checks capacity before reading body.
Application namespace responses are private,no-store. Raw malformed-HTTP framing
rejections produced by Bun before application dispatch are outside that handler
guarantee; do not describe a unit Request fixture as proof of transport-parser
behavior. Owned real HTTP tests must identify this distinction honestly.

Exact released scope is seven files including one preload fixture: server-sessions,
server, receipts-feed, session-endpoints Vitest/Bun tests, session-endpoints preload,
and receipts-feed test. F8 source and global core/F5/F6 remain frozen. Root read
the complete independent-review-preparation note and accepted its existing-matrix
focus on uncooperative read/cancel, late-body no-write, same-snapshot closed artifact,
actual restart and decoded Unicode query proof. No new live authority follows.
