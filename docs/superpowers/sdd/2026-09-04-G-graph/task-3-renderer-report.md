> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 renderer author checkpoint — local staging only

September 6, 2026. Final author checkpoint at 01:47 UTC. Seven owned paths are
quiescent for independent review and parent-coordinated codegen/build. This is not
deployment verification, runtime indexing, full-gate acceptance or commit evidence.

## Scope and approved adaptation

Read the complete parent decisions including the explicit source release after
main's gates and G rebase, the G3 readiness and actual plan/source boundaries.
Used the ts-testing skill: existing Bun runner, collected behavioral Reds, focused
deterministic checks and real owned-temp CLI integration. No dependency additions.

The renderer owns only build-manifest.ts, subgraph.template.yaml, splitters.json,
checks/manifest.bun.test.ts, package scripts and narrowly related current-manifest
assertions in scaffold/schema checks. ABI files/checks are a separate author's
slice. Parent owns README/ignore changes, generated-file tracking, full gates,
publication and Git. No G4/G5 handler, schema, smoke or v1 ABI change was made.

Literal G3 activation of missing registry/settlement mappings is deliberately
deferred. The output has exactly one FeeSplitterSmoke source, FeeSplitter ABI,
smoke.ts handler, Settlement/Splitter entities, prune: never, zero registry sources,
zero dynamic templates and no listing/ownership context. Start block zero is only
the accepted historical pilot exception, not an established creation block.

## API and local IO contract

```ts
renderManifest(template: string, chainConfig: unknown, splitters: unknown): string

interface ManifestPaths {
  readonly template: URL
  readonly chainConfig: URL
  readonly splitters: URL
  readonly output: URL
}
buildManifest(paths: ManifestPaths): Promise<void>
```

The pure renderer captures bounded own data without invoking getters or toJSON;
it rejects prototype/extra-key/accessor/symbol/sparse-array/control-byte inputs
and normalizes thrown proxy traps to one fixed diagnostic. The public chain
selection is pinned to the exact current config data, including the three registry
addresses. It is an inert local selection pin, not proof of deployed code or ABI.
Changing that committed configuration requires an explicit corresponding renderer
review; no ambient network or fallback selection is supported.

The closed splitter document contains only splitters and each entry's address/
startBlock. Case-normalized addresses cannot duplicate; no first-wins behavior.
Numeric block validation is integral 0..2147483647, with this active pilot further
restricted to its accepted zero. Nonzero heights inside that numeric range are
still unsupported pilot changes, not accepted creation evidence. Empty lists,
other emitters, listing IDs and activation profiles are rejected.

Exactly one SPLITTER_SOURCES marker is replaced using controlled data. The final
YAML is parsed and compared against the complete approved shape, rejecting extra
sources/templates/context, changed paths, pruning and unresolved markers. The
explicit file wrapper parses all JSON inside its fixed-error boundary and checks
only the three active schema/smoke/v1 ABI file paths before a same-directory
temporary-file rename. It does not require the four inactive ABIs. Invalid input
leaves prior output unchanged; unsuccessful temporary output is cleaned up.
This is ordinary cooperative local-file orchestration, not a hostile-filesystem,
crash durability or multi-writer claim.

The guarded CLI takes no arguments and resolves inputs/output from import.meta.url.
Imports do not write. It has no dotenv/environment reads, subprocess discovery,
network calls, credential lookup, deployment or package installation. Package
manifest/codegen/build/deploy preparation chains use nested bun --no-env-file and
the installed pinned Graph CLI. No deploy command was executed.

## Executed chronology, including failures

1. Before renderer implementation, the new test file inspected the existing
   manifest/package behavior: **0 PASS / 2 FAIL / 2 assertions**. The manifest lacked
   indexerHints.prune; codegen did not render committed inputs first. These were
   collected failures, not a missing-module loader failure.
2. Added the implementation and boundary/CLI coverage. The first combined run was
   **81 PASS / 7 FAIL / 173 assertions** across three files. Bun.YAML.stringify's
   default is flow syntax; the renderer's strict output guard rejected its own
   braces. The correction supplied explicit indentation to the installed serializer.
   No parser relaxation or allowed manifest-shape change was needed.
3. Combined checkpoint then passed **88 cases / 190 assertions** (51 manifest,
   7 scaffold, 30 schema). Exact four-root TypeScript checking reported zero
   diagnostics. Additional negative cases were coverage, not claimed baseline Reds.
4. Self-review found a concrete diagnostic gap: a top-level config JSON import
   failed before the guarded CLI could normalize malformed bytes. Added an actual
   owned-temp CLI regression and ran only `malformed chain JSON`: **0 PASS / 1 FAIL /
   51 filtered / 1 assertion**. Observed stderr exposed `Unexpected identifier
   "SENTINEL"` instead of the fixed diagnostic. This was a genuine supplemental Red.
5. Replaced that import with the inert exact public selection pin. All file JSON
   parsing now occurs within buildManifest. Final combined command passed
   **89 cases / 192 assertions** (52 manifest, 7 scaffold, 30 schema), zero failures.
   The exact four-root strict check was repeated after this change: **0 diagnostics**.

Focused command, from subgraph/:

```bash
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
```

Exact typing used the installed TypeScript compiler API, reading tsconfig.json and
its inherited strict options, replacing rootNames with precisely
subgraph/build-manifest.ts and the three above check files, then collecting parsed
config errors and ts.getPreEmitDiagnostics. It did not emit files or run the full
repository typecheck. A root-only check would omit this isolated subgraph slice.

The new CLI tests copy only inert source/public inputs/active pilot assets into
fresh owned temporary layouts. Actual Bun children use --no-env-file, an empty
environment, another cwd, captured output and a five-second kill fuse; they are
awaited/reaped. Temporary layouts are removed in finally. Tests prove success,
import nonmutation before/after output, fixed invalid-input/argument diagnostics,
missing-active-file refusal and prior-output preservation. No loopback or remote
service, key, signature, payment or real registry interaction is involved.

Existing scaffold/schema manifest assertions now render the committed inputs in
memory rather than read ignored YAML; historical schema hashes, money/event
identity, G1 evidence assertions and actual G7 query checks remain intact.

## Frozen owned SHA256 inventory

| Path | SHA256 |
| --- | --- |
| subgraph/build-manifest.ts | b31afaf3752371fe41ccfbceaab1c6a6e7f24ec0a4bcbaf490ba95a3e4fc409f |
| subgraph/subgraph.template.yaml | 0e36412f5b4ce5b862151b4885e048391078113caf10975bdc88aa70ab5f2f60 |
| subgraph/splitters.json | 4874ccc5cd91917aae0256f9fd743fb4b1ad14faf660c0789ed8805bf16be7fa |
| subgraph/checks/manifest.bun.test.ts | a17d4e82d333766f30519b0313aa7e9d41eee9328aef07198c463182d2dd6648 |
| subgraph/package.json | 2a0ebda9df5013c2e36f577f557212f0e7e9222fe02fa39600d9044d8f6123b6 |
| subgraph/checks/scaffold.bun.test.ts | 9278e33873b1950a02b7dab5bbe43b4997887019ccd8f5eb748fe9d2febded5c |
| subgraph/checks/schema.bun.test.ts | 0210074ec5233edf4ff70c6bf046493094fecb23598a168fa89a52f371666d6d |

Unchanged by this author at final check:

- Current generated-target subgraph/subgraph.yaml: 1180f3f59595f4c5f94343e70039dcfdf6803198da3887aeaa5c5f0306d25fce.
- smoke.ts: e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d.
- schema.graphql: 913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483.
- FeeSplitter.json: e3afd30b6cab0f1a33ce79e17ffb6605201e2e6d93b3cff7ac6b903fb236faea.

## Remaining parent gates and evidence limits

Parent was notified that all seven paths are quiescent and codegen/WASM build is
ready to run. Neither was executed by this author, avoiding concurrent generated
writes. Full gates, independent review and commit remain parent-owned and are not
inferred from these focused results. Inactive ABI checks belong to their separate
report. No Matchstick mapping runtime, graph-node persistence, new indexed data,
deployment identity/proxy/creation-block verification or new Studio operation is
claimed. G1's consumed deployment authority and historical CID remain untouched.
