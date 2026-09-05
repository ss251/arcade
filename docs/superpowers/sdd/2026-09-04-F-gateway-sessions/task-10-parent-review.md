# F10 parent review and gate chronology

September 6, 2026. Parent source review is CLEAN within the released MCP scope.
Read all readiness/decisions/author reports, the final changed source sections,
both test changes and the complete private queue fixture. Unchanged ordinary
source was previously reviewed; the final diff preserves it apart from bounded
input copying and cancellation propagation. All eight committed F9 hashes match.

## Corrections and evidence boundaries

Parent identified a possible queued-lane switch in source; independent review
then reproduced two actual failures on the unchanged checkpoint. The retained
fixture originally had 0 pass / 2 fail / 8 assertions. Its corrected rerun has
2 pass / 8 assertions, independently repeated by both reviewer and parent. The
proof is wrong SDK-entry prevention, not an observed real payment or signature.
Original reports retain the failed checkpoint and fixture setup distinction.

The final queue binds phase, context and generation before waiting. Stale call
or close intent refuses before dispatch; cancellation of a middle waiter cannot
release its successor early. Active Effects receive actual MCP handler signals
and join cleanup. Tests exercise the installed Client/InMemoryTransport and the
explicit falsy-request-ID refusal, not a claim of universal SDK cancellation.

Captured F9 handles keep capabilities private. Local authorized amounts alone
narrow reservations; signed releases and unknown interruption retain exposure.
Validated settled amounts transfer from reserved to spent once. Close/status
does not refund or add totals again. Read-only completions never clear lifecycle.
This is process-local accounting, not persistent wallet-wide authority tracking.

The captured wallet batch binds network, token, public buyer and fixed response
IDs. Missing evidence stays unavailable. Its fetch and streamed body share a
five-second bound; current monotonic/abort checks and a finite empty-chunk guard
prevent unbounded read work. Cancellation is requested best-effort; no physical
TCP EOF or termination of a hostile injected cancellation promise is claimed.
The finite 3000-empty-chunk Red is separate from F9's historical transport Red.

Actual F9 SDK tests use injected TestRail HTTP responses and synthetic signing,
covering success/release, private quote headers, a fresh one-shot call, retained
identity after an environment change and fenced seller output. They do not
establish live settlement, Gateway credit/mining or operational wallet balances.

## Frozen source and verification

| File | SHA-256 |
| --- | --- |
| packages/buyer/src/mcp.ts | b730d50eccd11742355a6efeddf1d4a359252a97c1cc0ab50dbd1981100060ac |
| packages/buyer/test/mcp.test.ts | 1c072b92ed9b8d701bb023528274e01bb523109b26d8e629c5c83e5f61f0eec7 |
| packages/buyer/test/mcp-session.test.ts | 608b8d39a207e2188e4fefd96d2e72e3da2a9ca8ed2f8f5f0c8074e22f992b4c |

Author:175 focused Vitest /6 files, unchanged private2 Bun /8 assertions and exact
three source/test roots plus the private fixture strict check, zero diagnostics.
Independent reviewer:62 MCP Vitest /2 files, private2 Bun /8 assertions and exact
four-root strict checking, all zero. Parent separately repeated private2/8 after
fully reading the fixture. Those two private cases are not added to full totals.

Parent's complete frozen gate started03:54:24IST and passed **2608 Vitest /121
files,433 Bun /4254 assertions /37 files, root and web strict TypeScript**, exit0.
Vitest took45.50s; Bun99.28s. No source changed during that gate. All three F10 and
eight F9 source/test fingerprints matched afterward; git diff --check also passed.

Six historical copies use the standard banner and ten explicit locator
substitutions. Current brief, parent review, README and progress complete the
F10 publication; the next commit also records F9's isolated line-count erratum.
Independent public-copy/privacy/link review precedes the exact atomic commit.
Private reports/fixtures, owner handoffs and live journals are never selected.
No F11 source, live action, new spend, approval replay, merge or push is included.

Final independent publication review is CLEAN: six exact copies, ten approved
literal substitutions, eleven public files,87 resolving local links and no
privacy findings. All three source hashes and historical failed-report prefixes
match. Parent read the complete audit and retained its private inventory; this
final result paragraph adds no new link, evidence category or execution claim.
