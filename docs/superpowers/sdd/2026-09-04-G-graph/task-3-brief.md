# G3 — staged manifest and inactive ABI subsets

September 6, 2026. Local source and focused independent reviews are clean.
Parent's pinned code generation/WASM repeat and subsequent full repository
test/type gate passed. Final parent review publication and the atomic G3 commit
remain pending; this is not a new deployment or indexing checkpoint.

## Approved scope

The [plan's Task 3](../../plans/2026-09-04-G-graph.md#task-3-abis-the-manifest-template-and-how-splitters-get-announced)
is implemented as a bounded staging step under the
[parent decisions](task-3-parent-decisions.md), following Plan F's main merge,
successful main gates and the clean G rebase. The earlier G2 commit identifier in
the historical decisions is pre-rebase history, not the current G commit ID.

The rendered manifest retains exactly one existing FeeSplitterSmoke pilot with
the v1 ABI, smoke mapping and Settlement/Splitter entities, plus
`indexerHints.prune: never`. It has no registry data sources or dynamic templates.
The pilot's `startBlock: 0` is an explicit historical exception, not a verified
deployment block. The template, checked splitter list and renderer produce the
local generated manifest; tracking of that generated file is parent-owned.

Four inactive ABI subsets cover FeeSplitterV2 and the three ERC-8004 registries,
including Identity Transfer. Their exact event order, names, indexed flags and
integer widths are checked, with actual parsing by the pinned Graph CLI.
Compilation of the active pilot does not activate or deployment-verify these
inactive ABIs. See the [subgraph operator notes](../../../../subgraph/README.md)
for the current local preparation path.

## Evidence and its limits

The ABI author and independent reviewer each passed the same 21 Bun tests /
38 assertions and the exact one-root strict check. The renderer selection
passed 89 Bun tests /192 assertions across manifest, scaffold and schema checks,
with independent repetition and the exact four-root strict check. These are
separate runs, not additive unique-test totals. The reports preserve actual
initial failures, test-harness corrections and mutation checks that passed
immediately.

Parent subsequently completed actual pinned codegen and WASM build. That
supersedes only the earlier reports' pending parent-build statements; it does not
supply Matchstick execution, graph-node runtime evidence, new registry indexing
or a full-repository gate result.

The [provenance review](task-3-provenance-review.md) correlates the retained
provider snapshot's current implementation ABIs, proxy slots and upgrade records.
It explicitly does not establish complete upgrade history, independent runtime
code identity or the event layouts before those upgrades. In that snapshot, the
initial common implementation is not proved to be a dummy. Retained raw
provenance JSON and later private code corroboration are not published here.

## Historical records

- [Readiness and plan mismatches](task-3-readiness.md)
- [Parent decisions and explicit source release](task-3-parent-decisions.md)
- [Inactive ABI author report](task-3-abi-report.md)
- [Inactive ABI independent review](task-3-abi-independent-review.md)
- [Manifest renderer author report](task-3-renderer-report.md)
- [Manifest renderer independent review](task-3-renderer-independent-review.md)
- [Retained provenance snapshot review](task-3-provenance-review.md)

The seven report bodies retain their historical checkpoints, with the standard
banner and six approved literal privacy/link substitutions. G2's private
readiness/decisions remain retained, not newly published. This bounded selection
is not a complete Plan G archive.

No upload, deployment, Graph query, key access, signing, spending or push was
performed for this publication. G1's consumed deployment and indexed-runbook
evidence are not replayed. There is no new canonical listing binding, fabricated
marketplace count or implicit source activation. Parent's final review and
commit checkpoint follow separately.

## Later parent full-gate checkpoint

After the initial publication preparation, parent's sole full gate exited zero:
2,941 Vitest tests /131 files, 673 Bun tests /47 files /5,138 expect calls, and
root/web strict checks. The earlier codegen/WASM repeat had also passed. This
supersedes the initial publication preparation's gate-pending status and the
historical reports' pending gates, not their original test chronology. Parent's final review record and atomic commit
remain separate; no live deployment, indexing or paid operation is implied.

The [parent review](task-3-parent-review.md) is now published as an eighth
banner-only historical record, including the actual full-gate result, source
review and keyless provenance limits. Final publication audit and commit follow.
