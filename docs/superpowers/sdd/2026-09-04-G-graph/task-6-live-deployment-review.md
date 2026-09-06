> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 live deployment — independent retained-record review

September 6, 2026. **CLEAN for the retained local upload/deployment evidence.**
Checks completed at 2026-09-06T04:04:08.724Z. This establishes internal consistency of
the recorded acknowledgment and reviewed source/build, not indexing, synchronization
or an independent observation of the remote service.

## Scope and method

Read all five specified records in the retained private G6 deployment directory:
intent.md, upload.json, reviewed-deployment.md, deployment.jsonl and
deployment-result.json. Read the full build inventory, current compiled manifest,
complete fixed deployment consumer, installed graph-cli0.98.1 build command and
the relevant compiler compilation/upload traversal. Inspected file metadata and
performed fileless local YAML/JSON decoding and SHA-256 comparisons.

No key, Keychain/security command, credential/environment lookup, deployment
consumer execution, upload, HTTP/RPC query, build/codegen, product test, full gate,
Git command or process replay occurred. Only this private report was written.
The retained files and reviewed source/build were not modified.

## Exact recorded operation

The public-upload record reports one finite invocation from
2026-09-06T03:59:37.111Z to 2026-09-06T03:59:52.062Z: exit0, timedOut:false.
Its captured CLI output returns:

```text
QmWL6jCCNvRkmB3mvPaxvMH7931AvQ5Y7jmBzCJ2gdpjHF
```

The subsequent reviewed-deployment selection pins that exact CID and consumer
source hash, fixed slug arcade-ledger-arc-testnet and version v0.1.0. It identifies
this as a fresh no-payment G6 operation, not consumed G1. Commit identity is
parent-recorded; no Git query was performed by this review.

Exactly three complete newline-delimited journal records exist, totaling1799 bytes
under the consumer's16KiB cap. Each has the exact format/row key set, sequence
0/1/2, matching fixed policy, correct predecessor and independently recomputed
SHA-256 of the exact JSON row excluding its hash field.

| Sequence | Phase | Recorded UTC time |
| ---: | --- | --- |
| 0 | prepared | 2026-09-06T04:01:11.852Z |
| 1 | dispatch_intent | 2026-09-06T04:01:11.871Z |
| 2 | completion | 2026-09-06T04:01:17.711Z |

The first predecessor is exactly64 zero characters. Later predecessors match
the prior stored/recomputed hashes. Policy is constant across all rows:
endpoint https://api.studio.thegraph.com/deploy, the exact uploaded CID,
the fixed slug/version, and versioned query URL below. There are no additional
unknown/retry/prepared rows or extra event fields.

The completion result exactly equals deployment-result.json's result; the latter
records exit0 and collection at04:01:32 UTC. Both report status:deployed and:

```text
https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0
```

Upload completion precedes all deployment phases, and journal times increase.
The5.840-second dispatch-intent-to-completion interval is a recorded phase interval,
not an independent measurement of total process or native-child lifetime.

## Filesystem ownership and journal limits

The containing directory is canonical, real/non-symlink, current UID501-owned,
mode0700. All inspected ancestors are actual directories, not symlinks.
The journal is an ordinary current-user-owned0600 file with one hard link.
The four surrounding public-policy/result records are ordinary0644 single-link
files inside that0700 directory; they are not claimed to be0600 themselves.

The current consumer matches the approved corrected source. It creates an
exclusive NOFOLLOW journal, checks descriptor/path/parent identity, records and
fsyncs prepared before key acquisition and dispatch_intent before one POST.
The stored sequence is consistent with that implementation. An after-the-fact
local file cannot independently prove historical fsync execution, prior path
absence or all process/request activity. Its unkeyed hash chain detects ordinary
corruption, not a same-user writer who replaces and recomputes evidence.

The CID in the consumer's projected success is its captured request policy;
the remote result predicate validates the exact versioned queries URL. It is not
a remote CID echo or independent proof that the service indexed that content.
The raw deployment HTTP body/headers are not retained in these records. This
review therefore does not reconstruct/authenticate a raw response or add a
stronger server-side acknowledgment claim than the bounded consumer projection.

## Exact allowed upload inventory

Inventory SHA256 1574b928d3c42ee7f9c3f92aba126be9be64f0801da8afec71d977c848def368 matches intent.md.
The rendered input manifest matches its recorded
2218823d7213e245f570884e71bf2b000397938f3c3430645aa1a3e24718302e.
All twelve listed build files match their retained byte lengths and SHA-256;
each is an ordinary non-symlink file contained under the selected build root.

Parsing the compiled manifest independently yields exactly the same reachable
set: one manifest, one schema, six ABI paths and four WASM paths. Two static
sources are A9 at60460646 and the pilot at the explicit historical0 exception.
Both, plus the V2 template, reference the same FeeSplitterA9 WASM. Four templates
remain declared but inactive; no registry address/start epoch is introduced.

Installed CLI upload logic visits only schema, active/template ABI references,
mapping references, then an in-memory manifest whose file references become
IPFS links. It does not recursively upload the build directory. Its thirteen
logged artifact visits exactly match the manifest-derived traversal order.
Three content-cache hits explain repeated identical mapping/ABI content.
The old FeeSplitterSmoke/FeeSplitterSmoke.wasm exists locally but is neither
reachable nor present in upload log visits. No orphan upload is indicated by
this traversal/log comparison.

The local build manifest hash is not the CID of the uploaded manifest: the CLI
serializes a transformed, sorted-key IPFS-linked document before uploading.
That exact transformed document and raw IPFS responses are not retained here.
I did not independently recompute the UnixFS root CID, fetch it, or verify remote
pin/storage persistence. The log-to-inventory result is local evidence correlation,
not packet capture or independent remote receipt of every byte.

## Current-source stability and remaining work

All thirteen source/document files in the current parent-review inventory still
match their frozen hashes, including deployment source
6e1397318b7f30e47842dc8fbd25994034fa33cd6cb084ba440fe3d1aca14de2.
The historical build inventory's uploaded:false remains its pre-upload checkpoint;
upload.json records the subsequent operation without rewriting that history.

No indexing/query result was inspected here. Exact-CID A9 occurrence/tree queries,
_meta height/no-indexing-error checks and Marketplace:null remain separate proof.
An acknowledgment does not prove Studio Synced, current-head finality, canonical
per-skill assignment, registry history, or a newly paid call. Nothing here permits
retry, a new journal for uncertain replay, or another G1/G6 deployment.

## Retained record fingerprints

Leaf names identify the reviewed private directory; they are not public download
links. No private executable, journal or raw evidence is copied by this report.

```text
3797a30cacfb65f134d9a542e3a07bbdd9c61542f6f4e563762f2395591c29f7  intent.md
c0ec139cbed775f4f7905c70c533c0c9e5c1397ddc230bdee97cf0662902c051  upload.json
49ecb9d05f3e14edf07f111bf7a2a33eecb5a898be6941194f3c2cd04283b767  reviewed-deployment.md
199fab59f5a0d19cf2830c592b1f95c5ae0146aa2412077b5b659327185eb498  deployment.jsonl
db248255ef82cf24b0b71c0a8e6608aad227768b60c8bdd5d93eb12c353240d6  deployment-result.json
1574b928d3c42ee7f9c3f92aba126be9be64f0801da8afec71d977c848def368  internal/task6-build-inventory.json
7cc558005a0014a7566df39cbea7aefe22d0e6045d76cac2bd6058d897f927d3  graph-cli0.98.1/dist/compiler/index.js
b02150f559ea9922d749e84519f86439b12a2d0841729001cb8d7a8aee4388e3  graph-cli0.98.1/dist/commands/build.js
```

## Matched current build fingerprints

```text
e124099458d97698ab2ece233d1acef2e33d2fe3c0131a2f4f9a026ccb503bef  subgraph.yaml (4760 bytes)
1a0a43b3d5f9300eeeb5530b2e0f41a165a07b7b2bc07e6fd6da5467c1abc6e4  FeeSplitterA9/FeeSplitterA9.wasm (42058 bytes)
392038015eb7c4567df7e564ca50025350091fca59dbb27a71c6184ee6c85adb  FeeSplitterA9/FeeSplitterV2.json (1459 bytes)
54f9ecd000608cb0022a3b13addc6c9d30087bf0a563be35df9445c5655315a4  FeeSplitterSmoke/FeeSplitter.json (754 bytes)
392038015eb7c4567df7e564ca50025350091fca59dbb27a71c6184ee6c85adb  FeeSplitterV2/FeeSplitterV2.json (1459 bytes)
da871843f9c24fb81d6cdf51b9027b39888d2ced2b1ebc9fc24cfb731c9e5d37  IdentityRegistry/IdentityRegistry.json (1651 bytes)
c765e8b1b9e3bb612d7a75db6040b002a3eefd252d4f1513caa2ea018198e01c  ReputationRegistry/ReputationRegistry.json (1574 bytes)
b87e993e934abf78dd81977e077aeae5c4f6834c7717b1659227e8019b41f1a2  ValidationRegistry/ValidationRegistry.json (1299 bytes)
eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db  schema.graphql (5842 bytes)
c23f552b52ec2f52a29e6f6acced3ab20ed1ae14eb8124583a501c664e9fd67a  templates/IdentityRegistry/IdentityRegistry.wasm (49381 bytes)
abc033b9e81b71a90c6fc07a1d8d19483786a9e9376c3a4c4b94750bb21ba861  templates/ReputationRegistry/ReputationRegistry.wasm (49112 bytes)
5f5241c8459f224e1aca44ad037e0dbbfae9a1337f691f5c92c074b5ec8988d5  templates/ValidationRegistry/ValidationRegistry.wasm (47087 bytes)
```

