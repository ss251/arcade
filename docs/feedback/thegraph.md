# The Graph — integration feedback draft

Prepared September8,2026; not sent. Public documentation was read without an
API key or paid query. Live claims below refer only to dated retained evidence.

## Keep data chain and payment chain distinct in examples

The current [x402 documentation](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/)
explicitly lists Base for mainnet payments and Base Sepolia for test payments;
API-key and x402 access are separate paths. It would be inaccurate to say the
documentation only supports mainnet or hides the chain distinction entirely.

Our application settles jobs on Arc, while its proposed paid Graph input is
budgeted on Base. Request: add a worked two-chain consumer with separate money
units, durable per-approval payment accounting, result caching and an explicit
uncertain-payment stop. Our [G15 readiness review](../superpowers/sdd/2026-09-04-G-graph/task-15-readiness.md)
identifies missing local harness work; it is not a completed paid demonstration
or a claim that the vendor SDK promised cross-process budget enforcement.

## Distinguish selected proof from complete product statistics

Our [retained Studio match](../superpowers/sdd/2026-09-04-G-graph/task-6-indexed-match-review.md)
verified three selected settlement projections at one deployment. Marketplace
data was null and registry tables empty; neither means zero marketplace activity.
Request: complement the provider examples with explicit unavailable, partial,
empty and error states, and a demonstration that does meaningful application
work with the data. The [Continuity AI prize requirements](https://ethglobal.com/events/ethonline2026/prizes)
make that distinction important: a raw result or static fixture alone is not our
submission's completed live-data story. No Base payment was made for this draft.
