# G1 final indexed-runbook-match checkpoint

September 5, 2026. The deployment and indexed-runbook query requirement is now
met. This dated checkpoint supersedes the missing-match status of the
[earlier partial live brief](task-1-live-brief.md), without changing that record.
Publication review, the separate full gate, commit and explicit G2–6 local-source
release remain parent-owned. This document does not authorize another deployment,
upload, payment or merge ahead of Plan F.

## Evidence accepted for the requirement

The single approved deployment was acknowledged at `2026-09-05T13:24:16.472Z`.
The later independent keyless observation at `2026-09-05T14:41:46.576Z` returned
HTTP 200 with actual data and no GraphQL errors from the
[acknowledged Studio endpoint](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke).
Its deployment matched `QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`.

The exact known filter returned transaction
`0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2`,
10,000 atomic units ($0.01), buyer
`0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1`, and historical settlement block
53,891,400. The parent checked the hash, amount and case-insensitive buyer match
against the [retained runbook](../../../runbook.md#the-fee-splitter-goes-on-the-runner).
The latest list also contained the other historical runbook transaction
`0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc8143`,
with the same buyer and amount. No new payment was made for this observation.

Metadata reported block 60,593,637, hash
`0xba9c8a058c6154849101164f04390fa08e511d53235c7f5b3fc4baf5bc639f1d`,
and `hasIndexingErrors: false`. Exactly one concurrent read-only `eth_blockNumber`
request to the first locally pinned Arc-testnet RPC returned 60,593,643 at
`2026-09-05T14:41:46.442Z`. This is a measured six-block gap across observations
134 ms apart, not an atomic head comparison, fully-synced or dashboard-status
proof. Both requests had 15-second deadlines and 64-KiB body limits, no credentials,
cookies, redirects, retries or payment.

The [exact independent report](task-1-later-indexing-review.md) retains all returned
public fields, the bounded query, chronology and limits. Its original SHA256 is
`8596598e2b59e3eaef6a5845d3c5dbdeea931a5ea2d937ad79b687e58cebafe1`.

## What this does not establish

This is indexed historical event data, not fresh independent receipt/log mining
proof or an independently checked 9,500/500 seller/fee split. Earlier empty-list
responses and historical public-RPC receipt absence remain valid observations
of their own times. The later result neither erases nor explains them.

The unchanged smoke maps the v1 pilot's ordinary `Settled` event only. It does
not establish V2 trees, ERC-8004 coverage, decentralized publication, Graph x402
availability or a permanent keyless-access policy. G2–6 implementation and later
deployment remain separate work; the acknowledged G1 CID is historical evidence,
not a mutable claim about future schemas.

## Documentation checks and privacy

One new current-status scaffold regression failed against the prior README at
14:46:35 UTC: 6 passed, 1 failed. After the dated status update, all 7 checks and
45 assertions passed by 14:48:20 UTC. The prior six checks and historical partial
records remain unchanged. This is documentation contract coverage, not another
live request or a new mapping execution. The parent owns the subsequent full gate.

Explicit public-copy scrub map: **none**. The copied report contains no personal
username, private path, credential, private journal contents or private clickable
link. Its body is byte-for-byte unchanged; only the two-line publication banner
was added. Public transaction hashes, returned entity IDs, block hashes, buyer
address, CID and endpoint remain as evidence. No runtime, journal, key, profile or
screenshot is exported.
