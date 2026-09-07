# G15A — offline reservation validation

Implement the first bounded part of the [G15 readiness review](task-15-readiness.md).
This is a root-executor scope decision, not owner release for live spending.

The eventual harness is Base-only and uses the plan's default subject
`0x79dc34e41b2b591078d3de222c43ecaabd52fccb`, the recorded payer and a fixed
approval namespace. Full historical artifact replay is distinct from running the
installed skill with a cache. A new Arc purchase is not included. Existing
payment validity, caps, replay protection and production consumer remain intact.

This atomic checkpoint releases only three new script paths:
`scripts/e2e-graph-cogs.sh`, `scripts/e2e-graph-cogs.ts` and its Bun test.
Implement a bounded, strict, canonical hash-chained reservation decoder and
private read-only file audit. Pin the approval namespace, payer, Base USDC,
merchant, subgraph, per-query10000 amount, global10 and evidence5 reservations,
and900000 balance floor. Every recorded reservation remains unresolved; no
refund, reset, replacement, live switch or successful-payment inference exists.
Test actual file aliases/permissions/limits and native no-key/no-network CLI
refusal. No ledger writer, signer, RPC, transport recorder or cache yet.

The read-only audit may inspect an explicit private file, but is not the
production authority path. A later writer must use one fixed non-disposable
namespace, exclusive cross-process locking and fsync before signing, and refuse
all unresolved state. It must not use audit's arbitrary file argument for live
authority. A self-consistent digest does not authenticate hostile local edits,
current balances or an on-chain payment.

Use existing Bun tests with an observed Red before implementation, exact-root
strict checking, then one sequential four-worker full gate and one atomic local
commit/main fast-forward. Update the public records and the shot-list's obsolete
missing-file wording, but keep its live-evidence gap explicit. No push, keys,
paid call, deployment, current RPC or consumed approval replay.
