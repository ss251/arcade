# J8B3c2 — authenticated hub escrow correlation

Offline continuation of [daemon integration](task-8b3c1-report.md) under the
[Task8 brief](task-8-brief.md). No rail activation, keys, RPC or transactions.

## Production composition

The actual broker now composes a closed escrow request/reply correlator. Budget
requests select a currently connected runner for the exact provider and skill.
Each binding retains full context hash, original authenticated socket token,
hub job ID when assigned, actual completion output hash, and one-shot attempts.
No raw input/output, capability, key or returned signature is cached there.

Escrow dispatch captures and hashes actual input, checks root-only metadata and
binds ownership before installing its waiter and sending once, with no await
between those operations. A duplicate escrow or hub job cannot execute again.
Result completion retains escrow ownership after deleting the ordinary waiter.
Only an actual successful result contributes the submit hash; the pipeline and
runner must still independently validate its schema. Failed/duplicate results,
interrupted dispatch and uncertain sends cannot restore signing authority.

The hub supplies the stable authenticated WebSocket data object, not just the
runner ID. Same-socket Hello refresh preserves ownership even if the serving
route is withdrawn; a replacement or disconnect invalidates it. New signed
reply handlers run under the existing registration lock and check the current
socket map before passing the original token to the broker. Wrong/anonymous
sockets, unknown requests and duplicates cannot fulfill a request.

Replies are strictly decoded and correlated to request, operation, escrow and
job. Actual EIP-712 recovery checks the exact provider, domain, amount/token or
actual completed output, nonce and current deadline. Connection/time/cancellation
are checked again after asynchronous recovery. Diagnostics are fixed
`escrow_broker_refused`; neither raw peer diagnostics nor signatures are logged.

The caller's abort signal wins. An upper bound of five minutes matches the
existing action executor's whole-operation ceiling; this is not a change to the
five-second individual RPC/signing IO bound or any payment validity window.
The existing provider signature deadline remains ten minutes. No retries.

Process-local capacity is 64 pending requests and 1,000 retained escrow jobs,
with at most one budget and one submit attempt each. No automatic eviction,
release or restart recovery is provided here. These volatile fences are not a
substitute for durable admission or action/provider journals. Full capacity
refuses new work; future cleanup must prove durable terminal ownership first.

## Verification

Two genuine initial failures showed broker dispatch dropping escrow context and
no correlation facade. After composition, focused tests cover exact reply
ownership, original submit retention, same-socket refresh, wrong signatures and
amounts, expired deadlines, post-recovery clock/socket changes, failed completion,
duplicate dispatch, interruption, malformed data, caller timeout, failed sends
and concurrent/retained capacity. Existing broker behavior remains covered.

Two real owned-loopback hub tests use the actual server, broker, signed Hello
and WebSocket handlers. Anonymous/wrong-socket replies are ignored; original
submit ownership survives result cleanup/refresh; replacement cannot inherit
pending or completed authority. Ephemeral fixture signatures only; external
fetch and preconnect refuse. The initial fixture omitted Hello's timestamped
nonce, which was corrected without changing production authentication. Test
wire-to-Hex typing and Bun fetch typing were also corrected, not product bugs.

Final focused43Vitest/4files passed in4.84s:23new broker,2actualhub,
9existing broker and9existing signed-Hello cases. Six-root strict check passed
with zero diagnostics. Scope/privacy audit passed:11files,89valid local links,
no added privacy matches, six code pins frozen. Sole full gate19114 passed:
5,057Vitest/232files/71.42s;1,015Bun/76files/7,833assertions/178.69s;
root/web strict and client/SSR builds. No full-gate replay.
These tests do not compose an actual daemon and hub
with a live chain or prove settlement. Next8C durable atomic admission, then8D
root pipeline activation and9 buyer lifecycle; J4/J5/J6 live pauses remain.
No owner keys, approvals replayed, spending, deployment, existing validity/cap/
replay changes, production changes or push.
