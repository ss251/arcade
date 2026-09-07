# J8C2 — request-bound budget/root HTTP

Implements the [HTTP brief](task-8c2-brief.md). Actual server routes now compose
the dedicated escrow registry and [durable pipeline](task-8d4-report.md), but
startup does not yet build that registry entry. Explicit pinned configuration,
durable action-journal ownership and evaluator/broker composition remain D5.
This is not Task8 completion, deployment or live proof.

## Wire and admission

`Rails.escrow` is separate from legacy `get` and `RailTag`; default/session/child
consumers are not widened. Gateway/exact challenges never receive escrow-only
fields. The actual input order/hash, verified public agent/listing, price/version,
timeout, provider and explicit opt-in determine the escrow quote. Unquotable
escrow terms are omitted without breaking exact choices. Discovery has no buyer
input and omits signable escrow accepts; declared listing rails remain visible.
The root402 now includes its top-level resource descriptor. No J4 live call ran.

`POST /x/:seller/:skill/escrow` takes exactly `{input,payment}`. Payment is the
closed J7x402v2 envelope with accepted terms plus jobId/capability. The original
bare-jobId draft could not prove buyer ownership; it is intentionally refused.
Current terms are independently derived for the paid root URL, not the budget
URL. The guarded `verifyBudget` precedes a second current-listing check and one
journaled `budget` call. Response fields are status, jobId, budget, token, escrow,
budgetTx and fundBy. FundBy is expiry minus listing timeout minus600, not a new
authorization validity rule. The buyer must independently verify chain facts
and the cutoff before approving/funding; response metadata alone is not proof.

Bodies use the unchanged131072-byte/5-second ordinary reader. Escrow-only abuse
controls allow four active requests, one budget attempt per verified payer per
minute, ten retained attempts per payer and1000 total retained budget attempts
per process. No eviction or failure resets. These are not a spend authorization;
they reset on operator restart. The existing durable action journal separately
retains one-shot ownership across restart and bounds actual gas per action.
Explicit deployment/gas configuration is still required before activation.

Root selection branches before legacy decoding/writers. Funded capability and
current terms precede the atomic Store admission. Only the created admission
starts the original verified object on the typed pipeline. Still-funded retries
return the existing hub ID/token without reexecution. Once on-chain state is
terminal, funded-stage verification may refuse a new POST; buyers must retain
their issued result token. This checkpoint does not add terminal-capability
recovery. Startup/handoff failure leaves durable uncertainty, not a fake refund.
Uncertainty without a terminal receipt still requires reconciliation; no live
recovery/rebroadcast is supplied here.

Escrow HTTP owns verification/budget cancellation; close stops new requests and
awaits interruption cleanup. Once root admission commits, HTTP disconnect cannot
cancel its acknowledged handoff. The actual server uses a dedicated hub child
scope, with request shutdown before child interruption/uncertainty cleanup.
There is no detached escrow fiber. D5 must enclose that lifetime in the concrete
action journal. No stable secret, durable Store, built escrow, or real root rail
means a fixed private503 without verification, relay or inference.

## Verification

The initial HTTP scaffold exposed the absent module. Tests use actual owned
SQLite, the actual pure challenge factory with unusable action ports, actual
owned loopback transport and synthetic injected verification/action proofs.
They do not prove a live capability, provider signing, funding or deployment.
An initial guessed hire-header name and claimed delist flag were corrected to
the real exported header and durable pay-test history; production policy was
not loosened. Final45HTTP tests/1158assertions passed in1.292s, including the
synthetic1000-retained-attempt boundary. Eight-root strict checking reported
zero diagnostics.84rail/challenge/discovery Vitest tests/4files passed in0.823s.
Earlier63Bun/2files,446assertions passed in7.76s including actual disabled boot;
the last two additional HTTP cases are included in the final45 count. The sole
sequential full gate passed5,106Vitest/235files in70.72s and1,188Bun/82files,
9,758assertions in187.39s, plus root/web strict checking and client/SSR builds.
The freeze/audit covers14paths and118local links with no privacy matches;
all eight code/test pins are checked again before commit. No owner key, external
RPC, spending, send, existing validity/cap/
replay changes, approval reuse, production mutation or push.

Next: D5 explicit pinned boot and journal lifecycle verification; then Task9
journaled buyer escrow lifecycle. J4/J5 live and J6 treasury/size pauses remain.
