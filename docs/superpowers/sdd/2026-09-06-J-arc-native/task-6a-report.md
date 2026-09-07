# J6A — pinned escrow and receipt hook

Implemented the pinned submodule, exact recursive dependencies, root remappings,
isolated candidate build profile and escrow-only receipt hook. No vendor source
or gitlink dependency was modified. Deployment is **NOT_RUN/BLOCKED** by runtime
size plus the separate explicit treasury owner checkpoint.

Targeted TDD began with the expected missing-hook compiler failure. A test typo
used a nonexistent replay error name and was corrected to the actual upstream
`AuthorizationNonceUsed`; this was a fixture/compiler error, not a contract bug.
All 15 hook tests pass with the real proxy and genuine local EIP-712 signatures.
Coverage includes evaluator gating on direct and relayed fund, nonce rollback,
replay refusal, five-percent fee/receipt events, malformed-data atomic rollback,
empty tree, rejection before/after submit, and expiry/grace refund distinctions.

The first non-offline Forge run compiled successfully but the macOS native
system-configuration dependency panicked while constructing a network client.
The supported `--offline` option avoids that path; no RPC/fork is needed.
Legacy focused15PASS/16.83ms; via-IR focused15PASS/20.77ms.

The separate size gate **fails**, including both via-IR experiments. Exact
sizes and implications are in the [escrow build guide](../../../erc8183-escrow.md).
No successful test is presented as a deployable artifact or live proof. The
saved profile retains optimizer 200; the command-local runs-1 result is only
diagnostic evidence. No code-size limit, authorization lifetime or replay rule
was changed, no source was pruned and no speculative upstream pin was selected.

Sole frozen sequential full test gate36921 PASS:31Foundry/3suites/25.62ms;
4,825Vitest/214files/67.00s;955Bun/67files/7,272assertions/172.70s;
root/webstrict;client373ms/SSR196ms. Eleven-path/45local-link scope/privacy
audit passed before the gate; five build/source/vendor pins are rechecked before
the atomic commit and exact fast-forward. The separate size gate remains FAIL.
This checkpoint does not implement the deployment driver, payment rail, hub
workflow or buyer escrow path; those are the next bounded commits. J4/J5 live
remain paused. No real keys, spend, deployment, subagents or push.
