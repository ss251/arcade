> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 private indexed-query helper — offline author evidence

Final source checkpoint 2026-09-06 03:55:10 UTC. **14 Bun tests / 135 assertions pass**, exact two-root strict diagnostics **0**. No actual Studio/Graph/RPC request, credential lookup, payment, deployment, build, shared-source edit, Git or full-suite invocation.

## Inputs and scope

Fully read actual `subgraph/schema.graphql`, complete G4 `fee-splitter.ts`/`ids.ts`, the retained A9 event JSON/probe/review, and current G6 parent decisions. The probe was read only, not imported/executed. No private SQLite/job/receipt data was opened. Read the TypeScript testing skill and used focused failure-first tests, boundary mutation assertions and an isolated inert-import check.

The helper contains only the three exact reviewed public event projections. All use emitter `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`. Occurrence identity is the actual graph-ts `txHash.concatI32(logIndex)` representation: four **little-endian** bytes appended to the 32-byte transaction hash. Root index49 suffix31000000; the other two indexes44/45 suffix2c000000/2d000000. These are not new hashes or textual IDs.

## API and exact proof

- `verifyIndexedEvidence(unknownResponse, explicitCid)`: bounded own-data projection; fixed `Indexed A9 evidence refused.` on mismatch/reflection failure. Returns immutable selected proof only.
- `createIndexedQuery(explicitCid, explicitFetch, {signal?,timeoutMs?})`: returns one no-argument operation, latched before evaluation. **No CLI or default transport exists.** CIDv0 must decode to a full sha2-256/32-byte multihash; the consumed G1 CID is refused. This is format checking, not authority to choose an unreviewed deployment.
- Fixed endpoint: `https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0`. Exactly one POST, omitted credentials, no auth/payment/session headers, redirect:error, no loop/retry/fallback.
- `_meta.deployment` must equal the explicit CID, `hasIndexingErrors` must be false, and integer block number must be at least60523612. A well-formed returned meta block hash is retained as a provider observation.
- Query all settlements for the **three transaction hashes**, `first:4`, not only the three desired IDs. Require exactly three distinct expected occurrences and exact IDs/buyers/total/seller/fee/nonces/transaction/block/emitter. Any missing, duplicate, conflicting or extra selected-transaction occurrence fails. Splitter source must be static and canonical listing null. Non-tree settlements must have tree:null.
- Query the exact root Tree plus `treeOccurrences(first:2, where:{treeHash:...})`. Require exactly one expected occurrence; exact root/occurrence IDs, emitter, hash, block/transaction/log; childCount2, childTotalAtomic60000; Tree occurrenceCount1 and ambiguous:false. Root and occurrence references must agree.
- Require `marketplace(id:"arcade")` null and empty first:1 queries of registryEvents, agents, listings, listingClaims, feedbacks and validations. No missing entity is fabricated as a zero count. These are the selected schema's empty-table observations, not complete chain coverage.
- Observed result contains only endpoint/observation time, exact request and raw-response SHA256/byte count, and the validated immutable proof. Refusal is local fixed text, never provider diagnostics. Raw provider response bytes are not persisted by this helper; parent owns retaining results/source pins and any actual invocation.

## Transport bounds

Default whole-request monotonic deadline8s, configurable only within1..10000ms; checks before dispatch and around every read. At most65536 response bytes with exact supplied Content-Length, fatal UTF-8, HTTP200/JSON/identity encoding, no redirected/foreign response URL. Each retained source chunk is cloned; at most1024 consecutive empty chunks. Bounded100ms cancellation for stalled or late responses, no late evidence acceptance. A partial GraphQL errors response or extra envelope field fails closed. The same operation cannot be evaluated twice or concurrently to produce another request.

## Chronology and verification

1. Initial five collected tests captured **0 pass / 5 missing-module failures**, no behavioral assertion reached. This was API/setup absence, not five reproduced product defects.
2. Parent paused this helper for deployment cleanup correction and the sole local full gate. The exact initial test bytes were preserved with apply_patch as an uncollected `.txt` draft, SHA `0fd0ba09bfb1e41b7b90087c59f916356754001b7f96b4f92c30f7ad355f5a0e`; restored unchanged only after explicit gate-complete release. No incomplete query test was included in that local-code gate.
3. First helper implementation: **5 pass / 56 assertions**. Expanded actual-input mutation/transport/inert-entry coverage: **14 pass / 135 assertions**. These additional tests passed immediately; no behavioral Red is claimed.
4. First strict check found one test-only `Headers.keys` typing diagnostic under the root libraries. Using supported `Headers.forEach` preserved the assertion and produced exact two-root strict0.
5. Final repeat: **14 pass / 135 assertions /177ms**, exit0. One owned native Bun import child had injected global fetch that throws if touched, hostile ambient network selector, empty stderr, fixed inert output, exit0 and awaited exact child reaping. No runtime child remains.
6. Supplemental fileless check parsed the actual captured request through installed `subgraph/node_modules/graphql`: one query operation with11 expected root fields. This proves syntax only, not acceptance by a deployed graph-node schema. Its injected response was deliberately refused; no network occurred.

Focused command:

```sh
env -i PATH=[BUN_BIN_DIRECTORY]:/usr/bin:/bin [BUN_BIN_DIRECTORY]/bun --no-env-file test internal/task6-indexed-query.bun.test.ts
```

Exact strict verification read/parsed absolute GROOT tsconfig and created a TypeScript program containing only the two absolute helper/test roots, preserving config options with strict:true/noEmit:true. Final diagnostics0.

## Evidence limits

Settlement has **no logIndex field**; its coordinate is checked through the exact ID suffix and reported from the pinned expected log. TreeOccurrence exposes and validates logIndex directly. “Seller” means emitted sellerAtomic, not independent per-skill/seller/registry assignment.

Receipt evidence does not contain timestamps. The helper requires canonical uint64 decimal timestamp text and equality of the indexed root settlement, Tree and TreeOccurrence timestamps; it deliberately does **not** assert exact chain timestamps. The synthetic test accepting a consistently changed root timestamp makes that limit explicit. Meta block hash and current indexed height likewise remain provider assertions, not independently verified block headers, receipt inclusion proofs, canonicality or current-head/Studio-Synced evidence.

An emitted tree hash/count/total does not prove off-chain lineage, child assignment, tree commitment contents, delivery, margin or per-skill attribution. Three exact historical events and two reviewed static emitters do not establish full marketplace/ERC-8004 coverage. Expected row matches are historical readback only, not authority for another Arc purchase or G15 paid execution. **Live evidence remains NOT RUN.**

## SHA256 inventory

| Path | SHA256 |
| --- | --- |
| `internal/task6-indexed-query.ts` | `eef1fbab2d2319bb4da3db310c3f8b375f4ade67c8d66b8b765cfd430a0c38bb` |
| `internal/task6-indexed-query.bun.test.ts` | `ede1c60e0f10e55c80465ddfb5f267c5ec4db52f80ef7d613cb8cc4d312133e8` |
| `internal/task6-a9-event-evidence.json` | `0c2390f730be4fc0f4a495bcb590e0c51e9277153d9fe30cdc166d7f2872786c` |
| `internal/task6-a9-event-review.md` | `57847b3125698fb28d70acb9e5c4cc266d53e82ed75376d6afe0b0bc3d27f01c` |
| `subgraph/schema.graphql` | `eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db` |
| `subgraph/src/fee-splitter.ts` | `50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642` |
| `subgraph/src/ids.ts` | `cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db` |

Both separately frozen deployment-command files remained unchanged (`6e139731…`, `8ce1071a…`). Parent/independent review and any separately released actual query are pending.
