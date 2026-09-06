# G6 — acknowledged deployment, indexing pending

September 6, 2026. Local implementation committed as
`8532df81d965c7ebf675cc4a40462a89d9412c2f` after its sole full gate and independent
source/publication review. A fresh no-payment v0.1.0 deployment is now
acknowledged. **Task6 indexed-event acceptance remains open.**

## Exact remote operations

One keyless public-build upload completed at 03:59:52.062 UTC with no timeout,
exit0 and unchanged reviewed build hashes. The installed CLI uploaded only
manifest-reachable schema/ABI/WASM artifacts and the transformed IPFS-linked
manifest. No orphan directory contents, credentials or private runtime files
were selected. Returned CID:

`QmWL6jCCNvRkmB3mvPaxvMH7931AvQ5Y7jmBzCJ2gdpjHF`

The committed bounded consumer then used one fresh owned journal and one Studio
POST for `arcade-ledger-arc-testnet` / `v0.1.0`. It read the deployment key only
inside its process. The retained journal has prepared at 04:01:11.852 UTC,
dispatch intent at 04:01:11.871 UTC and completion at **04:01:17.711 UTC**.
Consumer exit0 and the projected acknowledgment returned the exact
[versioned query URL](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0).
This fresh deployment operation is consumed; do not replay it. G1 stays unchanged.

The independent retained-record audit verified the three-row hash chain/policy,
real owned0700 directory, single-link0600 journal, upload/result correlation,
twelve reachable build files and all thirteen frozen source pins. This is local
record consistency, not remote packet capture, authenticated journal evidence,
independent IPFS retrieval or proof of indexing. The consumer's success CID is
captured request policy, not an independent remote CID echo.

## Actual readbacks, not successful indexing

| Read | UTC | Observation |
| --- | --- | --- |
| Exact A9 proof query, one keyless request | 04:03:58.766 | HTTP200, strict proof refused; body hash/meta unavailable through this helper |
| Separate metadata-only diagnostic | 04:05:36.266 | HTTP200, one GraphQL error, no meta; complete body204 bytes |
| Explicit startup-error diagnostic | 04:08:15.957 | Same204-byte body/hash; service reports this exact CID has not started syncing |
| Later metadata progress observation | 04:14:55.681 | Exact CID, block10795110, hasIndexingErrors:false; A9 height not reached |

The two diagnostic bodies share SHA256
`1339d802e9dc8f1a7cecc85ab155788e5acd793ac26c35f6897cc8104d103b19`.
Only bounded selected diagnostic facts/hashes are retained here; raw bodies are
not published. No indexed height, Tree, Marketplace result, Studio Synced status
or unsupported-network failure is inferred from these startup responses.
There was no automatic retry loop, redeployment, payment or payer-key lookup.

The later read shows indexing has now started: exact `_meta.deployment`, block
**10795110**, hash `0xa3fe77d8b06c834e3bd6a4600b6e1314ea74b46a05f8810a815133a9ec6964d7`,
and `hasIndexingErrors:false`. Its212-byte body has SHA256
`1327aaebc532e5302fb4ee2f76b518e26b480c0a750c5180da458a6b4c0eef47`.
This supersedes startup absence only; the required A9 height60523612 has not
been reached. No full proof query was repeated at this partial height.

The offline proof helper requires exact CID/no indexing errors/minimum height,
the three known A9 transaction/log occurrences and emitted money/nonces, one
unambiguous root tree occurrence, null Marketplace and absent registry/canonical
tables. It passed14 Bun tests/135 assertions and exact strict; independent review
repeated those, validated the query against actual persisted fields with modeled
Graph facilities, and passed18 additional unsigned assertions. These are offline
checks, not a substitute for the missing live result.

## Preserved records and next step

- [Upload/deployment retained-record review](task-6-live-deployment-review.md)
- [Indexed-query author report](task-6-indexed-query-report.md)
- [Independent indexed-query review](task-6-indexed-query-review.md)
- [Parent evidence review and sole full gate](task-6-live-parent-review.md)
- [Current subgraph operator notes](../../../../subgraph/README.md#september-6-2026--g6-deployment-acknowledged-indexing-pending)

Four historical copies preserve exact bodies under the standard banner; only
two personal Bun-bin paths in the query author report are redacted. Runtime
helpers, journals, private databases, keys and owner handoffs remain uncommitted.
The sole evidence-commit full gate passed2941 Vitest/131 files,829 Bun/51 files/
5770 assertions and root/web strict. Final publication audit follows.
Wait for index progress and make a separately chosen bounded read; never repeat
the consumed deployment. Existing A9 events supply proof without another purchase.
Two selected settlement emitters are not complete marketplace/registry coverage
or historical per-skill ownership, regardless of future indexing success.

Later bounded metadata observation at04:22:41.170UTC: exact CID, block16005110,
hasIndexingErrors:false;212-byte body SHA256
`1bbd66a5b5a3dfc18283f5ec160b49184d3d12a3fc38c490f90e318b26289a68`.
A9 height remains pending. No full proof query was repeated.
