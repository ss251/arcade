> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 inactive ABI author checkpoint — September 6, 2026

Source/test frozen after the 01:42:32 UTC (07:12:32 IST) focused checks. Parent
released this slice after the clean G rebase onto main68bb915; the supplied G
base was0d79dbd17a05fe1764e9e31c5129724a0e3a6758. No Git command was used here.

## Scope and provenance

Only four new event-only JSON files and one new Bun check were written under
subgraph. The complete G3 task/global constraints, accepted parent decisions
including release, readiness f073e5d8, actual local contracts/core ABI and installed
Graph ABI implementation/declarations were read first. The ts-testing skill guided
collected baseline failures, focused checks and honest mutation-test attribution.

- FeeSplitterV2: Settled and SettledTree, matching the actual local Solidity
  declarations, including indexed buyer/nonce/treeHash and uint32 childCount.
- IdentityRegistry: Registered, URIUpdated, MetadataSet and ERC-721 Transfer.
  Transfer is the parent-approved addition to the literal plan; all three inputs
  are indexed, matching the shared core subset needed for later ownership work.
- ReputationRegistry: NewFeedback and FeedbackRevoked, preserving int128 value,
  uint64 feedbackIndex, uint8 valueDecimals and each exact indexed flag.
- ValidationRegistry: ValidationRequest and ValidationResponse, preserving exact
  argument order, names, types and indexed flags.

These are **inactive local candidates**, not explorer/deployment-verified ABIs.
URIUpdated, MetadataSet and FeedbackRevoked are absent from the existing shared
core subset and are explicitly compared to the retained plan candidates. Other
registry events are additionally compared to the actual core constants. No core
ABI, Solidity, v1 smoke ABI, schema, mapping, manifest, package script, lockfile,
dependency, public document or generated output was changed by this author.

The four files each parse through the actual installed Graph CLI0.98.1
`ABI.load(name, file)`. The tests compare raw JSON and parser `data.toJS()` to the
entire ordered event contract, then compare Graph `eventSignatures()`. The loader
normalizes JSON into Immutable collections; it is not deployment verification or
a sufficient semantic validator. Indexed flags appear in Graph signatures, while
argument names do not. Complete layout comparison therefore remains necessary,
including permutations among same-type arguments whose signature is unchanged.

## Genuine failures and correction chronology

The initial collected21-case run produced14PASS/7FAIL. Four failures were the
actual missing ABI files. Three additional failures were a new test-fixture
extraction mistake: selecting an inline filename in the plan's file list found
the first JSON block instead of that ABI's dedicated section. Anchoring the
dedicated line corrected the fixture without changing any expected layout.

Before any ABI was added, the repeated baseline completed by01:40:31UTC:
**17PASS/4FAIL,21 collected cases,34 Bun expect() calls**. All four failures were
missing files, not an uncollected module-import error. Each intended ABI parser/
layout test was collected and failed at its actual file read.

Eight in-memory mutation rejection cases passed already: indexed flag, signedness,
feedback width, child-count width, same-type argument order, omitted Transfer,
anonymous event and extra ABI member. These are supplemental checks of the exact
test contract, not manufactured production Reds, Graph-parser rejection claims,
or mutations written into a source ABI to force failure.

After the four JSON files were added, all21 cases passed. The first exact strict
check then found one test-only TS2769 diagnostic: Bun's typed toEqual expected a
mutable Input array while the actual core constants expose readonly tuples.
Copying each input into the comparison value preserved the identical fields and
assertion. No assertion or compiler option was weakened.

The final repeated check completed by01:42:32UTC: **21PASS/0FAIL,38 reported Bun
expect() calls**, one file,202ms. Node deepStrictEqual assertions additionally
enforce exact layout; the Bun expect count is not a count of all comparisons.

## Commands and type scope

From the G worktree:

```sh
bun --no-env-file test ./subgraph/checks/abis.bun.test.ts
```

A fileless `bun --no-env-file -e` TypeScript compiler-API check read the actual
root tsconfig with absolute configFilePath, parsed its options, and created a
program rooted only at `subgraph/checks/abis.bun.test.ts`, with transitive actual
core/Graph declarations and `{...parsed.options,noEmit:true,incremental:false}`.
Final result: **one root, strict:true, zero diagnostics, exit0**. JSON is exercised
by the parser/layout checks, not falsely counted as four TypeScript program roots.
The normal root include pattern does not cover these nested subgraph checks.

No codegen/WASM build, whole-repository gate, Matchstick execution, graph-node
indexing, network request, key, funded operation, upload, deployment, child service,
dependency installation or Git mutation occurred. Parent owns active-manifest
codegen/build and full gates; their future success cannot validate inactive ABI
deployment/use. Parent's separately reported explorer investigation is not this
author's evidence and has not silently promoted these candidates into verified
deployment coverage. Future source changes require a new reviewed checkpoint.

## Frozen SHA-256 inventory

| Path | SHA-256 |
| --- | --- |
| subgraph/abis/FeeSplitterV2.json | cebfd2284c59bafc22c2c87d52f548ac37592e0365ef1adbcf3b0f02620c7c99 |
| subgraph/abis/IdentityRegistry.json | 7a7b37bc16d8f75e7e4c7a4e5b74f3f0619238450b4670e2f2357fb85306998f |
| subgraph/abis/ReputationRegistry.json | 5588673aaa17123016e3e402e8fa35035733c60d8f2f277b06c5dfe38960218b |
| subgraph/abis/ValidationRegistry.json | 190bf5b7c4e0bc69c1921f16c30e55121ad00cee7ab1d170746bcbbefc46c24d |
| subgraph/checks/abis.bun.test.ts | 92e5fffcaf82f23ac92ac4f37d80566fe581839ad3d88abe8a0ee8f3ccc91983 |

Read-only source anchors at preparation: core erc8004.ts65297c9383e22ce35b8b7ec314ddb7eec4eadf183c7ca11870d79a8eb57d79ec;
FeeSplitterV2.sol2fffc2af0593acebea4c910fc9bf013149150773047b2bef664a4eed34bc5a16;
installed Graph abi.jsedd14eb12b766cbb85cceed63cbe5f75c63ad2e51946cf8fc2676a69add25eff.
