> Sanitized local implementation checkpoint, September 5, 2026. Original retained unchanged. This is not Studio deployment, indexing, payment or fresh network-support evidence; later dated progress can supersede pending statements.

# G1 — offline scaffold/build implementation

Date: 2026-09-05 UTC. Base: b232601, feat/g-graph.

## Scope and status

Only the approved local portion of G Task 1 is implemented. Studio account/auth/deployment,
query URL, endpoint authorization policy, actual indexed settlements and fresh networks-registry
verification remain PENDING/UNVERIFIED. This is not a completed G1 live gate; G2–6 remain held.
No keys, wallet/faucet actions, Studio actions, RPC, model/proxy calls, global tool changes,
external writes or git mutations were performed. Network use was solely the parent-approved
pinned npm dependency install in subgraph/. No source was edited in another worktree.

## Instruction reads and adaptation

Read CLAUDE.md, all G1 steps/global constraints, the execution index and the complete current
E-private g-readiness.md. The requested superpowers execution and chain-specific skills are
not installed. Used the parent task-by-task workflow and the fully read ts-testing skill.
Static source provenance is the checked-in FeeSplitter.sol event and runbook pilot address;
no inference that the deployed contract bytecode or current network support was checked.

Differences from the literal plan:

- README and eventual suggested commit say local scaffold/build, never that Studio deploy/query passed.
- Added six Bun scaffold checks. Their ABI/manifest/schema/mapping checks are source contracts,
  not AssemblyScript runtime execution or live-chain evidence.
- Package scripts run the installed pinned graph binary, avoiding global 0.97.1 or implicit downloads.
- Install disabled lifecycle scripts, then a frozen-lock reinstall passed without changes.
- Deferred the manifest-generation script until G3 actually introduces build-manifest.ts,
  instead of shipping a command referencing a nonexistent file.
- Kept the planned Matchstick dependency/test script pinned but did not claim a Matchstick run.
- No broad root test/typecheck/build was run: parent owns full gates and canonical F-before-G merge.

## TDD and real local verification

1. Wrote subgraph/checks/scaffold.bun.test.ts before source/ignore changes.
   Genuine Red: 0 pass / 6 fail (missing package, ABI, manifest, schema, README and ignore rule).
   All failures were observed; no temporarily disabled assertions. This preceded the recorded
   08:51:02 UTC Green checkpoint.
2. Created the exact temporary G1 schema, minimal v1 Settled ABI, source/manifest and truthful README;
   added subgraph/generated/ to both ignore files and subgraph/ only to Docker's extra exclusions.
   Green at 08:51:02 UTC: 6 pass / 31 assertions.
3. Pinned isolated install completed by 08:52:31 UTC: graph-cli 0.98.1, graph-ts 0.38.2,
   matchstick-as 0.6.0; Bun reported 447 packages installed. subgraph/bun.lock is the only new lock.
4. Real `bun --no-env-file run codegen` PASS, then `bun --no-env-file run build` PASS:
   generated contract/schema types and build/FeeSplitterSmoke/FeeSplitterSmoke.wasm produced.
   This was the actual local Graph compiler, not a stub. Both ran without elevated network access.
5. `bun --no-env-file install --frozen-lockfile --ignore-scripts` PASS: no changes.
   Exact local CLI output: @graphprotocol/graph-cli/0.98.1 darwin-arm64 node-v24.15.0.
6. Focused existing repo-hygiene Vitest: 7/7 PASS at 08:53:12 UTC (14:23:12 IST).
   Existing root dependency binary used read-only; no root install or package edits.
7. git check-ignore confirms generated/, build/ and node_modules/ are excluded via intended rules.
8. Final targeted strict TypeScript check of the Bun scaffold test PASS; repeated package
   `test:scaffold` remains 6/6 with 31 assertions; git diff --check PASS. Source is FROZEN,
   and an independent read-only review was requested from C1. Report changes only afterward.

## Root isolation fingerprints

Before and after install/codegen, all unchanged:

- package.json SHA256 98e40dbe5c4ea92424e3ae8dc54f62c55f01579e0c88f875cc196577bb84f4bf
- bun.lock SHA256 a68c3f92a0916ed6d52d5be97ace24dc61ef776054904c81045c6316420b3ef7
- tsconfig.json SHA256 dcf512c449c43810877272881005597b366f049158fb9e5dc806f3a75c4f096a
- vitest.config.ts SHA256 ef564e360cd26de73794bd9330363b2ffed1fca5349a6790555ea4415601f9d1

## Private progress ledger

- Task1 local scaffold: implemented, focused checks/codegen/build PASS; pending independent review.
- Task1 full live gate: OWNER-PENDING; no credential or account access attempted.
- Tasks2–6: not started, gated on real live Task1 acceptance/query proof.
- F-before-G merge: preserved; root owns staging/commit/rebase/full gates.
- Suggested truthful subject: `feat(subgraph): prepare offline Arc ledger smoke build`.
