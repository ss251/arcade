# G2 local ledger schema checkpoint

September 5, 2026. The accepted G1 indexed-runbook evidence checkpoint committed
as `eccbbc8`. Parent then released G2 local schema work only. No deployment,
upload, registry write, key, payment or network request was authorized or performed
for this schema transition. G1's acknowledged CID and historical reports remain
unchanged; G3–6 and the full F-before-G merge order remain separate gates.

## Implemented scope

The schema now defines the eight planned ledger/registry entities and two
approved additions: immutable `TreeOccurrence` and `ListingClaim`. Event identity
is transaction hash plus log index. Exact emitted uint32 child counts use BigInt;
the hash summary retains nullable root/count and explicit ambiguity fields for
later mapping rules. Metadata claims remain separate from canonical assignment.
Required owner/registry values are not replaced with empty or invented identities.

The temporary pilot-only smoke adapter attaches Settlement to its actual emitter,
initializes emitter counters and first-observed block, and checks immutable event
identity before changing counters. It preserves the original money/nonce/tx/block
fields and leaves listing attribution unknown. It creates no Marketplace or
registry rows from incomplete coverage. Only `Splitter` was added to the sole
manifest's entity declaration; address, network, ABI, handler, startBlock and
toolchain did not change.

Seven reviewed paths cover schema, adapter, that manifest line, two Bun check
files, a hash-pinned 219-byte original G1 schema fixture and a dated subgraph
README note. The [implementation report](task-2-report.md) retains exact file
hashes, deviations, checks and limits. The [operator notes](../../../../subgraph/README.md#g2-local-schema-transition)
include the focused local commands.

## Failure-first and verification evidence

At 15:15:51 UTC, the new suite actually ran against the old G1 source:
**1 passed / 29 failed** across 30 cases. Primary failures were missing entities,
the required emitter relation, real G7 query types, adapter guard and dated note.
Mutation cases targeting fields that did not exist also failed construction;
these are not claimed as successful negative-mutation evidence at that point.

After implementation, the combined suite passed **37 checks / 109 assertions**
by 15:18:26 UTC and again on the final repeat. All mutations now alter actual
fields and exercise rejection. The exact nested TypeScript check had zero
diagnostics. Actual pinned codegen and WASM build exited zero; build completion
was observed at 15:20:52 UTC. Parent read the source and found no actionable
source issue. Its separate full gate then passed: 2,338 Vitest tests /115 files,
378 Bun tests /3,756 assertions /33 files, including 19 private G1 runtime/security
checks, and root/web strict TypeScript zero diagnostics. Parent also repeated
37/109 focused checks, exact nested strict and frozen fingerprints. Parent's own
codegen/WASM repeat and the local commit remain pending here; the author's actual
successful build is not presented as a separate parent run.

The AST tests validate current schema fields and all three actual G7 query
selections. Adapter source checks and successful compilation are **not**
graph-node save/load, event-replay, collision, registry-handler or live indexing
evidence. No Matchstick execution/download or new Studio result is claimed.
G3–5 must implement trusted attribution, full occurrences and registry rules
before later public evidence integration can rely on them.

## Publication privacy and history

The original report SHA256 is
`2bfe9a927e508729e20ef06935aba2b9bf27ac194cc3bb45bf590910134d3bed`.
The public report is exactly its original body plus a two-line historical banner.
Explicit scrub map: **none**. The body has no credential, personal/temp path or
private clickable link. Repository-relative operational paths and source hashes
remain non-clickable historical references. No private runtime, journal, owner
handoff, profile or screenshot is exported. All prior G1 records remain intact.
