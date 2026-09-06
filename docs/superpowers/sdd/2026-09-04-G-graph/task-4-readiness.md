> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G4 settlement mapping readiness — no implementation

September 6, 2026. Prepared while the parent gates F on main and holds G3 for
rebase/release. This note does not release G4, provision a runtime, activate a
data source, or authorize a query/deployment/payment. No test, build, download,
external request, Git mutation, key access or source edit was performed.

Read the full Plan G global constraints and Task 4, current G2 schema/smoke and
both G2 readiness/parent decisions, G3 readiness, actual G7 query/decoders,
relevant existing checks and contract event declarations, and installed Graph
CLI/Matchstick source. The ts-testing skill informed the distinction between
real mapping behavior and source/mirror assertions. Existing historical proof
and all other private notes remain unchanged.

## Release recommendation

Implement the existing four planned G4 files, plus an explicitly owned narrow
manifest/check transition after G3 freezes. Do not implement the literal
`marketplace()` get-or-create helper: incomplete registry coverage must continue
to produce no Marketplace row. Real AssemblyScript mapping execution is the
acceptance target. A TypeScript ledger mirror, AST check or WASM build does not
substitute for it; a missing module/runtime is a setup failure, not a behavioral
Red. Parent-owned chain/deployment provenance remains a separate prerequisite
for activating new static emitters, not something the mapping can infer.

## Installed runtime facts and smallest real test route

- Host observed: Darwin 25.5.0 arm64. Isolated package pins Graph CLI 0.98.1,
  graph-ts 0.38.2 and matchstick-as 0.6.0; local AssemblyScript is 0.19.23.
  Compiler and Graph executable links are present. Existing build files are
  historical outputs, not a new successful run.
- `matchstick-as` contains AS helpers and declared host imports such as
  `_registerTest`, `clearStore` and `countEntities`, not the Rust test runner.
  No native Matchstick binary was found in the inspected local subgraph/global
  Graph package trees. The exact current CLI cache directory
  `subgraph/node_modules/@graphprotocol/graph-cli/dist/commands/node_modules/.bin`
  is absent. No `subgraph/tests` or Matchstick configuration exists yet.
- Installed CLI `dist/commands/test.js` fetches the latest release unless an
  explicit version or fresh cache is supplied, then downloads a missing binary.
  For supported Apple Silicon it selects `binary-macos-12-m1` for versions above
  0.5.4. This source selection is not evidence the binary runs on this host.
  Its binary cache name is not versioned: `--version` alone does not authenticate
  an already cached executable.
- Docker client and local Unix socket exist. Two read-only, explicitly local
  image-list attempts were refused by sandbox socket permissions; therefore
  daemon health and cached Matchstick/graph-node images are unknown, not absent.
  No container was started. No `wasmtime` or `wasmer` executable was on PATH.

Smallest next decision: separately approve provision/verification of a pinned
Matchstick 0.6.0 native runner, recording source/version and actual artifact hash,
or approve inspection/use of an already available pinned local container image.
Do not run bare `graph test` to discover availability: that has download effects.
The exact upstream asset selected by the installed CLI for this proposed version
and supported Apple Silicon is
`https://github.com/LimeChain/matchstick/releases/download/0.6.0/binary-macos-12-m1`.
This URL is derived from the inspected selector, not fetched release metadata;
asset availability, upstream checksum/signature availability and Darwin 25
compatibility remain unverified. Provisioning should verify those facts, retain
the exact bytes/hash and executable identity, and inspect required local loader
dependencies before counting a run. No version downgrade or arbitrary mirror.
After provisioning and explicit G4 source release, the local CLI route is:

```sh
# From subgraph; only after the selected cached runner is verified present.
node ./node_modules/@graphprotocol/graph-cli/bin/run.js test --version 0.6.0 fee-splitter
```

This compiles/imports the real generated event/schema classes and production
mapping into AS/WASM and exercises their save/load/counter behavior in the
Matchstick host. It is not a TypeScript reimplementation and is not live
graph-node/Studio indexing proof. Run actual local codegen/build separately.
Do not use CLI `-d` casually: its inspected implementation may fetch a Dockerfile,
build an image, or remove an existing `matchstick` image. If native compatibility
fails, report that exact failure and obtain the bounded container decision;
do not replace the mapping runtime with a bespoke JS Graph host or live query.

## Exact mapping rules (already required by G2)

1. One shared event-occurrence identity, actual transaction hash plus log index,
   owns both Settlement and TreeOccurrence. Load/check Settlement before any
   splitter/tree/counter mutation. Duplicate delivery, including two approved
   source paths delivering the same log, is a no-op. Different transaction or
   different log index is a distinct occurrence even with equal nonce/tree hash.
   Preserve the existing smoke ID convention for representable log indices;
   do not silently truncate an out-of-range synthetic log index into an alias.
2. Record exact emitted buyer, total/seller/fee atomic BigInts, nonce, emitter,
   block, timestamp and transaction. Use explicit common fields rather than
   reinterpreting SettledTree as a different generated class. Each unique event
   increments only its emitter's count/volume once. No native-gas scaling or
   recomputed default fee; child spend is not required to be below root price.
3. Splitter source is first discovery only, not provenance or complete history.
   Preserve firstSeenBlock and nullable listing; static/metadata discovery cannot
   manufacture an agent, seller, current owner, listing or verified contract.
   An inactive template declaration supplies generated types, not authority to
   instantiate it from arbitrary metadata. No such instantiation belongs to G4.
4. Every unique SettledTree creates immutable TreeOccurrence with the exact
   emitted uint32 childCount as BigInt, logIndex and all event facts. Settlement
   links to the hash summary; the occurrence links to its actual Settlement.
5. First Tree occurrence creates a summary with root, occurrenceCount=1 and
   ambiguous=false. Preserve the first observed scalar facts thereafter. The
   second distinct occurrence of the same hash clears root, sets ambiguous=true
   and increments occurrenceCount; later occurrences never restore a root or
   overwrite first facts. Duplicate delivery never creates ambiguity.
6. Tree.childCount is the first observed value only if 0..2147483647, otherwise
   null. Preserve 2147483648..4294967295 exactly on TreeOccurrence; never use
   unchecked `.toI32()` or `.fromI32()` for those values. It remains a uint32
   event fact, not validation of an off-chain receipt tree. Current generated
   schema.ts exposes the nullable GraphQL Int as an i32 getter returning zero
   when absent, with no nullable setter: use `unset("childCount")` for overflow
   and assert the stored field is absent/null, not merely `tree.childCount == 0`.
   Root does have a nullable setter, so `root = null` clears the stored relation.
7. No Marketplace row, aggregate registry zeros, Agent or canonical Listing is
   created by G4. G7 stats/evidence remain null without coverage/trusted binding.
   G7 treeFor already returns null for null root or childCount, so collisions and
   overflow fail closed without a G7 API/source change. Its existing zero-child
   versus nonzero-child-total rejection is a read policy; retain emitted facts.

## Compact genuine behavioral matrix for implementation

Use real typed mock events with explicitly assigned 32-byte transaction hashes,
nonnegative log indices, emitter, block and timestamp. `newMockEvent()` defaults
reuse identity; the literal plan's two-amount fixture is not two occurrences.
Call actual handlers and assert stored entities/fields after each transition.

- Plain event: complete immutable Settlement, one Splitter, exact money/nonce,
  unset listing/tree, zero Marketplace/Agent/Listing entities.
- Same event twice, including source-context overlap: exact entity snapshots and
  counters unchanged. Different log in same transaction and same log in another
  transaction each count once; equal nonce alone never deduplicates.
- Unique tree: Settlement/TreeOccurrence linkage, exact log/emitter/time/money,
  root and first summary facts. Plain event creates no tree occurrence.
- Same tree hash at two then three distinct occurrences (including another
  emitter): all occurrences retained, root null permanently, count exact, first
  summary facts unchanged; replay either old event changes nothing.
- Child counts 0, 2147483647, 2147483648 and 4294967295: exact BigInt persistence;
  nullable summary at the last two boundaries. Use decimal BigInt constructors.
- Large atomic amounts above JS safe-integer range and distinct block/timestamp:
  no narrowing, guessed fee or block-as-time substitution.
- First-discovery context/listing unknown and Marketplace absence remain true
  through plain/tree/duplicate/collision paths. No arbitrary template activation.

Capture behavior against the actual current adapter or an explicitly documented
initial mapping checkpoint before fixing it. Do not count nonexistent-module,
compiler or runner acquisition failures as these regressions. Matchstick store
checks and existing G7 decoder checks are distinct evidence; schema declarations
alone do not prove the collision/nulling behavior executes.

## Proposed narrow ownership after G3

Primary G4 author: `subgraph/src/ids.ts`, `subgraph/src/fee-splitter.ts`,
`subgraph/tests/fee-splitter.test.ts`, `subgraph/matchstick.yaml`. Shared helpers
may include the occurrence/splitter helpers and pure chain/agent ID constants;
no premature Marketplace factory or G5 metadata writer.

Parent must explicitly release the necessary G3-owned template/renderer and
focused manifest-check delta to the same author or a disjoint integrator. Keep
the actual pilot ABI/Settled handler compatible; add the real settlement mapping
and V2 template only with all used entities declared (including TreeOccurrence).
An inactive V2 template can compile/test SettledTree without pretending the
historical pilot is V2 or authorizing unknown emitters. No registry source/no-op
handler activation. Preserve the temporary smoke and historical scaffold fixture
unless a specifically reviewed adapter transition replaces the active path.

Small package test-script pin and dated README status are reasonable explicitly
released additions; no root dependencies, schema rewrite, hub/payment/SQLite
changes, deployment or owner transaction is needed. Generated manifest/types/
WASM remain ignored. Parent owns rebase, full gates, publication and commit.
Parent subsequently reported G3 released at rebased G HEAD 0d79dbd after the main
four-gate pass; this readiness note does not overlap that author's source. Parent
is obtaining keyless creation/proxy evidence separately; no permanent provenance
block is inferred here.

## Read checkpoint hashes

```text
task-3-readiness.md f073e5d848689d1183d7b94ea198e2540078834a63d0465a63429eaa7d6c1e17
retained private G2 parent decisions (not published) e19b04f79bd00c096213f59d5f394a1f22d731e81068baa82a93a54437e1d810
retained private G2 readiness (not published) 56672936aaa5c16c8bc95132ce65ddbcc6ad221416c0316e2833d8cad6eea714
subgraph/schema.graphql 913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483
subgraph/src/smoke.ts e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d
apps/hub/src/graph.ts 87b72678d4493a0625aba4b61e39158bb7b12940586b7243497161c0864c7ad7
```
