# F8 brief — private paid session integration

September 6, 2026. F7 committed separately as `61fe5ca` after its complete gate
and independent source/publication reviews. This implements
[Plan F Task 8](../../plans/2026-09-04-F-gateway-sessions.md#task-8-the-paid-path-honors-x-arcade-session)
under the [work order](../2026-09-04-A-settlement-core/work-order.md).

## Accepted architecture

The new session-only paid router and executor use the F5 durable accounting
authority and F6 lifecycle service. The ordinary pipeline remains unchanged.
The plan's illustrative after-the-fact commit/release block is superseded by
reservation before execution, a one-shot durable begin barrier, atomic Job/Receipt
finish and held uncertainty after ambiguous settlement. The issued executor also
owns one process-local attempt; this is not a durable replay or recovery engine.

Both canonical session capabilities authenticate before Store IO. Result polling
adds a distinct session-job HMAC capability in a header; no query token or ordinary
job-token fallback is accepted. Paid raw JSON is limited to1MiB, a five-second
whole-body deadline and32 active handlers, independently of ledger evidence bounds.
No session credentials are sent to runners or their ordinary seller-funded hires.

Canonical signed address coordinates are normalized together before the actual
rail verifier; its exact VerifiedPayment object survives preparation and settle.
Gateway/Test/direct EIP allocate full seller price and no local fee. Splitter EIP
requires the actual successful handshake's observed fee/network/version, not a
stale verified flag plus a later boot fee. Only a verified configured canary payer
can mark a terminal receipt as canary. Root session receipts omit tree fields and
fee-accrual markers. EIP-only D enqueue is bounded and follows atomic persistence.

Terminal results use one selected, fully validated defensive Job/Receipt pair.
This closes the reproduced memory-backend gap between an earlier receipt check
and a later unbound Job read. Pending exposes no output; uncertain requires
reconciliation without retry; released returns fixed refusal/null output;
settled returns only actual persisted output. Gateway/Test references stay
unlinked; only matching-network nonzero EIP hashes receive explorer links.

## Preparation and review records

- [Integration readiness](task-8-integration-readiness.md)
- [Parent decisions and documented adaptations](task-8-parent-decisions.md)
- [Capability separation review](task-8-capability-review.md)
- [Original source handoff](task-8-source-handoff.md)
- [Original receipt-only getter report](task-8-receipt-getter-report.md)
- [Original getter independent review and evidence limits](task-8-receipt-getter-review.md)
- [Same-read terminal-bundle correction](task-8-terminal-bundle-correction.md)
- [Terminal-bundle independent review](task-8-terminal-bundle-review.md)
- [Executor author report](task-8-pipeline-report.md)
- [Executor parent independent review](task-8-pipeline-parent-review.md)
- [Pure boundaries and canary independent review](task-8-pure-independent-review.md)
- [Paid-router author report and exact F9 contract](task-8-report.md)
- [Parent integration review and gate chronology](task-8-parent-review.md)
- [Final router independent source/runtime review](task-8-router-independent-review.md)

Historical copies retain their exact checkpoint claims. The original getter is
still available as a compatibility projection; its first review did not cover
the subsequent router race. Stored reason-accessor tests are not a general
hostile in-process getter/Proxy guarantee. SQLite reads bounded selected-session
evidence in four SELECTs, not a new one-row physical getter. Memory retains
whole-state validation. Local test references, intercepted Gateway replies and
controlled EIP seams are not live settlement or mined-batch proof.

Combined source acceptance, public review and the complete repository gate are
recorded separately when finished. F9 still supplies the buyer-side session
client. F12 live remains NOT RUN under no-new-spend; F13 fallback is not triggered
by the passing F1. No keys, approval replay, funding, withdrawal, deployment,
production ENS re-point, mainnet action or push is authorized by this checkpoint.

The complete frozen repository gate subsequently passed2,529Vitest/119files,
409Bun/4,170assertions/36files and root/web strict typing, exit0. Final independent
router/publication review and commit remain separately tracked in the parent review.

Final independent router review is CLEAN:145focusedVitest/fivefiles,21actualBun/
306observedassertions/twofiles, exact7strict0, plus five independent router cases/
40assertions. The author's308Bun assertions are from a separate run; pending polls
can vary assertion counts. All13source hashes still match the full-gate freeze.
