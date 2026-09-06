> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G4 parent decisions — September 6, 2026

Prepared after G3's source/build/full-gate pass. Implementation release occurs
only in the parent's explicit post-G3-commit message; this preparation alone is
not a release. Full G4 readiness and runtime provisioning notes were read.

Later release: G3 committed e00cd89d1845d32660ddd5fa1ec3b181cd55a457 with27
reviewed paths; parent explicitly released the below G4 scope to B9 afterward.
G3 publication review CLEAN8copies/6transforms/11files/69local links, all15source
pins; the extra copied-report final newline was corrected before commit. No
second full G3 gate ran. Original G3 source and reports remain historical.

## Scope and concrete behavior

The author may own ids.ts, fee-splitter.ts, tests/fee-splitter.test.ts,
matchstick.yaml, plus the narrow build-manifest.ts/subgraph.template.yaml,
checks/manifest.bun.test.ts/checks/scaffold.bun.test.ts/checks/schema.bun.test.ts,
package.json and README transitions needed by the new actual handlers. Preserve
the historical smoke.ts and G1 schema fixture bytes. No root package/lock/schema,
hub, wallet, payment, registry mapping or arbitrary new source changes.

Retain exactly the approved pilot static source and v1 Settled event. Point its
active mapping at the new settlement handler through the existing compatible
event prefix; consume event fields explicitly, with no SettledTree-to-Settled
reinterpretation. An inactive FeeSplitterV2 template may generate typed events
and compile both real handlers, declaring Settlement/Splitter/Tree/TreeOccurrence.
It must never be instantiated in G4. No registry sources or no-op mappings.
No new emitter, metadata context, listing binding or provenance is inferred.

Implement splitterFor, agentEntityId and ARC_CHAIN_ID helpers, but no misleading
marketplace get-or-create helper. Marketplace remains absent until a later
explicit complete-coverage policy is implemented and proven. Agent/Listing must
remain absent throughout G4. Discovery source/firstSeenBlock are observation
facts; preserve them and nullable canonical listing when updating a splitter.

Transaction hash plus log index owns all deduplication before any counter/entity
mutation. Preserve concatI32 IDs for valid existing signed-Int indices; for
out-of-range or negative synthetic log indices fail deterministically before
writes, never truncate to an alias. Test that rejection with the actual runtime.
Event totals/fee/nonce/block/timestamp stay exact BigInts, no recomputed money.
Every unique tree event gets immutable TreeOccurrence with full uint32 count.
Summary preserves first scalar facts; second distinct occurrence clears root and
makes ambiguity permanent. Replays change nothing. Summary childCount is unset
above2147483647, with exact value retained on occurrence. Store absence must be
tested directly, not the generated getter's zero default. Include0/max signed/
max signed+1/maxuint32, large money, cross-emitter collisions and replay tests.

## Actual runtime and honest chronology

Use only the already provisioned owned native Matchstick0.6.0 executable at
<owned-runtime-directory>/binary-macos-12-m1, first rechecking SHA256
cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd.
It loads on this host; this is not yet a mapping-test PASS. Do not run bare graph
test, download again, fill the unversioned cache, install OS dependencies or use
Docker. Invoke the exact binary by absolute path in subgraph with minimal clean
environment and finite timeout; await/reap exact children. Package test script
may pin graph test --version0.6.0 only if documentation explains its download and
unversioned-cache limits; do not claim that script authenticates a cached binary.

Real Matchstick AS/WASM execution is required, distinct from Graph compilation,
TS mirror or local source assertions. Initial missing files or compiler/runtime
setup failures are not behavioral Reds. Capture meaningful real handler/store
failures against a clearly recorded initial checkpoint before corrections.
Update focused existing checks only to describe the explicitly released manifest
transition; preserve all historical G1 and G2 schema/money/event assertions.
Run narrow mapping/focused checks and exact nested strict checks only. Parent
owns the sole frozen full gate, final actual build, review, SDD copies and commit.

No network, deployment, keys, funds, consumed-approval replay, mainnet or push.
G5 readiness may proceed independently, but no G5 source is released by G4.
