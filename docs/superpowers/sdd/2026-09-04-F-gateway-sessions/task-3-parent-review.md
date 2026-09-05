> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F3 parent independent review — 2026-09-05

Read the full frozen source, both new test files, complete implementation report,
and exact additive SettledPayment/conformance diff. CLEAN within the stated
process-local rail scope. No new source changes or live requests were made.

Independently reran gateway-rail and rail.conformance: 54 tests passed at
18:43:33 IST (the 10,000 real-signature nonce-cap case took 19.707 seconds).
The command also named a nonexistent eip3009-config test; Vitest collected only
the two real files, so no configured-chain result is attributed to that command.
Then reran the correct chain-config file: 4/4 passed at 18:45:53 IST.

Independently ran all six owned native/Node HTTP cases: 20 assertions, exit zero,
15.11 seconds overall. The actual header deadline took 15.01323 seconds. Native
Request.signal cancellation and bounded request drain passed. This is local
transport cleanup, not cancellation of a downstream payment. Every owned
listener was cleaned up by the reviewed fixture's bounded afterEach.

An exact-root-options TypeScript program targeting all six source/test files
reported zero diagnostics. No relaxed temporary compiler configuration was used.
The TypeScript-testing skill drove this independent behavioral and real-loopback
verification; the original worker report and genuine Red chronology are retained.

The rail binds the pinned selected configuration and recovers signatures locally;
only original frozen VerifiedPayment handles can settle. Nonce admission is
bounded and process-local, before POST, with no retries. Post-dispatch failures
are fixed uncertainty. The HTTP seam has a shared deadline and bounded cleanup.
Gateway emits UUID transfer references only. It cannot claim mined batch proof,
recipient withdrawability, durable crash safety or full F13 live acceptance.

Durable session authority is explicitly governed by task5-parent-decisions.md.
Full repository gates, public artifact copy/review and the atomic F3 commit are
still pending; this report does not represent an integration gate or main merge.
