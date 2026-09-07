# J8D4 — typed durable escrow execution pipeline

Implements the [pipeline brief](task-8d4-brief.md), using the
[atomic terminal Store](task-8d1-report.md) and
[durable tree closure](task-8d3-report.md). The production function is ready for
explicit composition, but budget/root HTTP and pinned durable boot are still
unwired. This is not Task8 completion or live evidence.

## Execution and accounting

The dedicated pipeline never casts escrow to the legacy exact payload, asks
for an exact nonce or uses uncashed authorization as a refund. It retains the
original verified object for guarded rail calls. Current public listing,
verified identity/agent, explicit opt-in, price/version/timeout, input schema
and admitted input commitment must agree before inference. Existing remaining
timeout-plus600 checks and all payment validity limits remain unchanged.

The durable claim executes once. Tree preparation precedes broker dispatch;
only this hub pipeline mints a root hire capability, using the existing
timeout-plus60 expiry. The broker forwards bounded internal root capabilities
but still refuses parent escrow. Receiving ordinary child routes keep their
existing MAC and lineage checks; durable closure stops new root reservations.

After the actual runner outcome, the root closes child admission. Pending
holds produce explicit uncertainty with no escrow action. Otherwise actual
full child receipts must match current reservations, network, price, payer
funding and the entire parent/hop/ancestor chain. Failed intermediate parents
may have paid successful descendants; their full nonsettled receipts preserve
that ancestry. Missing/foreign evidence cannot become a compact claimed tree.
Legacy cached evidence can be stale across handles; absence fails closed and
requires reconciliation rather than inventing child facts.

Only bounded, schema-valid, non-refused successful output permits submit then
complete. Output is isolated before asynchronous actions. The commitment uses
the actual hub ID/output/tree, zero leaf hash and exact floor500bps amounts.
Malformed runner data becomes a fixed invalid outcome without running getters
or retaining private diagnostics. Ordinary invalid/refused/lost-runner work
requests one guarded reject. An action error never triggers an opposite action
or retry. Confirmed terminal evidence includes the actual proofs; ambiguity
has no fabricated payment/refund hash or actual movement claim.

Atomic terminal persistence precedes optional confirmed-result attestation.
The queue uses the existing50ms bound and cannot change the durable outcome;
uncertain outcomes are not attested. On a defect/interruption before durable
finish, cleanup attempts closure and durable uncertainty once, without a chain
action. Storage failure leaves reconciliation-needed ownership and no invented
receipt, rather than retrying a payment or registry write. The result reader
already withholds output unless coherent settled evidence exists.

## Verification

Initial scaffold tests reported the absent pipeline module. Final focused
pipeline tests cover success/refund, all three action uncertainties, actual
broker ownership/root capability, current listing refusals, malformed/getter/
oversized outcomes, storage failure after complete, broken/slow attestation,
submit interruption, pending holds, missing runner, all three legacy child
rails, failed intermediate parents, missing/foreign child evidence, output
isolation, overlapping inference claims and incoherent submit proof. Tests use
real owned SQLite and signed synthetic transaction/log/historical fixtures;
the injected rail is explicitly not verification authority or a live chain.
Fixture tree customization preserves previous defaults and encodes its actual
prepared tree into the synthetic hook event.

Existing broker/legacy pipeline/action-proof checks passed79Vitest/7files in2.32s.
Final42pipeline tests/252assertions passed in1.78s; four-root strict checking
reported zero diagnostics. The sole sequential full gate passed5,097Vitest/
234files in72.20s;1,142Bun/81files,8,592assertions in184.90s; root/web strict
checks and client/SSR builds. Ten paths/114local links passed the privacy/scope
freeze; four code/test pins are checked again before commit.
Initial tagged-error-message expectations and an output
fixture below the actual400,000-character limit were corrected; no production
limit or error was changed to satisfy those tests.

No owner key, real RPC, transaction, spending, deployment, approval replay,
existing validity/cap/replay change, production mutation or push. Next: actual
budget/root HTTP and explicit pinned durable boot, then Task9 buyer lifecycle.
J4/J5 live and J6 treasury/size pauses remain in force.
