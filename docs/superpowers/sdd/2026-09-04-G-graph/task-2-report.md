> Historical local G2 implementation report, September 5, 2026. Original retained unchanged; this public copy adds only this banner, with no body substitutions. Schema/source checks and WASM compilation are not graph-node runtime indexing evidence. Later parent gates are recorded separately.

# G2 ledger schema and buildable smoke transition

September 5, 2026. Local-only implementation on the G1 final checkpoint
`eccbbc8`. Parent released the bounded schema adaptations in
`internal/task2-parent-decisions.md`. No deployment, upload, key, payment, registry
write, network request, G3–6 implementation, Git mutation or full suite occurred.
Parent owns independent review, public copies, the full gate and atomic commit.

## Outcome and exact scope

Seven source/test/documentation paths are ready for review:

1. `subgraph/schema.graphql`: the eight planned entities plus immutable
   `TreeOccurrence` and `ListingClaim`. Required actual owner/registry fields,
   nullable unknown canonical relationships, atomic-money BigInt fields and
   bounded-consumer tree summary semantics are explicit.
2. `subgraph/src/smoke.ts`: temporary compatibility adapter for the same v1 pilot.
   It loads/creates Splitter from `event.address`, initializes first-observed
   block and counters, increments from the actual event and sets the required
   Settlement.splitter relation. It checks immutable event identity before
   counter changes. It never creates Marketplace, Agent or Listing records.
3. `subgraph/subgraph.yaml`: adds only `Splitter` to mapping.entities. No other
   manifest field changes; address, network, ABI, handler and startBlock persist.
4. `subgraph/checks/schema.bun.test.ts`: AST/schema contracts, negative mutations,
   actual G7 query selections, temporary-adapter source contract and status copy.
5. `subgraph/checks/scaffold.bun.test.ts`: the original exact-schema assertion
   reads the immutable G1 fixture and checks its SHA256. Current money/nonce/
   transaction-log mapping checks remain. The exact manifest expectation adds
   only Splitter; the other six historical/current G1 assertions remain.
6. `subgraph/checks/fixtures/g1-schema.graphql`: exact original 219-byte schema,
   not a reconstructed equivalent. Earlier informal byte estimate was wrong;
   the measured length and original frozen hash are used here and in the test.
7. `subgraph/README.md`: a new dated G2 local-transition section, exact local
   check commands and limits; all earlier G1 dated evidence sections unchanged.

No ABI, package, lock, root collection, hub, buyer, runner, registry handler or
other source was edited. Generated types/WASM outputs were produced by the
existing pinned commands in their already-ignored directories, not staged or
published. No new dependency or Matchstick binary was installed/downloaded.

## Genuine Red to Green

Before modifying schema, mapping, manifest or README, the new collected suite
ran against the existing G1 implementation. At 15:15:51 UTC it reported
**1 pass / 29 fail, 30 cases, 29 assertions**, exit 1. The primary failures were
missing ledger entities and required splitter relation, actual G7 queries with
unknown schema types, absent duplicate-event guard, missing emitter declaration
and missing local-transition note. This was an actual execution, not a predicted
failure or a compiler failure invented from the plan.

The mutation cases targeting fields absent from G1 also failed their construction
assertions (the replacement did not occur). Those are distinguished from the
primary missing-contract Reds; they do not prove negative-mutation behavior until
the final schema exists. All final negative mutations now change their targets
and are rejected by the test contract. The one initially passing negative case
was Settlement.totalAtomic, which already existed.

After implementing the approved transition, **37 passed / 0 failed / 109
assertions across both files** by 15:18:26 UTC. A later repeat after finishing the
README passed the same 37/109. No expectation was weakened to make an unsupported
schema or query pass. The prior schema comparison was deliberately moved to its
hash-pinned historical fixture; the new independent AST checks target the actual
current schema.

The TypeScript-testing skill guided actual failure-first execution, meaningful
schema/query contract checks, existing Bun tooling and exact nested typing. It
did not trigger any broader source, Git or network actions.

## Verification actually performed

From repository root:

```bash
bun --no-env-file test subgraph/checks/schema.bun.test.ts subgraph/checks/scaffold.bun.test.ts
git diff --check
```

An exact nested TypeScript program used the parsed root tsconfig compiler
options, noEmit, and exactly both check files as roots. It returned **zero
diagnostics**. Root tsconfig does not normally collect these nested subgraph
checks; this check was explicit rather than assumed from root typing.

From `subgraph/`, using the installed package binaries:

```bash
bun --no-env-file run codegen
bun --no-env-file run build
```

Actual codegen exited 0, writing the event and schema generated classes.
Actual build exited 0, compiling FeeSplitterSmoke to WASM and writing the build
manifest; completion was observed at 15:20:52 UTC. The CLI is the existing pinned
Graph CLI 0.98.1 with graph-ts 0.38.2, not a global/unpinned bunx installation.
The AST checks use the existing isolated transitive GraphQL 16.11.0 module.

G7 compatibility tests extract all three actual query strings from
`apps/hub/src/graph.ts`. GraphQL validates their persisted-field selections against
the current schema plus a minimal representation of Graph's query/scalar/_meta
facilities. Those facilities are test-only, not extra persisted entities. This
is field/type compatibility, not an actual Studio query or a claim about Graph
server responses. A removed childCount field makes the real Tree query invalid.

Source checks assert the adapter's guard precedes counter changes, required
emitter assignment and firstSeenBlock/source initialization, and no canonical
listing or incomplete Marketplace fabrication. They are explicitly source checks,
not runtime graph-node store/save execution. No Matchstick/runtime save/load,
duplicate delivery, collision, registry mutation or live query test is claimed.

## Approved deviations from the literal plan

The plan expected codegen to fail merely because a new required splitter setter
was unused, then proposed deleting the only mapping before later tasks. Installed
Graph CLI generation and the generated save path do not establish that expected
failure; deleting the referenced mapping would instead break per-commit builds.
The schema contract provides genuine Reds, while the small adapter keeps the
existing manifest buildable and populates the new required relation.

Tree identity is occurrence-based as well as hash-based. `TreeOccurrence` keeps
the full emitted uint32 childCount in BigInt and exact transaction/log facts;
`Tree` retains G7's existing hash query shape but permits null root/count and adds
occurrenceCount/ambiguous. Future mapping rules clear root on distinct collisions
and null nonrepresentable Int counts. This schema does not execute those future
rules or validate the caller-provided receipt-tree hash.

Arbitrary metadata can create only a separately typed immutable ListingClaim,
not assign a canonical Listing. Claim fields have no raw arbitrary-payload slot;
future mapping logic must enforce supported keys, one matching typed field,
canonical bounds and actual registry/agent identity. Nullable canonical links
remain unknown until independently trusted binding. Current-owner transfers,
untrusted dynamic emitters, idempotent registry counters and attribution authority
remain G3–5/G8 constraints, not implemented G2 features.

The temporary pilot-only adapter creates no Marketplace singleton: an unindexed
registry is not proof of zero agents or feedback. Existing G7 can return null for
the absent aggregate or unknown listing relationships. G1's deployed CID and
its historical indexed results remain unchanged by local schema evolution.

## Frozen file hashes

| Path | SHA256 |
| --- | --- |
| subgraph/schema.graphql | `913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483` |
| subgraph/src/smoke.ts | `e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d` |
| subgraph/subgraph.yaml | `1180f3f59595f4c5f94343e70039dcfdf6803198da3887aeaa5c5f0306d25fce` |
| subgraph/checks/schema.bun.test.ts | `a82dd0864b691ad78f4fd58c7d713844bfbf9d0f781e678c33f5ae88731578e6` |
| subgraph/checks/scaffold.bun.test.ts | `f017fdf74cba4103fc1d7e15a068e57e4b984211ed752c60e86638ed284261d3` |
| subgraph/checks/fixtures/g1-schema.graphql | `114cfff3389dccb395606f4aa6db60d02fb49c7a5886788cf5dc6f64777aee1c` |
| subgraph/README.md | `aabf3eb552a8af2c80f9127d9163bd093442b12592b8882e5cb64c417e854ade` |

Unchanged ABI/package/lock hashes:

| Path | SHA256 |
| --- | --- |
| subgraph/abis/FeeSplitter.json | `e3afd30b6cab0f1a33ce79e17ffb6605201e2e6d93b3cff7ac6b903fb236faea` |
| subgraph/package.json | `653d6efaede4d833398df54c97875bfe829f5a69a0d235b26f75ba29934ddbbe` |
| subgraph/bun.lock | `850b4b28d9dc3951346a9c50d0b180cd6bcb94807900336dee24ae79ede7a5b1` |

Read-only comparisons confirmed the manifest is byte-identical to HEAD after
removing the one added Splitter entity line, and the fixture equals HEAD's entire
original schema. All three G1 historical/indexed README sections compare equal.
The public G1 report directory has no changes. No source release beyond G2 or
future full-gate result is inferred. Seven paths and this ignored report are
frozen for parent review.
