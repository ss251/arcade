> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 retained indexed-match review — September 6, 2026

Verdict: **CLEAN for local consistency of the retained indexed proof with the
independently reviewed A9 event projections and actual mapping/schema.** This
review made no network request and is not an independent live observation.

## Scope and actual comparison

Fully read the parent-retained `query-02.json`, `meta-06.json`, `meta-07.json`,
frozen indexed-query helper and its independent review, retained A9 event JSON
and independent review, and current fee-splitter mapping, IDs and schema. These
three query/metadata basenames identify the parent's retained G6 Studio live
record, not public artifacts or instructions to rerun it. SHA256 pins below
disambiguate the exact files without publishing private runtime locations.

A fileless `bun --no-env-file -e` comparison completed with **117 assertions,
exit 0**. It read only these retained files, used exact BigInt arithmetic and
manually derived four little-endian log-index bytes, without importing or
invoking the network helper. No test suite, build, Graph command, key access,
signing, funding, deployment, source mutation or Git operation occurred. Only
this private report was written. No process remains running.

The retained query records one keyless POST, HTTP 200, completion
`2026-09-06T05:07:47.534Z`, 2868 response bytes, and observed proof for deployment
`QmWL6jCCNvRkmB3mvPaxvMH7931AvQ5Y7jmBzCJ2gdpjHF` at the fixed versioned endpoint
`https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0`.
Recorded request SHA256 is
`dce8b3546570a6c663de8b8ffdbed8316c05eefb312b8dbc1f33927cd81bb853`;
recorded response SHA256 is
`d3ac4eedde54b003611fd7bb87dbc8e6a7e83fe22c1a3764c05bc24e3ca7963e`.
Those transport facts and raw-body digests remain recorder observations; this
review did not reconstruct or independently hash either raw HTTP body.

## Exact event and tree agreement

Exactly three distinct settlements, transaction hashes, occurrence IDs and
authorization nonces are retained. Every buyer, nonce, amount, emitter,
transaction, block number and derived log coordinate agrees with the A9 JSON.
Retained ABI data words independently agree with all nine monetary fields;
indexed topic words agree with the three buyers/nonces and root tree hash.

| Event | Block / log | Total atomic | Seller atomic | Fee atomic | ID suffix |
| --- | --- | ---: | ---: | ---: | --- |
| Root SettledTree | 60523612 / 49 | 300000 | 285000 | 15000 | `31000000` |
| Settled | 60523606 / 44 | 50000 | 47500 | 2500 | `2c000000` |
| Settled | 60523599 / 45 | 10000 | 9500 | 500 | `2d000000` |

All amounts are six-decimal ERC-20 USDC atomic integers. Seller plus fee equals
total for each row; each fee is exactly 500 basis points. All three emitters are
`0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`, with source `static` and canonical
listing `null`. These properties match the mapping and selected-source policy,
not an inferred seller/skill assignment.

The 36-byte occurrence IDs are exactly:

```text
0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d31000000
0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf6562c000000
0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be32d000000
```

`Settlement` has no persisted logIndex field: the helper's projected logIndex
is an expected coordinate checked through the actual entity ID. The separate
`TreeOccurrence.logIndex` is a queried field. No nonexistent schema field is
being treated as returned evidence.

Tree `0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28`
has the first ID above as root, occurrenceCount `"1"`, ambiguous `false`,
childCount 2 and childTotalAtomic `"60000"`. The one retained TreeOccurrence
has that same ID/root, tree hash, emitter, root transaction, block 60523612 and
log 49; its exact BigInt childCount is `"2"`. Root settlement, Tree and
TreeOccurrence timestamps all equal `"1788583083"`. Other settlement timestamps
are `"1788583080"` and `"1788583076"`; all are canonical uint64 text. The two
ordinary settlements retain tree `null`. Their totals sum to 60000, but neither
this arithmetic nor the emitted hash independently proves their off-chain
parent/child relationship or reconstructs the receipt-tree commitment.

Marketplace remains `null`; the proof records empty registry/canonical tables.
The frozen verifier requires six actual first:1 selections to be empty and
rejects any extra/missing selected settlement or second tree occurrence. This
review checked the resulting projection, not newly queried rows. Absence is not
a fabricated zero marketplace count, registry-history completeness claim, or
canonical Listing/Splitter ownership.

## Checkpoint ordering and limits

The retained indexed height is 60694598, above the minimum root block 60523612,
with hasIndexingErrors `false` and well-formed recorded block hash
`0x1e8ff29a2e39d39ce6943a2dee393e207545f65194e4256a60bab8b3baacd480`.
Prior meta-07 completed at `2026-09-06T05:06:09.826Z`, HTTP 200, same CID,
hasIndexingErrors `false`, block 60694417: a recorded increase of 181 blocks.
Its graphQLErrorCount is `null`, not a claimed zero count. Meta-06 records
unavailable with null HTTP status/body/hash/meta; the parent attributes that
attempt to sandbox denial, and it supplies no remote-response evidence.

Raw query/RPC bodies are not retained in these projections. The stored helper
result contains normalized and checked expected fields, not independent raw
response copies. The current helper/source pins match the earlier reviewed
checkpoint, but this review does not independently attest which code ran live,
re-establish transport counts/status, or recompute raw-body hashes. Earlier
files outside this selected inventory were not re-audited here.

Block hashes, indexed height and timestamps remain provider observations: no
independent header inclusion, canonicality/finality, current-head or Studio
Synced assertion follows. A9 receipt projections have no block timestamps, so
timestamp coherence is not independent timestamp verification. This evidence
does not prove service delivery, complete chain/registry coverage, per-listing
settlement attribution or global marketplace statistics. It authorizes no
further query, purchase, Arc paid action or G15 Base payment. H7 geometry stayed
frozen; no H8 work was performed.

## Exact SHA256 inventory

```text
5bf21eb595923eb25b8eeb2a273f8093283a951f14021953ffced314bd3e296d  retained query-02.json
b75b2adf0446396f5a9ba809559c3478edb72c8c306bea60d01874fe3a18726f  retained meta-06.json
1d42ba40058c4f16e419b0a00bb4b6402a9bfb18cb90fdff1e3b9f5abe1e2a6a  retained meta-07.json
eef1fbab2d2319bb4da3db310c3f8b375f4ade67c8d66b8b765cfd430a0c38bb  internal/task6-indexed-query.ts
2ea1acb7a29527686e147e7239b5483bc427e96a3734892b4f2a538f22e5232a  internal/task6-indexed-query-review.md
0c2390f730be4fc0f4a495bcb590e0c51e9277153d9fe30cdc166d7f2872786c  internal/task6-a9-event-evidence.json
57847b3125698fb28d70acb9e5c4cc266d53e82ed75376d6afe0b0bc3d27f01c  internal/task6-a9-event-review.md
eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db  subgraph/schema.graphql
50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642  subgraph/src/fee-splitter.ts
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db  subgraph/src/ids.ts
```

All previously pinned helper/evidence/schema/mapping files matched before/after
the local comparison. No change or correction is requested.
