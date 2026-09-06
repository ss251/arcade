> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 inactive ABI slice — independent review

September 6, 2026, completed by 01:45:50 UTC (07:15:50 IST).
Verdict: **CLEAN within the five-file inactive local ABI scope.** No source
correction requested. This is not a deployment/implementation-ABI verification,
mapping runtime, active-manifest or whole-G3 acceptance verdict.

## Read and hash scope

Read the entire frozen author report
`task-3-abi-report.md` at
`e46c47927433033c7f2017e321a23060c94f9581308c5abeaf8cd0915d2d662f`,
all five files below, complete G3 parent decisions, the relevant full ordered
Plan G ABI candidates, actual local FeeSplitterV2 declarations and shared core
registry event constants, and the installed Graph ABI loader/signature source
and declarations. Global constraints and accepted G3/G2 readiness were already
read. The ts-testing skill kept actual parser/layout checks distinct from
mutation-contract supplements and deployment/runtime proof.

All five author fingerprints matched before and after independent execution:

| Path | SHA-256 |
| --- | --- |
| subgraph/abis/FeeSplitterV2.json | cebfd2284c59bafc22c2c87d52f548ac37592e0365ef1adbcf3b0f02620c7c99 |
| subgraph/abis/IdentityRegistry.json | 7a7b37bc16d8f75e7e4c7a4e5b74f3f0619238450b4670e2f2357fb85306998f |
| subgraph/abis/ReputationRegistry.json | 5588673aaa17123016e3e402e8fa35035733c60d8f2f277b06c5dfe38960218b |
| subgraph/abis/ValidationRegistry.json | 190bf5b7c4e0bc69c1921f16c30e55121ad00cee7ab1d170746bcbbefc46c24d |
| subgraph/checks/abis.bun.test.ts | 92e5fffcaf82f23ac92ac4f37d80566fe581839ad3d88abe8a0ee8f3ccc91983 |

Read-only anchors also matched the author report: core erc8004.ts
`65297c9383e22ce35b8b7ec314ddb7eec4eadf183c7ca11870d79a8eb57d79ec`,
FeeSplitterV2.sol
`2fffc2af0593acebea4c910fc9bf013149150773047b2bef664a4eed34bc5a16`,
and installed `dist/protocols/ethereum/abi.js`
`edd14eb12b766cbb85cceed63cbe5f75c63ad2e51946cf8fc2676a69add25eff`.

## Independent checks and substantive conclusions

The four raw arrays are closed event-only subsets. Names, argument order,
argument names/types/indexed flags and anonymous=false match the expected
complete layouts. Both splitter events match local Solidity, including indexed
treeHash and uint32 childCount. Identity Transfer has exactly indexed from/to/
tokenId with address/address/uint256 types. Shared core corroborates Registered,
Transfer, NewFeedback and both validation events. URIUpdated, MetadataSet and
FeedbackRevoked remain explicitly plan-only candidates, not silently upgraded
into deployed-contract facts. Reputation retains int128 value, uint64 index and
uint8 decimals, including distinct indexed flags for NewFeedback versus revoke.

The test invokes the actual installed Graph CLI 0.98.1 `ABI.load` for every file,
then compares both raw JSON and `data.toJS()` using Node deepStrictEqual, as well
as actual `eventSignatures()`. This loader parses/normalizes JSON into Immutable
collections; it does not independently reject all wrong semantic layouts.
Graph's event signature omits argument names, so the full ordered comparison
correctly protects same-type seller/fee argument swaps that signatures miss.
The eight in-memory negative cases exercise that exact comparison contract;
they are not represented as Graph-parser or live-deployment rejections.

Independent command, from the G worktree with an environment containing only
the captured executable PATH:

```sh
env -i PATH="$PATH" bun --no-env-file test ./subgraph/checks/abis.bun.test.ts
```

Result at the 01:45 UTC review checkpoint: **21 passed, 0 failed, one file,
38 Bun expect() calls, 222 ms, exit 0**. Node deepStrictEqual adds comparisons
outside the Bun expect counter; no inflated total is inferred.

The independent fileless TypeScript compiler-API command loaded the actual root
tsconfig with absolute configFilePath, retained its parsed options, added only
noEmit:true/incremental:false, and created a program rooted exactly at
`subgraph/checks/abis.bun.test.ts` with actual transitive declarations. Result:
**one root, strict:true, zero diagnostics, exit 0**. JSON files are not counted
as TypeScript roots. No global include/exclude or compiler option was weakened.

## Chronology attribution and limits

The author's original 14-pass/7-fail run is historical author evidence: four
missing ABI reads plus three plan-section fixture extraction errors. Its
corrected preimplementation baseline was 17-pass/4-fail, all four missing files.
Those are collected file-existence/parser-path failures, not evidence of an
already implemented mapping behaving incorrectly. The eight negative mutation
checks were already Green and are honestly supplemental. The later readonly-
tuple strict diagnostic was fixed by a value-preserving input copy. This review
read and checked the resulting source/report consistency; it did not delete
files or rerun/recreate those historical failures.

No source/test, v1 ABI, manifest, schema, mapping, dependency, generated output,
public document or Git state was edited by this reviewer. Only this private
report was added. No full suite, codegen/build, Matchstick, container, network,
key, funding, deployment or registry action was executed. Parent's separate
implementation-ABI/proxy/upgrade evidence work is not included or presumed here.
Any later ABI update from that evidence needs its own changed-layout checks and
review; the current verdict is limited to truthful inactive local candidates.
