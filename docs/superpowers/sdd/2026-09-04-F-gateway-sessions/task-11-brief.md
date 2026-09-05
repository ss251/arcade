# Task 11 — explicit funding and session CLI

F10 committed as `dc86bf1`. F11 implements deliberately separate Arc-testnet
funding commands and a thin bounded session batch over the captured F9 API.
Source review and the full test/type gate pass. Final publication audit and the
atomic commit follow. F11/F12 live execution is **NOT RUN**; the technical
funding-acceptance limits below remain unresolved.

- [Funding readiness](task-11-funding-readiness.md)
- [Source handoff](task-11-source-handoff.md)
- [Implementation split](task-11-implementation-split.md)
- [Parent decisions and superseding protocol limits](task-11-parent-decisions.md)
- [Pinned withdrawal protocol evidence](task-11-withdrawal-protocol-evidence.md)
- [Independent unsigned protocol review](task-11-independent-protocol-review.md)
- [Deployment identity evidence](task-11-deployment-identity-review.md)
- [Pure-module implementation](task-11-pure-report.md)
- [Parent pure/vector review](task-11-pure-parent-review.md)
- [Journal findings and correction review](task-11-journal-independent-review.md)
- [CLI/session implementation and corrections](task-11-cli-report.md)
- [Parent CLI/session review](task-11-cli-parent-review.md)
- [Runtime implementation and genuine regression chronology](task-11-runtime-report.md)
- [Independent cancellation finding and correction](task-11-runtime-independent-review.md)
- [Parent final source review and complete gate](task-11-parent-review.md)

Amounts use exact six-decimal integers; gas uses native atomic units. Every
mutation requires an expected account, explicit amount or bounded target,
aggregate gas cap and a fresh private journal. Withdrawal also needs explicit
fee and finite block-height bounds. No key flags, implicit deposit, withdraw-all,
automatic retry, approval fallback or session-triggered funding exists.

The account-wide claim is independent of journal filename and process. Known
transaction hashes are durable before a single broadcast. Raw signed bytes,
attestation capabilities and normal-transfer UUIDs stay private. Close does not
unlock; explicit keyless finalization requires matching local transcript and
independent terminal evidence. The filesystem model is cooperative same-account
ownership, not protection against hostile same-user rewrites or arbitrary faults.

Two technical acceptance limits are intentionally preserved. Current Arc Minter
code differs from the reviewed artifact, so withdrawal refuses before signing
or normal-transfer POST. Circle's pending-only deposit feed does not prove exact
transaction-correlated completed credit; a proved deposit can show observed
available funds while remaining `credit_pending`, without implying those funds
are unusable. No bypass, redeposit or claim deletion is a remedy.

Tests use pure vectors, prebuilt public synthetic signature fixtures, injected
wire responses and owned temporary files/processes. They are not live funding,
withdrawal or twenty-call evidence. The session adapter performs one open,
sequential calls and one close only after success; uncertain calls stop. It
cannot recover a lost process capability from a public session ID.

See [sessions and explicit funding](../../../sessions.md) for current operator
templates and limitations. No new spend, approval replay, production change,
mainnet flip or push is authorized. Full F still precedes G, H and I.
