> Public execution record. Original retained unchanged in private task preparation; this report is a dated offline checkpoint, not live authorization or evidence.

# A9 historical fixture compatibility checkpoint

Completed 2026-09-05T11:03:22Z on `codex/a9-historical-fixtures` from
`381093ef9e701d0d3b070812a46dcc41995850e6`. No commit, stage, full gate, real key,
account, live RPC/provider request, Arc purchase, or live-proof/journal change was made.

## Outcome

A9's keyless HTTP + Unix-broker + test-rail regression now builds its three historical
skills from versioned byte snapshots. Planned G14 edits to the current wallet source or
manifest therefore cannot silently change that historical offline test. The real lineage
entry point still calls `prepareLineageSkills`, which selects only current `skills/*/arcade.json`
and `skills/*/run.ts` and applies the original exact `assertCanonicalListings` guard before
starting a hub, runner, or buyer.

This compatibility checkpoint is normal autonomous test maintenance and does not require
owner authorization. Funding or re-running the real A9 purchase remains a separate OWNER
action.

## Files and boundary

- Narrowly refactored only the `prepareLineageSkills` construction block in
  `scripts/e2e-lineage.ts`: one shared explicit-byte builder, unchanged current-source loader,
  fixed test-only historical loader, and fixed SHA-256 verification.
- Extended `scripts/e2e-lineage.bun.test.ts` without removing any prior assertion. The two
  historical entry/cycle setup calls now use the fixed loader; the live implementation still
  uses the current loader.
- Added `scripts/fixtures/lineage-a9-2026-09-05/README.md` plus three exact manifests and three
  inert `run.ts.txt` program snapshots.
- Did not edit `scripts/e2e-lineage.sh`, `skills/loop-probe/arcade.json`, any live skill source
  or manifest, configuration/role/price/authorization/verifier/send logic, proof or journal.
  No CLI, environment, directory, or profile selector can select historical bytes.

## TDD and verification

1. Genuine Red: after adding the historical fixture/builder tests but before implementation,
   `bun test scripts/e2e-lineage.bun.test.ts` failed at import with
   `Export named 'prepareLineageSkillsFromSourcesForTest' not found`: 0 pass, 1 fail, 1 error.
2. The first post-implementation sandbox run passed 18 tests / 193 assertions; only the existing
   owned HTTP cycle failed because the default sandbox refused `Bun.serve({port: 0})`. This was
   not counted as product Green.
3. The same focused file with owned loopback/Unix-socket permission passed 19/19 tests and
   206 assertions in 9.89s. It exercised the real hub router, runner, hire broker and buyer SDK
   on `RailTest`, including the original capacity-2 failure, capacity-3 three-job success,
   two committed reservations and actual unsigned `lineage_cycle` response. It made no live
   provider/RPC/chain request and used no real key.
4. `bunx tsc --noEmit`: 0 diagnostics. Root `tsconfig.json` explicitly includes `scripts/**/*.ts`.
5. `git diff --check`: clean. Frozen `bun install --ignore-scripts --frozen-lockfile` created only
   ignored dependencies; no manifest or lockfile changed.

New regression coverage pins all six fixture hashes, rejects in-memory source mutation, rejects
a `$0.15` current-wallet manifest mutation through the same canonical builder used by the live
loader, compares every generated guarded program byte to `guardedSkillSource(snapshot)`, and then
runs every former entry/cycle assertion against those frozen inputs.

## Exact retained-body hashes

The following SHA-256 values are identical before (`381093e`) and after this change:

| Retained bytes | Before | After |
| --- | --- | --- |
| `scripts/e2e-lineage.ts` lines 1–235 (all config, roles, prices, authorization, canonical listing/challenge/evidence validators, cycle observation and guard construction) | `d89e79e98e72fc9ba8db6b665eaa8975c49deb712f4d7ea8d643bf3077b96955` | `d89e79e98e72fc9ba8db6b665eaa8975c49deb712f4d7ea8d643bf3077b96955` |
| Exact validator block, original lines 84–200 | `28f1d94209e1a76d4104f170aa6ec2a8937ccad98642cff1d1a9fc8de15338e8` | `28f1d94209e1a76d4104f170aa6ec2a8937ccad98642cff1d1a9fc8de15338e8` |
| `scripts/e2e-lineage.ts` from `/** One fresh bounded run` through EOF (`runLiveLineage`, `main`, CLI guard) | `4636df210c48067452ef43ea3a8524c639050e8791d520aac233b583afd1c3b1` | `4636df210c48067452ef43ea3a8524c639050e8791d520aac233b583afd1c3b1` |
| Entire `scripts/e2e-lineage.sh` | `7be5639a203cd3fa5ef683149248d10561140f48fbabc3bd29df8ebf26973e4c` | `7be5639a203cd3fa5ef683149248d10561140f48fbabc3bd29df8ebf26973e4c` |

## Snapshot hashes

Each snapshot hash exactly equals its live source at base commit `381093e`:

| Skill | Manifest | Program |
| --- | --- | --- |
| `loop-probe` | `bfb1cf68e85d957935b81828aa72dbc30df786930545f791e86138f238491c3f` | `e70ba39feba972bca6b06b2ca0bd7e8cf62f35595a6ecec1869be4e529d0bd19` |
| `wallet-risk-note` | `1577e89bcf048a3a1f7851b2eec5072ad6555be043ac720851941713774466df` | `a713128d33f8b56c9a55298f83afbb37b8d4165a0b00797fb442624eb3368b62` |
| `usdc-flow-check` | `760df29360dba616e10aa51f075b07861368279556b1761c53b9334ba5a6230e` | `2f605bd93956b753f7463fa7a24d898fba393cefd8cd5efafa79e136086e9f7b` |

## Source deviation

The literal old helper read manifests first and each program immediately before writing it. The
refactor reads the same fixed ordered current paths into an explicit bundle before constructing
the owned directory. This changes no selected path, bytes, guard, generated manifest, executable,
or canonical check. It makes the data dependency explicit so tests alone can supply the verified
historical bundle. Historical bytes never enter `runLiveLineage` or `main`.
