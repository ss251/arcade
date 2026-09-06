> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G4 settlement mapping — independent review

September 6, 2026. **CLEAN for the frozen 13-path G4 checkpoint.** No source correction requested. Independent checks completed by 02:30:08 UTC. Parent Graph build, full repository gate, publication and commit are separate; none is claimed by this note.

## Read and frozen scope

Read complete Plan G global constraints/Task 4, accepted G4 readiness/parent decisions, current schema, all eleven author-owned source/config/test/documentation files, paired parent ignore changes, and the complete 187-line author report. Author report SHA-256: `76e5202a0de382f7f0afb7b5d15a5c694c8b087a9d7e4e2f06d846cf6feb1e68`. The ts-testing skill informed the separation of actual mapping/store execution from TypeScript source/schema assertions and setup failures.

All 13 source fingerprints matched before/after independent execution and match the final author inventory. The report's four unchanged preservation pins also match: smoke.ts, G1 schema fixture, current schema and v1 ABI. The unchanged ABI check remains `92e5fffcaf82f23ac92ac4f37d80566fe581839ad3d88abe8a0ee8f3ccc91983`.

| Frozen path | SHA-256 |
| --- | --- |
| subgraph/src/ids.ts | cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db |
| subgraph/src/fee-splitter.ts | 50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642 |
| subgraph/tests/fee-splitter.test.ts | e1fcae5efd9d149e5e0548ee467406233650b80675a4bc22345c26f4441d9c6f |
| subgraph/matchstick.yaml | 9036856089a6cb23c0733464f624285652d4ab574c0ba05425af87529589b124 |
| subgraph/build-manifest.ts | 355a4efcdfd1912a1543785dc6aee725d6560c6e303966c44de0694c724c66d3 |
| subgraph/subgraph.template.yaml | 814290bbfb639918a1ecaf06c7e045034c9886748d8eb2e09f357e00fd79cde7 |
| subgraph/checks/manifest.bun.test.ts | 0d1cf7377db6ef334b271124b5cf958740c731d424db06c8da2dd8ecc8c1808f |
| subgraph/checks/scaffold.bun.test.ts | 0433453ebc458c86ce4ccd1ba1de925f9b61a4f9f0a7815bc5500aede417aba7 |
| subgraph/checks/schema.bun.test.ts | bae2faf3232e6c18b4f189f41e1211874c90671d1cfe6f3825c4b5b866312c7b |
| subgraph/package.json | 63fdd2cc890f26fb9f43cff7772bf95d8678337d247a29267022189ee73f83de |
| subgraph/README.md | 3b5163d4a18dcf09236cc7616a1b67f68ef75fb86e4a50d17eff1f0151430c11 |
| .gitignore | 82d617b14e2037cfd499ba462961a242c3f0f8783367140c5cbdc5ccb3eaf2e2 |
| .dockerignore | f0c990c23cd72349abd301bbddb4eebcc207c56383c94f92afe44f136febc7ca |

The README prefix before the additive G4 section exactly reconstructs prior G3 hash `b77a962be1a1b0f204cca04c90bb4b8d7c6d98d955d4f03531aa35d78e413675`. Removing only the paired new Matchstick comment/pattern from each ignore reconstructs its prior G3 hash. No historical documentation, smoke or schema proof was rewritten.

## Source findings

- Occurrence IDs use transaction hash plus validated nonnegative signed-Int log index. Rejection precedes writes; valid concatI32 identities remain compatible. Both handlers check existing Settlement ownership before loading/creating a splitter, changing counters or tree state. Nonce/hash equality alone is not deduplication.
- The common record helper consumes explicit fields. Production does not reinterpret SettledTree as Settled. The pilot Settled class has the exact compatible V2 five-field event prefix. Money, nonce, emitter, transaction, block and timestamp retain emitted BigInts without scaling or fee recalculation.
- Splitter first discovery, firstSeenBlock and existing nullable listing reference survive later events. No Marketplace, Agent or Listing factory exists in this slice. Helper agent IDs do not persist agents, and an existing relation is not evidence of newly verified assignment.
- Each unique tree occurrence retains its own immutable event identity, full uint32 count and event facts. A summary preserves first scalar values; later distinct occurrences permanently clear root and increment occurrenceCount/ambiguity. Replays cannot overwrite, increment or restore it. Summary childCount uses explicit unset above 2147483647; the full value remains on TreeOccurrence. Child spend may exceed root price without being rewritten.
- Exactly one approved static pilot/v1 handler remains active, with its historical zero start and prune:never. One V2 template supplies actual generated event types/handlers and declared entities, but no code instantiates it. No registry source, additional emitter, arbitrary context or metadata authority is introduced.
- The existing closed renderer still validates complete YAML before output replacement, refuses malformed/extra input and preserves prior output. Its only prerequisite expansion is the new helper/mapping/V2 ABI. Fresh temporary layouts do not require ignored generated YAML. Paired ignores cover actual generated test binaries without excluding test source. The package test script's pinned version does not authenticate Graph's unversioned cache; README explicitly records that limit.

## Independent execution

The native executable was SHA-256 checked immediately before invocation:

`<owned-runtime-directory>/binary-macos-12-m1` at `cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd`.

Actual argv: that absolute binary, `-r`, `fee-splitter`; cwd `subgraph/`. The `-r` run printed fresh compilation before executing the real imported AS mapping/generated entities in Matchstick's WASM host. Child environment contained only `PATH=<verified-node-bin>:/usr/bin:/bin`; stdin ignored; stdout and stderr each capped at 524288 bytes; 60000 ms SIGKILL fuse. Exact native child PID 84516 exited 0 and was awaited/reaped in 1822 ms, at `2026-09-06T02:29:25.702Z`. No fuse/overflow fired. **27 tests passed.** No AS assertion count was invented.

This includes exact plain/tree facts, duplicates, distinct log/transaction identity, source-context overlap, first-discovery preservation, cross-emitter repeated hashes, permanently ambiguous roots, first overflow followed by smaller count, uint32 boundaries, large atomic money/time, and invalid log-index rejection. Every test's cleanup checks no Marketplace/Agent/Listing or V2 instantiation. Direct store inspection accepts only missing or explicit ValueKind.NULL; two expected-failure controls prove that measured zero and non-null root are rejected. Their printed assertion diagnostics are expected controls, not suite failures.

Focused command from `subgraph/`:

```sh
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/abis.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
```

Observed **112 pass, 0 fail, 240 expect() calls, four files, 854 ms, exit 0**. These include the unchanged 21 ABI checks; they are not 112 new mapping tests. Actual child imports/closed CLI and temporary-file behavior are included, alongside historical schema/query/manifest assertions.

Fileless installed TypeScript compiler-API checking read the actual root tsconfig and inherited options, with explicit rootNames `subgraph/build-manifest.ts` and manifest/scaffold/schema Bun check files, strict/noEmit. Parsed-config errors plus all pre-emit diagnostics totaled **zero**, completed `2026-09-06T02:30:08.805Z`. AssemblyScript correctness is covered by native compilation/execution, not falsely included in these four TypeScript roots.

All reviewer commands/processes finished. Parent was notified immediately when native AS execution stopped so its separate Graph build could begin without a codegen race. No Graph build, repository-wide suite, bare graph-test/download, network, Git, deployment, key or spending operation was performed by this review.

## Historical Red attribution and limits

The author report preserves the initial launcher ArrayBuffer/hash setup failure before any native spawn. The initial actual unchanged-smoke run collected six tests: four passed, two genuine behavioral failures accepted negative/oversized synthetic log indices. Three separate manifest-transition failures concerned old mapping target/absent template, not missing modules. After the implementation these passed.

The later expanded 25-case run's five failures were the test helper's missing-only assumption versus actual Graph Null representation; they were not reproduced mapping defects. The corrected helper retained strict null semantics and added the two negative controls. Tree behavior added after the first draft is supplementary passing coverage, not retroactively invented preimplementation Reds. This reviewer reran the final frozen checks, not the author's historical failing source.

No material finding remains within the approved G4 scope. Successful native child exit/reap is not a timeout fault-injection or descendant/orphan cleanup proof. Matchstick on synthetic events is real local AS/store execution, not live graph-node/Studio indexing, complete registry history, deployment identity, trusted listing binding or verified off-chain receipt trees. Parent still owns final build/full gates/publication/commit; consumed G1 deployment authority is not reopened.
