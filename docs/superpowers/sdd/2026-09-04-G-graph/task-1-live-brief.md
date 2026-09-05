# G1 partial live checkpoint — September 5, 2026

The owner-approved single Studio deployment was acknowledged and its returned
endpoint subsequently served data. **G1 is not complete:** no indexed settlement
or known-runbook match has been demonstrated. G2–6 remain gated. This follow-up
supersedes earlier owner-pending statements without rewriting their historical
reports; it does not release another deployment, upload, payment or chain action.

## Approved operation and observations

The parent invoked the independently reviewed private one-shot helper against the
already-uploaded CID `QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`.
The fixed JSON-RPC operation was `subgraph_deploy`, name
`arcade-ledger-arc-testnet`, version `v0.0.1-smoke`, at the Studio deploy endpoint.
A private append-only journal records intent at `2026-09-05T13:24:11.804Z` and
deployment acknowledgement at `2026-09-05T13:24:16.472Z`. The returned
[versioned query endpoint](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke)
is the actual provider result. This was not a re-upload, CLI-auth/config write,
automatic retry or paid Base query. No credential or executable helper is published.

The following UTC observations are separate evidence, not one continuous proof:

| Time | Observer / authorization | Result |
| --- | --- | --- |
| 13:26:34 / 13:26:35 | Parent; unauthenticated and Bearer | HTTP 200 with GraphQL startup errors, no usable data |
| 13:27:36 | Parent; keyless diagnostic | Reported that the CID had not started syncing |
| 13:36:11.268 | Independent reviewer; unauthenticated | HTTP 200 with data, exact CID, block 5,481,110, no indexing errors; latest and exact known-transaction lists empty |
| 13:45:02.316 | Parent; authenticated | HTTP 200 / `query_ok`, exact CID, block 16,195,110, no indexing errors; both lists empty |

The independent block hash was
`0x2acb733775f2e79a5db2309fbd1fe9664b66cb3b736bbbff801b1ced4c7134bb`;
the later authenticated block hash was
`0xf751e029859ce898431609f689e695d91a93e38c7e322a4b1eecbf402dae8ac0`.
The exact known-transaction filter targeted the retained runbook transaction
`0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2`.

Both authorization modes served data at different times; unauthenticated access
worked at the recorded instant. This is not a permanent authentication or
rate-limit policy. Increasing indexed heights and `hasIndexingErrors: false`
do not prove current-head synchronization. An HTTP 200 alone is not GraphQL
success, and an empty list is not evidence that a historical settlement never
occurred. No indexed amount, buyer or settlement match is asserted here.

## Registry, historical receipt and mapping limits

The parent read the primary [networks registry](https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json)
at `2026-09-05T12:40:45.759Z`: version 0.7.119, updated
`2026-09-04T20:20:59.504Z`, with `arc-testnet` / `eip155:5042002`, the Studio deploy
endpoint and `issuanceRewards: false`. These fields do not establish decentralized
publication, reward eligibility or Graph x402 support for this subgraph. The
Base-mainnet cost-of-goods skill uses a separate upstream service and authority.

The parent separately observed that current public RPC receipt reads did not
find the historical `9a706d57…` and `6366215e…` runbook transactions, while the
pilot still had 2,737 bytes of code and a newer C10 receipt was readable. The
independent reviewer did not repeat those RPC requests. Their absence is retained
as a current-read limitation; historical reports are not erased, rewritten or
replaced with a newly purchased receipt.

The unchanged smoke manifest still targets only the v1 pilot
`0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206` and ordinary `Settled` events from block
0. It does not index a newer V2 splitter, trees or ERC-8004 registries. The newer
C10 receipt is therefore not proof for this mapping. No fresh independent IPFS
download occurred in the evidence audit. CID equality correlates deployment and
query responses; it is not a second download/rebuild of uploaded bytes.

## Retained reports and publication boundary

- [Original local brief](task-1-brief.md) and [local implementation](task-1-report.md).
- [Original private-runtime implementation checkpoint](task-1-live-runtime-report.md).
- [Superseding independent runtime security review](task-1-live-runtime-review.md).
- [Independent deployment and keyless-data observation](task-1-live-evidence-review.md).
- [Current operator notes](../../../../subgraph/README.md) and [progress](progress.md).

The original runtime report is deliberately historical: its provider-prose
sanitizer claim and source/test hashes were superseded by the subsequent genuine
two-regression correction to fixed local error wording. The security follow-up
records 19 Bun tests / 134 assertions and exact strict TypeScript success; it does
not turn offline tests into live deployment evidence. The evidence report ends
at its own 13:36 observation and predates the parent authenticated read above.

The three selected report copies add the standard historical banner. Only the
evidence copy additionally substitutes a generic private-journal label and local
file-owner label. Original bytes remain unchanged; exact substitutions and
fingerprints are retained in the private publication audit. Plain non-clickable
repository-relative source references are historical provenance, not links to
private files. No runtime source, keys, journal, owner handoff or internal research
is exported. This is a review of the selected publication, not a whole-repository
secret-scan claim.

## Documentation verification and next gate

The existing sixth scaffold contract was updated to require the dated partial
status rather than current owner-pending claims. At 13:55:02 UTC it genuinely
failed against the old README: five passed, one failed. After the dated README
change, all six passed / 36 assertions by 13:57:08 UTC. ABI, schema, mapping,
manifest, package and lock fingerprints remain unchanged; no build or live test
was rerun for this documentation update. The TypeScript testing skill guided
failure-first documentation coverage without weakening the source contracts.

Publisher checks by 14:00:34 UTC verified all three exact banner/substitution
copies, all 43 local links across the seven selected documents, unchanged original
report and smoke-source fingerprints, and no personal paths or private clickable
targets in those documents. The exact root compiler options applied to the nested
scaffold test produced zero diagnostics; the final six-test rerun / 36 assertions
and diff check passed. This targeted review is not a whole-repository secret scan.
Parent independent review and the separate full test/type gate remain pending
before publication's commit; this checkpoint does not claim either has completed.
Canonical F-before-G dependencies still apply; no G2–6
release, fallback activation, full live PASS, push or history rewrite is implied.

### Parent follow-up after publication freeze

The [parent review](task-1-live-parent-review.md) records independently repeated
copy, hash, privacy, link, scaffold and exact strict checks, followed by the full
test/root-and-web-type gate (exit 0) and an actual successful local WASM build.
It also records a later keyless read at 14:10:24.097 UTC: exact CID, indexed block
42,441,110, no indexing errors, and still empty latest/known settlement lists.
The earlier reports remain unchanged historical checkpoints. G1 stays partial.
