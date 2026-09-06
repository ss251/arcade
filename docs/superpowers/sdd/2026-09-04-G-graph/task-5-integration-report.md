> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G5 inactive registry integration report — September 6, 2026

Author slice frozen at 2026-09-06T02:56:44Z, following the explicit release after
G4 commit f66fb5ab1d7ca70cc633e216c52513e6f776ea80. This is the seven-path
integrator checkpoint, not mapping-runtime acceptance or completion of Plan G.

## Scope and contract

Read the full actual Task 5, retained readiness and parent decisions including
the explicit release, current G4 schema/renderer/checks, staged registry ABIs and
installed Graph code generation behavior. Used the fully read ts-testing skill
to separate source/schema behavior, setup, actual code generation and mapping
execution. The registry author owns four real modules and three AS suites; no
cross-edit was made.

The schema adds only immutable RegistryEvent with eight required fields: id,
registry, kind, disposition, txHash, blockNumber, timestamp and logIndex. String
kind/disposition fields are constrained to fixed helper constants by the mapping
author, not by a GraphQL enum or this integrator. Existing schema fields and
relationships are unchanged.

The manifest retains the exact G4 static pilot and inactive V2 template. Three
inactive registry templates declare actual identity/reputation/validation
handlers and their entity/ABI lists. They have no address, startBlock or context.
The renderer still captures the pinned chain and sole pilot input, rejects
altered templates and uses fixed diagnostics. All four real registry source
files and their three ABIs must exist before output replacement. Temporary
fixture copies now include those real files; no placeholder mapping was written.

Generated event namespaces are templates/IdentityRegistry/IdentityRegistry,
templates/ReputationRegistry/ReputationRegistry and
templates/ValidationRegistry/ValidationRegistry. Inspection of actual generated
getters confirmed indexedMetadataKey and indexedTag1 are Bytes; feedbackIndex,
value and tokenId are BigInt; valueDecimals and response are i32. RegistryEvent
was generated from the real schema. Templates are not instantiated.

The README appends a dated local-stage explanation and preserves the full G4
prefix. It distinguishes observed bounded registry counters from all feedback,
trusted validators, external payer counts and verified service payments. It
documents canonical event order plus exact replay, remembered skips, unsupported
burn refusal, claim-only metadata, no Marketplace creation and deferred G6
activation/epoch policy. It does not claim a fresh deployment or pre-upgrade
history compatibility.

## Failure-first chronology

1. Before production/schema/template edits, changed five collected assertions
   for the exact entity inventory, RegistryEvent fields and four-template
   manifest. Actual baseline: 0 pass, 5 fail, 90 filtered, 14 expect calls,
   exit 1. Failures were the missing immutable entity and three missing
   templates, not absent modules or compiler setup.
2. Added the entity and exact renderer/YAML declarations. The identical
   selected command passed 5/5 with 17 expect calls. No assertion was removed
   or weakened.
3. Added ABI-derived signature checks and mutation refusals for missing
   templates, addresses, start blocks, context, altered ABI/mapping/handler,
   extra canonical entities, missing replay entity, indexed-key and signedness
   changes. These were immediately passing supplemental coverage, not new
   production Reds. Selected check: 28 pass, 86 filtered, 48 expect calls.
   Local asset absence cases also preserve prior output and leave no temporary
   manifest file; they are coverage of the actual required-file policy.
4. Exact TypeScript first found one test-only Bun matcher excess-property
   diagnostic: the historical snapshot input had been typed too narrowly.
   Retained the identical deep equality expected object and represented the
   parsed snapshot as unknown at the assertion boundary. Four-root strict then
   reported zero diagnostics. This was not a runtime Red.
5. A full three-file schema/ABI/scaffold run found 61 pass and 1 failure:
   the historical Agent.registry mutation replaced the first registry field,
   now RegistryEvent.registry. Scoped that fixture replacement to the actual
   Agent agentId/registry prefix; retained the Agent.registry expected failure.
   The same command passed 62/62, 160 expect calls. This was a test-targeting
   compatibility correction, not a product schema defect.
6. Waited until the registry author confirmed all four complete real drafts
   existed. Ran exactly one local codegen; exit 0. No missing-module run was
   claimed as behavioral evidence. The author was then notified that generated
   types were ready and released to their own native mapping tests.
7. Final focused four-file selection passed 135/135, 289 expect calls.
   Exact four-root strict check passed with zero diagnostics. Final README
   appended only these measured integrator results and the explicit limits.

## Commands and result boundaries

From subgraph/:

```sh
bun --no-env-file test ./checks/schema.bun.test.ts ./checks/manifest.bun.test.ts ./checks/scaffold.bun.test.ts -t 'defines exactly|RegistryEvent preserves|renders committed inputs deterministically|binds the sole smoke|declares pilot entities'
bun --no-env-file run codegen
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/abis.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
```

The last command: 135 pass, 0 fail, 289 expect calls across 4 files. The unchanged
ABI suite is included in this count, not additional new tests. CLI checks use
owned temporary layouts and explicit local child processes with minimal env,
no env-file loading, fixed command arguments and awaited exits. Test fixtures
are cleaned after observation; no external endpoint is used.

The exact strict program was run from GROOT with root tsconfig.json loaded via
ts.readConfigFile and ts.parseJsonConfigFileContent using the absolute config
filename and process.cwd() base. ts.createProgram received only these four
explicit roots and the parsed root options (with their real dependencies):
build-manifest.ts plus schema.bun.test.ts, manifest.bun.test.ts and
scaffold.bun.test.ts under subgraph/. Parsed-config plus pre-emit diagnostics: 0.
This is not the root repository-wide type gate or AssemblyScript compilation.

No Matchstick execution, final WASM build, full repository suite, dependency
installation, Git operation, network access, key use, registry action, payment,
query, upload or deployment was performed by this author. Generated output is
local and ignored. Parent owns the final build/full gate/review/commit. The
separate registry author owns actual mapping behavior and their real AS evidence.

## Frozen seven-path SHA-256 inventory

```text
eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db  subgraph/schema.graphql
c0396bec23c5356fddb5329b99ace622bed2d00de3ce5d95861056dcabb0bd35  subgraph/checks/schema.bun.test.ts
c8d73d2bdfd0e8a8f8692b007c7609e68cebbed86ba7c3a6b15222abef722a71  subgraph/build-manifest.ts
85a05e6002647d2f1bff3aca984354764c6b2876464d1cc4059d88b2d1d2a39f  subgraph/subgraph.template.yaml
3b30433f1677f441c9198ea469e226f1846c01cb1e71627bd47f49786a56bda6  subgraph/checks/manifest.bun.test.ts
6d47fd9979321f9dbb2fd95b4e8134bea2794607dd2778c371af57f5a3280a74  subgraph/checks/scaffold.bun.test.ts
fba9ff44ec61067e8b150fe53f118d604e30c7204bd91b4e04de426ef16f7bb7  subgraph/README.md
```

## Preservation checks

Removing only the additive RegistryEvent declaration from the current schema
in memory reconstructs G4 SHA
913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483.
The README prefix ending immediately before its new blank line/G5 heading
reconstructs G4 SHA
3b5163d4a18dcf09236cc7616a1b67f68ef75fb86e4a50d17eff1f0151430c11.

Read-only SHA checks matched these unchanged local inputs:

```text
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db  subgraph/src/ids.ts
50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642  subgraph/src/fee-splitter.ts
e1fcae5efd9d149e5e0548ee467406233650b80675a4bc22345c26f4441d9c6f  subgraph/tests/fee-splitter.test.ts
9036856089a6cb23c0733464f624285652d4ab574c0ba05425af87529589b124  subgraph/matchstick.yaml
e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d  subgraph/src/smoke.ts
114cfff3389dccb395606f4aa6db60d02fb49c7a5886788cf5dc6f64777aee1c  subgraph/checks/fixtures/g1-schema.graphql
e3afd30b6cab0f1a33ce79e17ffb6605201e2e6d93b3cff7ac6b903fb236faea  subgraph/abis/FeeSplitter.json
4874ccc5cd91917aae0256f9fd743fb4b1ad14faf660c0789ed8805bf16be7fa  subgraph/splitters.json
63fdd2cc890f26fb9f43cff7772bf95d8678337d247a29267022189ee73f83de  subgraph/package.json
82d617b14e2037cfd499ba462961a242c3f0f8783367140c5cbdc5ccb3eaf2e2  .gitignore
f0c990c23cd72349abd301bbddb4eebcc207c56383c94f92afe44f136febc7ca  .dockerignore
```
