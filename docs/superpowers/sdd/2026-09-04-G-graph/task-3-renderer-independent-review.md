> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 staged renderer — independent review

September 6, 2026. Verdict: **CLEAN for the seven frozen renderer paths.**
Independent focused execution completed by 01:50:04 UTC (07:20:04 IST).
No source correction requested. Actual Graph codegen/build, parent README/ignore
changes, repository gates, Git and deployment are outside this verdict.

## Frozen scope and source review

Read the complete 146-line author report
`task-3-renderer-report.md` at
`2fb1a57e3555302ffbe563ebac10bbe444bbfa7f376e74ad2a0d7de5abfed57c`,
all source/template/list/package and all three complete test files, complete G3
parent decisions, accepted readiness, actual public chain JSON and prior G2
report/boundaries. The ts-testing skill guided scoped actual CLI behavior,
strict typing and explicit historical-failure attribution.

All seven fingerprints matched before and after independent checks:

| Path | SHA-256 |
| --- | --- |
| subgraph/build-manifest.ts | b31afaf3752371fe41ccfbceaab1c6a6e7f24ec0a4bcbaf490ba95a3e4fc409f |
| subgraph/subgraph.template.yaml | 0e36412f5b4ce5b862151b4885e048391078113caf10975bdc88aa70ab5f2f60 |
| subgraph/splitters.json | 4874ccc5cd91917aae0256f9fd743fb4b1ad14faf660c0789ed8805bf16be7fa |
| subgraph/checks/manifest.bun.test.ts | a17d4e82d333766f30519b0313aa7e9d41eee9328aef07198c463182d2dd6648 |
| subgraph/package.json | 2a0ebda9df5013c2e36f577f557212f0e7e9222fe02fa39600d9044d8f6123b6 |
| subgraph/checks/scaffold.bun.test.ts | 9278e33873b1950a02b7dab5bbe43b4997887019ccd8f5eb748fe9d2febded5c |
| subgraph/checks/schema.bun.test.ts | 0210074ec5233edf4ff70c6bf046493094fecb23598a168fa89a52f371666d6d |

The renderer's active output is exactly the accepted pilot: FeeSplitterSmoke,
FeeSplitter ABI, smoke.ts, Settlement/Splitter, one Settled handler, Arc testnet,
historical block zero and explicit prune:never. There are no registry data sources,
dynamic templates, canonical listing context or inactive-ABI activation. The
four candidate ABI files are not prerequisites of the local writer.

Own-data capture rejects accessors/toJSON without calling them, extra keys,
noncanonical object/array forms, controls and changed chain facts; reflective
exceptions cross a fixed local error boundary. The inert chain constant matches
the actual complete JSON selection and does not import environment-selecting core
code or malformed JSON before the CLI guard. This is an exact local selection
pin, not implementation/proxy/ABI provenance. Changing a pin requires review.

Splitter input is closed, bounded and case-normalized before duplicate checks.
The numeric range is explicitly checked, then the only accepted pilot is further
restricted to zero: in-range positive blocks are not silently promoted to creation
evidence. Template replacement occurs once; final parsed YAML must equal the
complete approved structure and contain no unresolved brace markers. No arbitrary
template, emitter, source path, network or authority fallback is introduced.

buildManifest validates/reads its explicit file inputs inside its error boundary,
renders before touching the destination, checks only the active files, then uses
an exclusive same-directory temporary file and rename. Invalid input or missing
active files leave prior output unchanged. This is the approved cooperative local
filesystem contract, not fsync/crash durability, concurrent-writer arbitration or
a hostile-path/symlink guarantee. Failed temporary output is best-effort removed.

CLI imports are inert; the actual entry takes no configuration arguments and
resolves paths from its module rather than cwd. Package scripts render before
codegen/build with nested --no-env-file and the pinned installed Graph command.
The existing deploy script gains preparation, not implicit invocation; no script
containing deploy was executed during this review.

## Independent execution

From subgraph/, with only the captured executable PATH in the parent environment:

```sh
env -i PATH="$PATH" bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
```

Observed **89 passed, 0 failed, 192 expect() calls, three files, 260 ms, exit 0**:
52 manifest, seven scaffold and 30 schema cases. This includes actual Bun child
imports/CLI success, malformed splitter and chain JSON, forbidden arguments,
another cwd, missing active prerequisites and prior-output preservation. The
owned-temp fixture deliberately lacks inactive ABI files and generated YAML.
Children use an empty environment and --no-env-file, captured streams and a
five-second kill fuse; the exercised children exited and were awaited. Fixture
directories are removed in finally. No child service or network is used.

Independent fileless TypeScript compiler-API checking read the real root config
with absolute configFilePath and all inherited options, rooted the program at
build-manifest.ts plus the three checks, set noEmit:true/incremental:false, and
included parse errors and pre-emit diagnostics. Result: **four roots, strict:true,
zero diagnostics, exit 0**. No root include/exclude or compiler option was weakened.

Both existing schema/scaffold checks now consume pure rendering of committed
inputs instead of ignored subgraph.yaml. An independent in-memory reversal of
only the approved renderer imports/substitutions, scaffold prune field and
package preparation scripts reconstructed these exact G2 fingerprints:

- scaffold check: f017fdf74cba4103fc1d7e15a068e57e4b984211ed752c60e86638ed284261d3
- schema check: a82dd0864b691ad78f4fd58c7d713844bfbf9d0f781e678c33f5ae88731578e6
- package: 653d6efaede4d833398df54c97875bfe829f5a69a0d235b26f75ba29934ddbbe

No files were rewritten for that comparison and no Git operation was used.
Current schema, smoke mapping, v1 ABI, immutable G1 schema fixture and isolated
lockfile also still match their recorded G2 hashes. Historical money/event,
G1 evidence and G7 query-selection assertions have not been weakened or replaced.

## Historical attribution and exclusions

Author evidence remains separate: two genuine initial collected Reds for absent
prune/render-before-codegen behavior; seven implementation failures caused by
flow-style serialization rejected by the strict output guard; then the actual
malformed-chain CLI diagnostic Red caused by top-level JSON import. The final
inert pin/guarded IO fixes that observed boundary. Additional rejection cases
are supplemental coverage, not invented preimplementation Reds. This review
read that chronology and reran its final regressions; it did not recreate the
earlier checkpoints or modify their report.

Only this private independent report was added. No source/test, dependency,
generated manifest/types/WASM or public document was edited. No full suite,
codegen/build, Matchstick, container, network, key, registry interaction, funding,
upload, deploy or Git command was run. Local parsing/CLI success does not prove
deployment compatibility, chain creation heights, active registry coverage,
mapping save/load or new indexed results. Parent retains those separate gates.
