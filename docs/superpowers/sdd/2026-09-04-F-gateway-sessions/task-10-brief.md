# Task 10 — captured MCP sessions

F9 committed as `6d3222b`. F10 adds session open/close tools and routes active
calls, actual-input quotes and budget reads through the captured F9 handle.
Opening/closing spends and escrows nothing; each intentional call may authorize
USDC. Process spent and uncertain issued exposure survive close and later calls.

- [Source handoff](task-10-source-handoff.md)
- [Independent readiness review](task-10-independent-readiness-review.md)
- [Parent release and correction decisions](task-10-parent-decisions.md)
- [Author preparation](task-10-author-context.md)
- [Author implementation and genuine regression chronology](task-10-report.md)
- [Independent initial findings and final correction review](task-10-independent-review.md)
- [Parent source review and complete gate](task-10-parent-review.md)

One queue preserves cancellation ordering and captured purchase intent. A call
queued against a closing/changed session refuses rather than switching to an
ordinary purchase or another handle. Lost close uses authenticated read-only
recovery, never another close POST. No status or receipt resets local authority.

Wallet USDC is a bounded captured-chain read; Gateway available/pending is
explicitly unavailable without evidence. Hub held/remaining and process exposure
are distinct. Session origins require HTTPS or literal loopback HTTP; the legacy
ordinary localhost default is not silently remapped. MCP request IDs zero and
empty string are refused because the installed SDK cannot cancel them normally.

Tests exercise actual installed MCP transports and the actual F9 SDK with
synthetic unfunded identities/injected responses, not live settlement. F11 funding
remains separate. F12 live is NOT RUN; F13 fallback was not triggered. No new
spending, approval replay, production change or GitHub push.
