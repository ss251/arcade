# G4 — settlement mappings and real local store execution

September 6, 2026. G3 committed as `e00cd89d1845d32660ddd5fa1ec3b181cd55a457`;
parent then released the bounded [Task 4 mapping scope](../../plans/2026-09-04-G-graph.md#task-4-settlement-mappings--settled-settledtree-and-the-aggregates).
Source and independent focused review are frozen and CLEAN. Parent's separate
full repository gate and final Graph build are still in progress at this
publication checkpoint; parent review and atomic commit follow separately.

## Scope and evidence

The pilot remains the sole active v1 static source with its explicit historical
`startBlock: 0` exception. Its new settlement mapping preserves exact emitted
money and transaction/log occurrence identity. One inactive V2 template supplies
real generated event types and handlers; no code instantiates it. There are no
registry sources, new emitters, canonical listing assignments or Marketplace
counts. See the [operator notes](../../../../subgraph/README.md).

Every unique tree event retains an immutable occurrence and full uint32 count.
Distinct events sharing a tree hash permanently clear the summary root while
preserving first facts; exact replay changes nothing. Summary counts above
signed-Int range remain null, not a fabricated zero.

Author and independent reviewer each passed the same 27 real native Matchstick
AssemblyScript/WASM/store cases, 112 focused Bun checks /240 expect calls and
exact four-root TypeScript check. These repeats are not additive unique-test
counts; the Bun selection includes 21 unchanged ABI checks. Author codegen passed;
the final parent Graph build is a separate pending gate.

The original reports retain two genuine unchanged-smoke log-index failures and
three manifest-transition failures. The later five nullable-field test failures
were a test helper's missing-only assumption, not mapping defects. Tree cases
added after implementation are supplemental passing coverage. No AS assertion
count, historical failing-source rerun or live indexing result is invented.

## Preserved historical records

- [Readiness and runtime constraints](task-4-readiness.md)
- [Parent decisions and source release](task-4-parent-decisions.md)
- [Pinned native runtime provision — CLI-only checkpoint](task-4-runtime-provision.md)
- [Mapping author report and complete source inventory](task-4-report.md)
- [Independent source/runtime review](task-4-independent-review.md)

These five bodies are exact historical copies after the standard banner and ten
approved literal location/link substitutions. The originals and pending statements
are preserved. Native binaries, executable probes, raw provenance JSON, private
G2 preparation and G6 readiness are not published.

Matchstick is real local mapping/store execution on synthetic events, not live
graph-node/Studio persistence, complete registry history, deployment identity or
off-chain receipt-tree verification. No network, key, funding, upload, deployment,
query or consumed G1 approval replay was performed for this publication.

## Later parent gate and build — 02:35:29 UTC

The sole frozen parent command subsequently exited zero: 2,941 Vitest tests /
131 files, 675 Bun tests /47 files /5,148 expect calls, root/web strict checks,
and actual pinned manifest regeneration, codegen and Graph WASM build. Repository
totals include retained private review fixtures; the 27 native AS cases remain
separate evidence. The build compiled the static pilot mapping and reused that
WASM for the inactive V2 template; it did not instantiate or deploy the template.

The [parent review](task-4-parent-review.md) is a sixth exact historical copy,
with the banner and zero body substitutions. Its final section supersedes the
pending gates above without rewriting earlier chronology. All 13 source hashes
remain frozen. Final public audit and the atomic commit remain pending; no new
indexing, network or funding result is claimed.
