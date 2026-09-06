> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 retained A9 event review — September 6, 2026

Verdict: CLEAN for consistency of the retained projections, historical public
evidence and approved receipt fields. Independent offline comparison completed
at 2026-09-06T03:03:06.555Z. No new RPC request, key access, source change,
test suite, Git operation or payment action was performed. The probe was read,
not imported or executed.

## Scope and actual checks

Read the complete task6-a9-event-probe.ts and task6-a9-event-evidence.json, the
committed FeeSplitterV2 ABI, retained A9 public evidence.json, G4 occurrenceId
and installed graph-ts 0.38.2 ByteArray/Bytes implementations.

The retained public A9 artifact is dated 2026-09-05T04:38:07.372Z. The three
newer parent receipt observations are dated 2026-09-06T02:55:41.577Z,
02:55:41.902Z and 02:55:42.186Z. They are separate historical readback
checkpoints, not simultaneous observations or newly created settlements.

A fileless Bun command decoded each retained topics/data pair with the committed
JSON ABI through strict decodeEventLog. It independently recalculated the event
selector, checked the exact indexed-topic count and re-encoded all non-indexed
ABI arguments to the exact original data bytes. Every decoded field matched the
retained args, with address case normalized only for equality.

Opened the retained A9 SQLite database with readonly:true; selected only jobId,
skillId, settleTx, authorizationNonce, buyer and priceAtomic for the three exact
transaction hashes. No complete receipt row, signature, job output, session
capability or runner configuration was retrieved. The price projection uses
the actual store-sqlite.ts encoding, $.priceAtomic.__bigint. A preliminary
comparison treated that wrapper as a scalar and failed; correcting the review
query to the actual codec produced the matching result. This was a review-script
setup correction, not an A9 evidence defect or product regression.

Exactly three matching rows existed, one per target transaction. Skill IDs,
prices, nonces and buyers agreed. Both child buyers are the dedicated subbuyer,
not the payout seller. Database and WAL SHA-256 values matched before/after the
read; the handle was closed in finally. Private job IDs were used only in the
restricted local projection and are omitted from this report.

## Exact decoded facts and expected occurrence IDs

All three selected logs record emitter
0x9e304ec13dd862c81ee8caa8fd262dac426fbedf, matching the retained public evidence.
Atomic values below are six-decimal ERC-20 USDC amounts, not native gas.

| Skill | Event | Block / log index | Total | Seller | Fee |
| --- | --- | --- | ---: | ---: | ---: |
| loop-probe | SettledTree | 60523612 / 49 | 300000 | 285000 | 15000 |
| wallet-risk-note | Settled | 60523606 / 44 | 50000 | 47500 | 2500 |
| usdc-flow-check | Settled | 60523599 / 45 | 10000 | 9500 | 500 |

Each seller amount plus fee equals total. Each fee is total * 500 / 10000 with
exact integer arithmetic. The root buyer is
0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1; both child buyers are
0xd3ad4d10d4d24bd57740a5430ed5fd28c6824634. These equal the retained public
buyer/subbuyer and the restricted receipt projection.

### loop-probe

- Transaction: `0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d`
- Authorization nonce: `0x1546cff1d2ba559835a44199c22eadcd6adfcd786ba06e35c5d89b2b1558cb08`
- Observed block hash: `0x4aa380395dc2534a4ba333f137082a5c5acd1296841e57d7704d0b1e1e60bc67`
- Expected Graph occurrence ID: `0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d31000000`

### wallet-risk-note

- Transaction: `0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf656`
- Authorization nonce: `0x8e20189a948453ee6193e24e92e049050209e5bd444fa023325ec032e0c4d20c`
- Observed block hash: `0x83e0850d6abe11d0f9d3dfff9b556635dcd790622b1eb98003d0442828cda131`
- Expected Graph occurrence ID: `0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf6562c000000`

### usdc-flow-check

- Transaction: `0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be3`
- Authorization nonce: `0x4139f987892d44b414a3708552a6b699df8330ca5abe9444055b76363ec8084b`
- Observed block hash: `0xa74a8c2f3882cf3e1a02de3ee6f98f719b1782edbd2271853fc895186ec7cd10`
- Expected Graph occurrence ID: `0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be32d000000`

The root tree hash is
0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28.
Its emitted childCount is 2 and childTotalAtomic is 60000, matching the retained
public artifact and the exact sum 50000 + 10000. The restricted receipt
projection does not contain children, so this review does not recompute the
tree commitment or claim independent verification of the off-chain tree.

G4 occurrenceId requires 0 <= logIndex <= 2147483647 and calls
transaction.concatI32(logIndex.toI32()). Installed graph-ts writes four
little-endian bytes: indexes 49, 44 and 45 therefore append 31000000, 2c000000
and 2d000000. These are 36-byte Bytes entity IDs, not a textual hyphen/index,
big-endian suffix or new hash. The root occurrence ID would identify both
Settlement and TreeOccurrence in their separate entity namespaces; Tree uses
the emitted tree hash. This is a derived expectation, not a Graph query result.

## Projection and provider limits

The probe checks JSON-RPC envelope ID, transaction/status and log/receipt block
correlation, requires a single selected emitter log, rejects removed logs,
bounds log index, decodes exact target nonces/amounts and checks fee arithmetic.
Those checks are visible in source and the stored projection says observed;
the full RPC bodies were not retained here. Their rawBodySha256 and byte counts
cannot be independently recomputed from the projection. This review does not
re-establish status, emitter, block inclusion, canonicality or confirmations
against an independent provider or cryptographic proof. The endpoint and
receipt/log metadata remain parent-recorded observations.

The probe is a single-invocation observation script with top-level network work, not an
import-safe reusable module. This review grants no rerun authority. It did not
exercise transport timeout/cleanup behavior. No claim is made that a successful
receipt alone proves service delivery or that these three records establish
complete chain/registry coverage. G6 source activation, observed epochs,
graph-node/Studio indexing and public Graph query acceptance remain separate.

## SHA-256 inventory

```text
911c85125a09683fc78a59ae2d07170b4d0f7b701d21d4c7acfd8628ada07ee2  internal/task6-a9-event-probe.ts
0c2390f730be4fc0f4a495bcb590e0c51e9277153d9fe30cdc166d7f2872786c  internal/task6-a9-event-evidence.json
10586dce5813c2b29a2008a8dd77847b5cbd98e72bedb16289f07c3b6b82ea36  retained A9 public evidence.json
cebfd2284c59bafc22c2c87d52f548ac37592e0365ef1adbcf3b0f02620c7c99  subgraph/abis/FeeSplitterV2.json
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db  subgraph/src/ids.ts
7dd126ca769bddae9de8f35013f2d86d728f5382245c54f985f22c198c73563d  graph-ts/common/collections.ts
a209ba85773882b79b8147779c406fbb67a12dcb723ba7c4ea7ca3168e651cc8  retained A9 hub.sqlite
3afe72b782fd9a00dbe66a4ccb109c42b168820fbf17858b375fc7a6c4ba25e1  retained A9 hub.sqlite-wal
```

The retained private runtime directory is [retained private A9 runtime directory].
It is a local locator, not a publicly published artifact or an instruction to
resume its processes. No private executable, database or journal was copied.
