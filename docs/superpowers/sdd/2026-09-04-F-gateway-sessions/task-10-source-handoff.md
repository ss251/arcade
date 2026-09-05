> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 MCP source handoff — September 6, 2026

Readiness/parent decision only. Source stays held until F9's reviewed commit.
Parent read actual Plan F Task10, current mcp.ts, the existing tool/ENS budget
tests and installed MCP SDK1.29.0 cancellation plumbing. No F10 test or live
operation has run. The literal plan's naked session ID, one-batch claims and
post-close budget reset are superseded by task9-parent-decisions.md.

## Exact starting scope

- Modify `packages/buyer/src/mcp.ts`: session lifecycle, captured SDK routing,
  process accounting, explicit quote and cancellation propagation.
- Modify `packages/buyer/test/mcp.test.ts`: additive tool/schema cases and update
  the exact writer list to include open/close (neither spends or escrows at open).
- Add `packages/buyer/test/mcp-session.test.ts`: deterministic injected SDK state,
  process-ceiling, lifecycle/quote, fixed diagnostics and queue tests.
- Add `packages/buyer/test/mcp-session.bun.test.ts` and
  `packages/buyer/test/fixtures/mcp-session-runtime.ts` only if required for
  actual package/stdio lifecycle; prefer existing in-memory MCP transport for
  actual cancellation/disconnect proof. Native fixtures own/reap their process,
  listeners and finite output; no operational environment or keys.

Do not edit F9/payment/hub/legacy CLI, dependencies or other MCP feature files.
Keep the existing ordinary call/ENS path and output fencing intact. A minimal
`__setOpenSession` injection seam follows existing test seams; no runtime reset
tool or exported SDK reset. Existing `__resetBudget` resets test-only state after
owned operations have joined, not a production lifecycle escape hatch.

## Captured SDK contract and tool inputs

Consume the final F9 `openSession` and frozen BuyerSession, not private HTTP or
session token fields. Hold at most one process-local handle. Opening captures
the account exactly once; subsequent session call/quote/status/close never fetch
the environment key again. Session identity includes public buyer/rail/network/
budget. Both session capabilities stay inside F9; no token logs, arguments,
structured output or query strings. The public session ID is not payment auth.

`arcade_open_session({budgetUsd,rail?})` accepts a canonical positive six-decimal
USDC string and a known explicitly supported rail; reject duplicate/unknown
properties and malformed values before key/IO. Budget cannot exceed the current
process remaining ceiling. Default rail must be the selected ready hub/SDK rail,
never an assumed Gateway fallback. Explicit TestRail remains labelled testing.
Advertise open and close as non-idempotent lifecycle mutations, but state plainly
opening/closing spends and escrows nothing; each intentional call can authorize
USDC. No one-batch/mined/discount/zero-total-fee promise.

`arcade_quote` may add optional actual `input` with `{}` default, keeping ordinary
advisory behavior compatible. While a session exists, use its captured quote
method and supplied actual input, with no metadata-price or sessionless fallback.
Refuse unsupported active-session ENS/name before key/IO. New active quote output
uses only validated numeric/provenance fields. The quote is read-only and not
signing authority; `call` independently probes again.

Current SDK `seller` argument means canonical URL serviceName, whereas public
listing `seller` is the wallet. Current ordinary MCP uses a wallet-shaped route;
do not inherit that into sessions or opportunistically rewrite ordinary behavior.
Resolve a bounded exact same-origin `/listings/:skillId` public projection with
canonical id/serviceName. Do not treat untrusted descriptions/stats as authority.
Then F9 independently binds service/id/version/wallet/price to its fresh challenge.
No metadata-only acceptance or manufactured slug from a display name.

## One queue and finite cancellation

Serialize open/close/call through the same process lease, preserving ordinary
purchase ordering. Latch lifecycle before asynchronous work. Refuse a second
open while opening/open/closing/uncertain; never replace an orphaned handle.
An uncertain open poisons mutation admission rather than auto-opening/falling
back. A known pre-IO refusal does not create a session. Close pending409 may
retain an open handle; lost/invalid close retains it and blocks new signing.
Only an authenticated validated F9 status closedReceipt can recover a lost close.
An explicit later close can perform that read, never a second close POST. Clearing
a successfully closed handle must not reset process issued/spent/exposure totals.

`handleTool` accepts optional request context signal; createServer forwards actual
handler `extra.signal`. Installed SDK supplies an AbortController per request,
aborts it on notifications/cancelled and aborts all handlers on transport close.
Check cancellation before joining the queue and immediately after lease acquisition.
A cancelled middle waiter must never release its successor before the predecessor
finishes. Avoid detachable work; if caller returns early while queued, retain only
a cancellation-owned queue node whose completion cannot execute the request.
Pass the same signal to Effect.runPromise/either, including legacy paid execution;
propagate it through bounded active-session listing/quote work as appropriate.
Never reflect signal.reason or a raw interrupted Fiber/provider diagnostic.

## Cumulative process authority, not session resets

Preserve settled spend and issued-but-unconfirmed exposure across every session
and later ordinary call. Each active call's effective cap is min(caller cap,
configured per-call cap, process remaining); F9 independently checks its captured
session/hub limits. Reserve this finite cap before entering the SDK when exact
price is not yet authoritative. Only locally proven unsigned failure can release
all. A validated returned/failure authorizedAmountAtomic can narrow unused cap;
it cannot be supplied by remote receipt JSON or exceed the reservation. An unknown
interruption/defect retains the conservative reservation. Signed release/close
is not revocation. Confirmed receipt amount must equal local issued amount and
have the correct terminal semantics before moving exposure to spent. Correlate
operation/job once; never add closed receipt totals to spend a second time.

No new wallet-wide persistence guarantee. Uncertain local exposure may be more
conservative than hub held funds; report both distinctly. `arcade_budget` with a
handle uses its captured public identity/status, not buyerAccount() again.
Preserve process totals even if status is unavailable. Show wallet USDC balance,
Gateway available/pending and hub held/remaining as distinct categories; missing
data is unavailable, not zero or wallet balance. F11's future funding inspection
is not an implicit import/deposit prerequisite; unknown Gateway data can remain
explicitly unavailable in this task. No new Circle/chain credential or mainnet call.

## Required evidence before release

First capture genuine Reds for advertised tools and state/queue behavior; missing
module/fixture setup errors are not runtime regressions. Cover invalid budgets
before key/IO, concurrent opens, pending/lost close and read-only recovery, quoted
wrong rail/header/no-input failure with no metadata fallback, captured key identity,
ordinary-after-close cumulative ceiling, signed release/failed/aborted exposure,
malformed/lower price and duplicate reconciliation, and fenced seller output.
Prove middle B cancellation cannot let C run before active A. Exercise actual
installed MCP client transport cancellation and disconnect, not only direct
AbortController injection; assert no later signing after cancellation and retained
process reservation if a signer already entered. Preserve existing ENS budgets,
schema and ERC-8004 tests. Root owns full test/types gate, independent/public
review and exact atomic commit. No full suite in a worker; no spend, push or live
approval replay. Fixture-only signing uses synthetic unfunded identities.
