> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G2 schema transition readiness (not implementation)

September 5, 2026. Read-only preparation after freezing the G1 indexed-match
publication. No G2 source, collected test, generated file, dependency, Git state,
network, key, runtime or deployment was changed. Parent has not released G2.

Read the complete G2 task, global constraints and G3–5 proposed mappings, current
G7 service and relevant tests, current smoke/schema/generated types, local pinned
Graph CLI generation path, D identity writer and actual FeeSplitterV2 contract.
The recommendations below are proposed compatibility decisions, not exercised
regressions or a review verdict on an implementation that does not exist yet.

## Smallest buildable transition

G2's literal expected codegen failure is not a reliable acceptance test. Installed
`@graphprotocol/graph-cli/dist/commands/codegen.js:88` calls `generateTypes()`;
`dist/type-generator.js:61–74` generates ABI, template and schema types. Current
`subgraph/generated/schema.ts:20–30` validates the ID then calls `store.set`; adding
a generated required-field setter does not force a caller to use it at compile
time. Codegen/build may therefore pass while a future runtime save is invalid.
Deleting `smoke.ts` while the manifest still references it also violates the
required build gate before G4. Neither failure is meaningful TDD for the schema.

Proposed minimal G2 ownership after explicit release:

- `subgraph/schema.graphql`: the eight named entities, with the bounded additive
  occurrence/claim corrections below, documented unknown versus verified fields.
- `subgraph/src/smoke.ts`: explicitly temporary G1-compatible adapter only. Import
  `Splitter`; load/create it from the actual event emitter, initialize its required
  scalar fields, attach its ID to Settlement, increment only its event-derived
  counters. Keep `listing` null. Preserve the original event ID and every original
  money/nonce/tx/block field. No guessed listing, seller, agent or contract version.
- New `subgraph/checks/schema.bun.test.ts`: real failure-first AST/schema tests.
  A narrowly approved update to the current-schema assertion in the existing
  scaffold test will be required; preserve the original G1 schema/adapter in Git
  history and a small immutable fixture if the parent wants that test retained.
- Private implementation report plus a clearly dated README compatibility note.

Do not introduce Marketplace singleton rows in the temporary smoke adapter: zero
agents/feedback in a manifest that does not yet index those registries is not a
complete marketplace count. Absent entity gives current G7 `stats()` null. This
keeps G2 smaller than prematurely implementing G4. The sole manifest, ABI,
toolchain versions and acknowledged G1 CID remain unchanged. Local schema changes
do not mutate that deployed CID or constitute new live proof.

## G7 compatibility and provenance

Current `apps/hub/src/graph.ts:48–77` selects the existing Marketplace counters,
Listing↔Agent and Listing↔Splitter relationships. `decodeEvidence` at 231 onward
checks reciprocal listing IDs, agent chain/ID and splitter address/counters; its
public API accepts only a listing ID. It does not independently know the current
hub seller, agent registry/ID or expected splitter. A mutually consistent set of
attacker-authored metadata can satisfy those shape checks.

Actual hub `store.ts:79–113` separately holds announced `feeSplitter`,
`splitterVerified`, `agentId` and `agentVerified`; `server.ts:522–537` enforces
first-claimed listing ownership and its handshake checks seller/splitter and
agent ownership. The subgraph cannot infer that off-chain authority from arbitrary
ERC-8004 keys. D `identity.ts:153` registers only the agent URI; current
`identity-cli.ts:199–210` persists registration before approval. Neither writes
`arcade.listingId` or `arcade.feeSplitter`. G5's ordering assumption is not a
currently implemented registration feature.

Proposed schema-compatible attribution contract:

1. Keep `Splitter.listing` and `Agent.listing` nullable and initially unset.
   Keep `Listing.agent` required, but create no canonical Listing until its binding
   is independently established. This makes existing G7 return null rather than
   synthesize a relationship.
2. Add a separate immutable `ListingClaim` keyed by metadata event occurrence
   (`txHash ++ logIndex`), with canonical agent relation, metadata key, bounded
   typed claim value, emitter, tx/block/time. Do not put arbitrary raw text into a
   public listing record; only supported keys with canonical bounded decoding.
   A claim records that the registry emitted it, not that a hub listed it.
3. Only a parent-approved static binding with exact registry, agent, seller,
   splitter, listing ID and evidence may populate reciprocal canonical links.
   Plain static `{address, listingId}` or an on-chain owner naming a globally
   recognizable skill is insufficient to establish hub assignment. A conflicting
   claim must not overwrite/reassign an existing canonical link.
4. Metadata-driven template discovery is not contract verification. Arbitrary
   contracts can emit look-alike events and fake version/seller/token getters.
   Unverified emitters must not affect the canonical Marketplace counters. Keep
   claims quarantined or do not instantiate a trusted settlement template until
   a separately approved code/deployment binding exists.

This intentionally leaves dynamic attribution unknown until G3–6 implement the
necessary authority. No new owner transaction/metadata announcement is authorized
by schema readiness. Before G8 public integration, the parent must either bind
G7 results to authoritative hub expectations or retain this strict null behavior;
reciprocal strings alone are not an independently verified seller relationship.

## Bounded event-occurrence identity without breaking G7 field names

`contracts/FeeSplitterV2.sol:219–224` accepts caller-supplied treeHash, uint32
childCount and childTotalAtomic and emits them. It does not enforce hash uniqueness
or validate a receipt tree. Distinct paid authorizations can carry the same hash.
G4's `new Tree(hash)` would overwrite a former root; uint32 `.toI32()` can also
wrap above 2,147,483,647, while current G7 expects GraphQL Int.

Proposed additive schema:

```graphql
type TreeOccurrence @entity(immutable: true) {
  id: Bytes! # actual txHash ++ logIndex; never tree hash alone
  treeHash: Bytes!
  root: Settlement!
  splitter: Splitter!
  childCount: BigInt! # full emitted uint32, without signed narrowing
  childTotalAtomic: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}
```

Retain the existing `Tree` hash lookup and query field names as a bounded summary:
add `occurrenceCount: BigInt!` and `ambiguous: Boolean!`; change `root` and displayed
`childCount: Int` to nullable. On one unique, in-range occurrence, populate the
summary. A second distinct event makes root null/ambiguous true, never silently
selecting a new root. An out-of-Int-range child count remains exact in the
occurrence and null in the summary, never wrapped. Current G7 `decodeTree` already
returns null when root or childCount is null, so no query change is necessary for
fail-closed compatibility. Other summary scalar fields must be documented as
first-observed rather than invented aggregate root facts; consumers require root.

Keep immutable Settlement IDs as actual tx+log occurrence. De-duplicate delivery
before counter increments, including static/template overlap; a template creation
guard is not an event-delivery de-duplicator. Do not infer child edges, balances or
receipt validation from the emitted digest/count. These are mined event claims,
not proof the referenced off-chain tree is valid. Full G4 mapping behavior and
collision tests remain separate from G2 AST/compatibility tests.

## Remaining schema semantics to settle before the corresponding mapping

- Agent chain+ID convention is only unambiguous with one pinned identity registry
  per chain. Preserve explicit registry bytes; never merge another registry's ID.
  Unknown owner must be nullable or the agent absent, not fake empty/zero bytes.
  G5 needs Transfer handling for current owner semantics, not Registered alone.
- Bare listing IDs are global hub names, not globally allocated ERC-8004 names.
  Agent-scoped claims avoid collisions and metadata ordering/reassignment bugs.
- Feedback counts are unrevoked registry records, not automatically
  settlement-backed service evidence. Revocation/repeated-response handling must
  be idempotent. A response threshold is a policy result, not trusted payment proof.
- Keep all money and unbounded counters as Graph BigInt with canonical nonnegative
  mapping rules; signed feedback values retain their actual signed range. Timestamp
  and block fields must never share units (`splitterFor` literal sets updatedAt to
  block number while other mappings use timestamp).
- G3 static list listingId is currently discarded by its rendered data sources.
  Future trusted bindings need explicit validated context, not implied attribution.
  G3 also references nonexistent mappings; stage a buildable manifest/compatibility
  transition rather than committing missing files or no-op full-coverage claims.

## Intended failure-first tests and gates (not run yet)

Use the installed isolated Graph/GraphQL AST tooling, not regex-only snapshots or
a new uncontrolled root dependency. Before implementation, the old smoke schema
must fail tests for the new entity set, field types/nullability, derived relations,
immutable occurrence keys and explicit claim-versus-canonical separation. Negative
AST fixtures should remove/change each required contract and prove the validator
rejects it. This is schema contract testing, not runtime Graph indexing.

Validate G7's actual three query selections against the new field types/relations,
including nullable root/listing rejection compatibility. Test the temporary
adapter's required Splitter relationship and preservation of original money/event
identity. If Matchstick is available and explicitly released, run real save/load
fixtures; otherwise distinguish local WASM compilation from runtime save evidence.
Do not claim compile-only proves required-field population.

G4 follow-on Reds must cover two events with the same digest, duplicate event
delivery, full uint32 child counts, conflicting metadata, arbitrary emitter and
missing trusted binding. G5 needs owner transfer, metadata ordering, repeated
revocation/response and unknown agent tests. No such implementation test was run
in this readiness-only task.

After parent release, run focused schema/scaffold tests, actual pinned codegen and
WASM build from `subgraph/`, exact nested strict for the Bun checks, then hand off
to parent for the full repository gate/commit. No deploy, upload, key or live
request is needed for G2. Public G1 historical proof must remain unchanged.
