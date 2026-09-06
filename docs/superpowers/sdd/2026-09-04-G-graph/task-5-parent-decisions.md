> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G5 parent decisions — September 6, 2026

Preparation only; implementation awaits the explicit post-G4-commit release.
Parent read the full247-line readiness, full Task5, installed-type findings,
current schema/G7 decoder and G3 provenance limits. The following bounded
adaptations preserve actual registry facts without promoting metadata authority.

1. Approve one immutable RegistryEvent entity and its precise schema-test change.
   Required fields: id Bytes, registry Bytes, kind String, disposition String,
   txHash Bytes, blockNumber/timestamp/logIndex BigInt. Values of kind/disposition
   come only from closed helper constants, never raw metadata. Use G4's occurrence
   identity and range policy. Exact replay returns before state changes. Persist
   prerequisite skips/conflicts to avoid later replay fabricating backfill.
   Policy is canonical Graph event order plus arbitrary exact replay, NOT general
   out-of-order first delivery. A failing handler does not claim a successful
   marker. Unsupported keys do not create claims or Agent mutations.

2. Agent creates only from Registered with the exact pinned emitter, actual
   nonzero owner and full-width ID. Distinct duplicate/conflicting registration
   never resets owner/counters/creation. Known Transfer updates actual nonzero
   recipient and timestamp, clearing agentWallet. Mint-before-Registered and
   unknown-agent events create no placeholder. URIUpdated by an operator never
   changes owner; invalid URI clears the optional URI. A known-Agent transfer to
   zero is a fixed fail-closed unsupported transition BEFORE writes: the current
   required-owner schema cannot truthfully represent burn. Do not keep stale
   ownership or create zero/empty canonical owner, or remove referenced Agent.
   This is a documented indexing refusal, not proof the implementation can burn.
   No canonical Listing is created, so no reciprocal link invalidation is hidden.

3. Approve the readiness's exact four claim bounds: listing ID lower-case ASCII
   /^[a-z0-9][a-z0-9-]{1,63}$/; nonzero20-byte address from exact42hexcharacters;
   canonical uint256 decimal includingzero; endpoint1..2048bytes valid UTF8 with
   no C0/DEL, stored opaque and never fetched/linked. URI fields similarly bounded
   to2048bytes. Validate UTF8 strictly before conversion; malformed, oversized or
   unsupported values fail closed without aborting valid unrelated registrations.
   Check indexed-key hash equals keccak256 of the unindexed supported key.
   agentWallet metadata remains ignored; it is neither a supported immutable
   ListingClaim nor proven canonical wallet authority. All four arcade keys are
   independently recorded claims, regardless of key order or cross-Agent reuse.

4. Feedback retains signed int128/uint8 decimals and full uint64 index. Validate
   indexedTag1 against its unindexed tag; bounded optional text may be absent if
   invalid. Logical duplicate/conflict never resets a revoked record. Revocation
   decrements observed-unrevoked count once; corruption/underflow fails closed.
   Validation retains first request identity and requires exact matching Agent
   and validator on each response. Named local classifier is PASSED for50..100,
   FAILED otherwise (retain raw0..255), not validator/payment trust. Pass count is
   latest-state delta, including pass->fail decrement; old exact response replay
   cannot rewind. Missing/conflicting prerequisites are remembered skips.

5. Keep production static sources exactly as G4. Add three INACTIVE registry
   templates with real mappings and exact staged ABIs solely to generate/compile
   actual types and run Matchstick. No registry template is instantiated. This
   avoids a second selectable production manifest or pretending missing handlers
   exist. G6 separately selects known static sources and documented observed
   epochs; current ABI correlation does not prove pre-upgrade history. No G5
   Marketplace creation or canonical relationships/dynamic splitter activation.

## Source ownership after explicit release

Mapping author: src/identity.ts,src/reputation.ts,src/validation.ts,src/registry.ts;
tests/identity.test.ts,tests/reputation.test.ts,tests/validation.test.ts.
Integrator: schema.graphql plus exact checks/schema.bun.test.ts expectations;
build-manifest.ts,subgraph.template.yaml,checks/manifest.bun.test.ts,
checks/scaffold.bun.test.ts,README.md. Parent must assign these disjoint roles at
release. No ids.ts or fee-splitter.ts edit without coordinating with frozen G4.
Actual generated registry imports may use templates/NAME/NAME (inactive template
namespace), preserving event types without pretending active registry sources.

Use only the provisioned pinned Matchstick binary and G4's proven invocation,
actual AS store assertions and failure-first behavior. Focused mapping tests and
nested strict only; parent owns sole full gate, final actual build and commit.
No source release, network/key/deploy/payment/push authority comes from this note.

## Explicit post-G4 release — 02:41 UTC

G4 committed f66fb5ab1d7ca70cc633e216c52513e6f776ea80,22exactpaths after its
single full2941Vitest/675Bun5148expect/rootwebstrict/actualGraphbuild gate and
27realAS/focused112Bun independent acceptance. GROOT trackedclean rechecked.
Parent now releases the G5 scope above to two disjoint owners: G3 agent owns
four registry source modules plus three AS suites; B9 owns the seven integration
paths (schema/schema-check/renderer/template/manifest-check/scaffold-check/README).
G14 reviews independently; parent owns full gate/build/Git/publication.

No schema/helper/mapping cross-edits without owner coordination. B9 coordinates
one codegen after all four real handler/helper drafts exist. A missing module or
compile setup failure is not a behavioral Red. Write tests first where possible,
record actual draft checkpoints honestly, and never seed incorrect production
solely to manufacture a failing result. Final templates declare only real used
entities/handlers; static pilot and existing V2 template remain unchanged.
Compute/validate counter invariants before writes; no partial-success marker on
refused corruption. Preserve G4's27ASsuite/source bytes. Sourcefreeze precedes
the parent's one full gate. No credentials, network, paid queries or deployment
are authorized for either G5 author; separate newly funded Graph cost-of-goods
permission remains queued and parent-owned, with0queries consumed so far.

## Post-release field clarification

Parent separately approved tag1's indexed-hash input bound during implementation:
valid Unicode scalar text, at most2048 UTF8bytes, empty allowed, before conversion
or keccak. Invalid tag1 is a remembered invalid_tag skip of that feedback with
no counter/state mutation. This overrides the otherwise independently omittable
optional-text rule only for tag1, because it participates in indexed-topic
correlation. Other invalid optional feedback text may be omitted independently.
Counts describe accepted/observed bounded records, not every emitted feedback.
The early UTF16length cap and strict scalar walk avoid hashing unbounded input.

Independent review also identified incomplete duplicate diagnostics: a second
logical feedback with changed retained tag2/endpoint/feedbackURI must not be
labeled an exact duplicate. Compare the normalized bounded optional values in
the duplicate/conflict decision while preserving the first stored record either
way. This does not reopen or resurrect a revoked record. Capture any actual
failing assertion as a behavioral Red, separate from earlier compiler failures.
