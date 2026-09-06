> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G4 settlement mapping author report — September 6, 2026

Source frozen at 2026-09-06T02:27:54Z after parent explicitly released G4 following
G3 commit e00cd89. This report records local mapping behavior and focused checks,
not a new deployment, live indexer result, complete coverage or commit.

Read the full G4 readiness, parent decisions, runtime provision, actual Task4 and
global constraints, ts-testing skill, schema, preserved smoke, generated classes,
Graph CLI conversions and existing manifest/scaffold/schema checks. The testing
skill informed actual behavior/store tests instead of a TypeScript ledger mirror.

## Ownership and accepted adaptations

The author changed exactly the11 released subgraph paths inventoried below.
Parent separately added the precise subgraph/tests/.bin/ pattern to both root
ignore files after actual Matchstick produced tests/.bin/fee-splitter.wasm. The
existing scaffold hygiene check now asserts both patterns. This supplemental
assertion passed immediately; it is not a manufactured pre-change Red. Thirteen
paths form the combined G4 source/config checkpoint, with the two ignores credited
to parent rather than claimed as author edits.

No root package/lock, schema, hub, payment, registry mapping, source emitter,
splitter list, ABI, historical smoke or original G1 fixture was changed.
Generated manifest/event/schema/AS-WASM files are local generated outputs only.

- The sole static source remains the actual approved pilot, v1 ABI, Settled
  signature and historical startBlock0 exception. Its mapping file now points
  to fee-splitter.ts.
- The one inactive FeeSplitterV2 template declares real Settled/SettledTree
  handlers and Settlement/Splitter/Tree/TreeOccurrence. No code instantiates it;
  no registry sources, no-op mappings or metadata activation are introduced.
- Settled consumes the pilot-generated five-field class, whose exact ABI prefix
  agrees with V2; SettledTree consumes its actual template-generated class.
  The common helper receives explicit event facts. Production contains no
  SettledTree-to-Settled reinterpretation.
- occurrenceId validates nonnegative signed-Int representability before
  concatI32. Existing IDs0..2147483647 remain compatible; larger or negative
  synthetic indices fail before counter/entity writes.
- Both handlers check Settlement ownership before any mutation. Equal nonce
  or tree hash does not replace transaction/log identity.
- splitterFor preserves existing first-discovery facts and nullable listing
  reference. It does not create or establish a canonical listing. No Marketplace,
  Agent or Listing is created, and no complete registry coverage is fabricated.
  ARC_CHAIN_ID and exact decimal agentEntityId are provided without entity IO.
- Immutable TreeOccurrence retains every unique emitted tree event, full uint32
  childCount and exact emitted fields. Summary first facts remain unchanged;
  a second distinct occurrence clears root and makes ambiguity permanent.
  Replays never increment or restore a root. Above2147483647 the summary count
  is unset/null while the occurrence remains exact BigInt.
- Emitted money/nonce/transaction/block/timestamp stay exact; no default fee,
  gas scaling, child-budget inference or off-chain tree validation is invented.

## Observed execution chronology

1. A fileless runner launcher initially passed an ArrayBuffer directly to
   createHash.update. Bun rejected that argument before spawn; converting it
   to Uint8Array corrected the launcher. No native child or mapping test ran
   in that setup failure. No missing-module/runner failure is counted as a
   behavior Red.
2. First actual native AS/WASM/store run against unchanged smoke.ts at
   07:45:37IST: **6 collected,4 passed,2 failed**, exit1,2744ms, exact native
   child61575 awaited/reaped. Both failures were expected-refusal tests:
   negative logIndex and2147483648 were incorrectly accepted. Plain exact
   fields/no invented coverage, duplicate counters, distinct transaction/log
   identity despite equal nonce, and large amounts passed.
   Initial test SHA was
   cc09f8107c79b7b82e6e9216f31f8da6ac4a4b9c17cc7794fb5fe4c802b49e39;
   smoke remained e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d.
3. Before the renderer change, three collected narrow manifest-transition tests
   failed against its actual output: old smoke mapping target and absent V2
   template. Result **0 pass,3 fail,86 filtered,9 expect calls**. These were
   configuration behavior failures, not missing generated modules.
4. Implemented the new bounded mapping/helper and approved manifest transition.
   Actual pinned codegen exited0, generating pilot and template event types.
   Original six AS tests then **6 passed** at07:49:06IST,1450ms, native
   child65094 reaped. The three changed manifest tests also passed within
   **91 Bun tests/199 expect calls** across the three focused check files.
5. Expanded mapping tests exercised tree writes/replay/collisions, uint32
   boundaries, source context, discovery and large values against that first
   mapping draft. At07:52:10IST the run was **25 collected,20 passed,5 failed**,
   exit1,2945ms, child68363 reaped. All five failures were in the test's
   nullable-field helper, which accepted only a missing value. The actual
   Matchstick store normalizes unset Tree fields to explicit Graph ValueKind.NULL.
   These five are **test representation failures, not claimed mapping defects**.
6. Corrected only that helper to accept a missing field OR exact ValueKind.NULL.
   It does not use generated getters' zero defaults. Mapping source was unchanged.
   The same25 cases passed at07:53:31IST,2136ms, child71092 reaped.
   Tree tests added after the initial mapping draft are passing behavioral
   coverage, not represented as separate preimplementation Reds.
7. Added two expected-failure controls: the stored-null helper must reject an
   actual zero childCount and a non-null chosen root. Final real native run:
   **27/27 passed** at07:55:39IST,6872ms, child76782 reaped. The runner prints
   assertion diagnostics for those two intentionally failing controls but
   correctly classifies their expected failures as passed tests.
8. Added the parent-requested generated-output ignore assertion. Final focused
   selection: **112/112 Bun tests,240 expect calls,4 files,714ms**, exit0.
   This includes the unchanged21-test ABI selection; these are not112 new tests.
   Final exact four-root TypeScript check reported **zero diagnostics**.

No assertions were weakened to accept a measured zero as unknown or a chosen
root as absent. Existing G1 historical schema/money/event/evidence checks and
G2 actual G7-query/schema checks remain intact. No new behavior was fabricated
by changing production to obtain a test failure.

## Runtime and command scope

Only the pre-provisioned native Matchstick0.6.0 executable was invoked:
`<owned-runtime-directory>/binary-macos-12-m1`.

SHA256 was checked immediately before each run against
cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd.
Actual native argv was that absolute executable followed by
`-r fee-splitter`, with cwd subgraph/. The child environment contained only
PATH=<verified-node-bin>:/usr/bin:/bin; stdin ignored,
stdout/stderr captured and capped separately at524288bytes, a60000ms SIGKILL
fuse, and the exact native process awaited/reaped in finally. All recorded native
runs exited themselves; the fuse never fired. This is actual successful
compilation/run cleanup evidence, not a descendant/process-tree fault-injection
or orphan-reaping proof. No Graph native cache was populated or trusted.

The literal graph test package script was not executed. It now pins version0.6.0,
but README explicitly warns that it may download and that its unversioned cache
does not authenticate an existing executable. No download, Docker, system
dependency/configuration or credential operation occurred.

Actual local generation:
`bun --no-env-file run codegen` from subgraph/, exit0. This regenerated the
manifest and types; the author did not run a complete graph build. Matchstick
compiled the actual AS mapping and tests independently.

Final focused command from subgraph/:

```sh
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts ./checks/abis.bun.test.ts
```

Exact typing used the installed TypeScript compiler API with absolute
configFilePath and all inherited root tsconfig options, noEmit, and these four
rootNames: build-manifest.ts plus manifest/scaffold/schema Bun check files.
Parsed-config errors and getPreEmitDiagnostics totaled zero. It did not run the
full repository checker. The AS dialect is verified by actual native
compilation/execution, not mislabeled as root TypeScript strict checking.

## Frozen SHA256 inventory

The last two files below are parent-authored, included to pin the complete
13-path G4 checkpoint. No author source/runtime/check activity continues.

```text
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db  subgraph/src/ids.ts
50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642  subgraph/src/fee-splitter.ts
e1fcae5efd9d149e5e0548ee467406233650b80675a4bc22345c26f4441d9c6f  subgraph/tests/fee-splitter.test.ts
9036856089a6cb23c0733464f624285652d4ab574c0ba05425af87529589b124  subgraph/matchstick.yaml
355a4efcdfd1912a1543785dc6aee725d6560c6e303966c44de0694c724c66d3  subgraph/build-manifest.ts
814290bbfb639918a1ecaf06c7e045034c9886748d8eb2e09f357e00fd79cde7  subgraph/subgraph.template.yaml
0d1cf7377db6ef334b271124b5cf958740c731d424db06c8da2dd8ecc8c1808f  subgraph/checks/manifest.bun.test.ts
0433453ebc458c86ce4ccd1ba1de925f9b61a4f9f0a7815bc5500aede417aba7  subgraph/checks/scaffold.bun.test.ts
bae2faf3232e6c18b4f189f41e1211874c90671d1cfe6f3825c4b5b866312c7b  subgraph/checks/schema.bun.test.ts
63fdd2cc890f26fb9f43cff7772bf95d8678337d247a29267022189ee73f83de  subgraph/package.json
3b5163d4a18dcf09236cc7616a1b67f68ef75fb86e4a50d17eff1f0151430c11  subgraph/README.md
82d617b14e2037cfd499ba462961a242c3f0f8783367140c5cbdc5ccb3eaf2e2  .gitignore
f0c990c23cd72349abd301bbddb4eebcc207c56383c94f92afe44f136febc7ca  .dockerignore
```

Unchanged preservation checks:

```text
e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d subgraph/src/smoke.ts
114cfff3389dccb395606f4aa6db60d02fb49c7a5886788cf5dc6f64777aee1c subgraph/checks/fixtures/g1-schema.graphql
913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483 subgraph/schema.graphql
e3afd30b6cab0f1a33ce79e17ffb6605201e2e6d93b3cff7ac6b903fb236faea subgraph/abis/FeeSplitter.json
```

## Remaining parent gates and limits

Parent and the independent reviewer read the source without an initial material
finding; independent final runtime/check acceptance is separate and pending at
this author checkpoint. Parent owns the sole frozen repository gate, actual
final WASM build, public archive and commit. No success of those later gates is
inferred here.

Matchstick's local host proves the stated mapping behavior on typed synthetic
events, not live graph-node/Studio persistence, deployment identity, complete
registry coverage, historical replay or new indexed results. No network, query,
operational key, signature, payment, upload, deployment, Git mutation or push
was performed. G1's consumed deployment and all original historical artifacts
remain unchanged.
