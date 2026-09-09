> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 author context — held for the F9 commit

Read-only preparation, September 6, 2026. **Buildable within the approved three
paths; no new API/dependency/native fixture requirement found.** This is source
inspection and a test plan, not a compile run, behavioral Red or acceptance claim.
Source remains held until the parent's explicit post-F9-commit release.

Fully read the 122-line source handoff, 106-line independent readiness review,
49-line parent decisions, actual Plan F global constraints and complete Task10,
820-line mcp.ts, 435-line mcp.test.ts, 241-line mcp-ens.test.ts, actual F9 lifecycle
and root exports. Inspected installed MCP SDK1.29.0 cancellation/handler/close
implementation, full InMemoryTransport, package exports and test configuration.
No source/test edits, tests, Git, external network, environment credentials or
full gate. This ignored note is the only write.

## Exact ownership and consumption

- `packages/buyer/src/mcp.ts`: new schemas/tools, minimal `__setOpenSession` seam,
  one lifecycle/queue integration, active-session quote/call/budget, cancellation.
- `packages/buyer/test/mcp.test.ts`: additive advertisement/schema assertions and
  the exact three-writer list. Keep all ordinary fencing/budget assertions.
- `packages/buyer/test/mcp-session.test.ts`: new lifecycle/accounting/queue tests
  and actual installed Client/InMemoryTransport cancellation/disconnect tests.

Consume `openSession`, `BuyerSessionFailure`, `BuyerSession` from the actual F9
exports. Open returns an Effect; the immutable handle has identity plus quote,
call, status and close Effects. Effects are one-shot; allocate one invocation per
intent and run with `Effect.either` and the request signal. Do not inspect tokens,
private session HTTP internals or manufacture a sessionId-only paid call.

Quote returns exact priceAtomic/rail/network/serviceName/skillId/skillVersion/seller
(seller here is a wallet). The SDK call's historically named seller argument is a
service URL segment. MCP's bounded direct listing projection supplies that segment;
F9 repeats its own listing and actual-input challenge binding. Active-session quote
never calls legacy quoteAtomic or falls back to catalog price. Capture the exact
origin/fetch/ready network alongside the handle; no later key lookup for that handle.
The existing default localhost origin is not accepted by F9's stricter session
origin policy: refuse it consistently, without changing ordinary defaults or
silently substituting a new origin. Literal loopback or HTTPS configuration works.

## State, queue and provenance implementation checkpoints

Use explicit idle/opening/open/closing/open-uncertain/close-uncertain state, not
handle presence as mutation authority. Normalize/copy own-data arguments before
awaiting the shared purchase lease. Open/close/call use that same lease; retain
the predecessor dependency even when a queued middle caller is canceled. Check
cancellation before enqueue, after acquisition and before IO/account/SDK entry.
No canceled waiter executes later or releases a successor ahead of active work.

Read-only quote/budget capture the handle and generation and do not write global
lifecycle state. Only queued explicit close performs lost-close status recovery
and clears a handle on matching complete closed proof. Pending close can retain
open; unknown open with no handle still blocks ordinary mutation fallback. No
retry of open or close POST, no automatic close, and no second use of an Effect.

Reserve min(caller cap, configured per-call cap, process remaining) before active
SDK call entry. Local BuyerSessionFailure phase/authorizedAmountAtomic or the
SDK's locally attributed result amount may narrow unused reservation only with
the accepted unsigned/issued provenance and 0 <= amount <= reserved cap. Remote
receipt/status numbers cannot grant this narrowing. Signed release retains issued
exposure; unclassified interruption/defect retains the conservative cap. A valid
settled result moves the same amount from exposure to spent once after terminal
correlation; duplicate jobs or contradictory lower receipts cannot reopen budget.
No close/budget/status total is an extra debit or a refund. Preserve cumulative
totals through close, later sessions and ordinary purchases. No persistence claim.

Budget separates process settled/exposure from hub spent/held/remaining and wallet
USDC. Bind any wallet read to the captured buyer and ready network; otherwise show
unavailable. Gateway available/pending are explicitly unavailable without actual
evidence, never zero or wallet-balance aliases. Funding remains F11.

## First genuine Reds and final focused evidence

Use the existing Vitest stack and deterministic gates, following ts-testing's
behavior-first workflow. First advertised missing tools are genuine surface Reds;
missing fixture/import/seam setup failures remain separately attributed. Cover
canonical budget/excess/getter refusal before key/IO, duplicate concurrent open,
captured account after ambient key change, unknown-open poisoning, pending/lost
close/status recovery, actual-input private quote and no fallback, immutable
queued input, process ceiling across signed release/close/reopen/ordinary calls,
forged lower result and duplicate accounting, and seller-result fencing.

Actual SDK1.29.0 `_oncancel` ignores requestId0 and empty string. Implement the
parent-approved fixed createServer refusal for those two IDs before dispatch;
test explicit wire IDs through InMemoryTransport. Other requests propagate actual
handler extra.signal. Exercise Client cancellation and transport close while
queued and after SDK signer/attempt entry; join handler finalizers before reset.
The decisive queue fixture is active A, canceled middle B, then C: C must wait
for A and B must never invoke an operation. No native fixture is required for
this real installed-protocol proof; no stdio/socket/process claim will be made.

After release, focus the three owned roots plus existing MCP ENS/ERC-8004 and
buyer-session regressions, then exact TypeScript roots/dependency traversal.
The parent alone runs the full repository gate. No test was run for this note.

## Read fingerprints

| Read input | SHA-256 |
| --- | --- |
| task-10-source-handoff.md | 113fd3ebdc0576491d9907ff7bd3a0247729a6a9de4519badceea396624d8208 |
| task-10-independent-readiness-review.md | d2eee7b02908855cc04aa3d8769cfbb531b53d77b0dfb005da6e513dbbc0d690 |
| task-10-parent-decisions.md | cd9b0e616f949763c03cdb205a00856762096ddb2058c59155a0397dacaf08f8 |
| packages/buyer/src/mcp.ts | bacd678dfaf6503f6aabb776314ea3e87fee9930cc2c14bc681dac0f0163ee42 |
| packages/buyer/test/mcp.test.ts | 16ed9647a3b16a2e1caad2bdc578d8dc81ac89ffb85cde84dcf806ee7e4e4d78 |
| packages/buyer/src/session.ts | 1c91030172feb22a57b371977f33d378dfefdb5434f077c5eff83a150892c56d |
