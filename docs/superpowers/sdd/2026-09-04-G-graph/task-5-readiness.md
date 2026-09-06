> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G5 registry mapping readiness — decisions, not source release

September 6, 2026. Read-only preparation while parent closes G3. No source,
generated file, test, Git, network, key, dependency or live operation was changed
or executed. The only write is this ignored note. No proposed test below is an
executed Red or Green.

Read complete actual Task 5, G2 schema/parent decisions, current G7 graph service,
G4 readiness, G3 provenance review and the staged registry ABIs. Inspected installed
Graph/AssemblyScript/Matchstick implementations cited below. The ts-testing skill
informed real-handler behavioral coverage rather than a TypeScript ledger mirror.

## Minimum safe implementation direction

Implement three real handlers modules plus shared bounded registry helpers and
three real Matchstick suites. Do not implement the plan's Marketplace factory,
canonical Listing writes, Splitter creation or FeeSplitterV2.create calls from
metadata. All canonical relationships remain null/absent without a separately
approved trusted binding; a reciprocal string is not such a binding.

Current implementation ABI/event matches are provider-correlated at block
60670577. The retained slot/log/implementation evidence does not establish complete
upgrade history or pre-upgrade behavior. Registry creation receipts were null;
explorer creation heights alone are not archival receipt verification. Therefore
do not silently index creation-to-head with today's ABI or call counts complete.
Local handlers/tests can be prepared, but parent must explicitly choose the
activation epoch/evidence policy. Keep production registry sources inactive until
that choice and real handlers are ready. Test compilation must use an explicitly
scoped local test manifest if production activation remains held; no environment-
selected partial production manifests or no-op production handlers.

## Event identity and ordering

The existing schema lacks a general processed-event marker. Mutable Agent,
Feedback and Validation fields alone cannot prevent replay of an old applied
event after later changes. ListingClaim's immutable ID solves only claim replay.
Recommend one small **RegistryEvent** immutable entity, requiring parent schema
approval: occurrence ID, actual registry address, closed event kind/disposition,
transaction hash, block number, timestamp and log index. No arbitrary raw metadata.
ID uses the shared G4 transaction-hash/log-index convention, with the same explicit
range check before narrowing the log index. Validate the expected emitting registry
for the handler; chain+agent ID remains safe only under one pinned identity registry.

Load the event marker before any state/counter mutation; exact replay is a no-op.
Apply a transition and write its marker in the same handler transaction. Record
fixed skipped/conflict dispositions when remembering a supported but unavailable
event prevents later replay from manufacturing backfill. Unknown metadata keys
need neither claims nor state changes. A failed mapping transaction must not leave
a successful marker; actual host transaction behavior is a runtime test concern.

Minimum ordering policy: canonical Graph block/log order, plus exact duplicate
delivery at any later time. Do not invent an unbounded reorder buffer. A first-seen
response/revocation/metadata event whose prerequisite was not indexed is skipped,
not queued or used to fabricate an Agent/request/feedback record. A later prerequisite
does not retroactively apply that skipped event. This explicitly describes partial
observation, not complete history. Supporting arbitrary first-seen out-of-order
delivery would require additional per-stream cursors/tombstones and a separate
schema/semantics decision; timestamps alone cannot order same-block events.

## Identity and current owner

- Registered with the pinned emitter, valid full uint256 ID and actual nonzero
  owner creates Agent once, with actual registry, registration timestamp and zero
  observed counters. Bound the optional URI independently: invalid/oversized URI
  must not cause an invented owner or erase otherwise valid registration facts.
- Exact replay is caught by RegistryEvent. A distinct Registered occurrence for
  an existing ID must not reset its owner/counters/createdAt. Record a fixed
  duplicate/conflict disposition; never treat a later registration-shaped event
  as permission to overwrite an existing canonical identity.
- Transfer updates a **known Agent** to the actual nonzero `to` address and event
  timestamp. Mint Transfer before Registered creates no placeholder Agent; the
  subsequent Registered event creates it. Transfer for an unknown registration
  leaves it absent. `from` mismatch can indicate incomplete observation, but the
  actual pinned event's nonzero `to` is still its post-transfer owner; do not
  replace that evidence with a metadata-supplied address.
- URIUpdated changes only a known Agent's URI/time. `updatedBy` may be an approved
  operator; it is neither necessarily owner nor permission to replace owner.
  Unsupported/oversized new URI should clear the optional stored URI rather than
  keep a stale previous value looking current. No URI fetch/IPFS lookup is needed.
- Ignore arbitrary `agentWallet` metadata as canonical wallet authority in this
  slice. The approved claim schema supports only four arcade keys; it has no
  wallet-claim field. Leave agentWallet null. On ownership transfer clear any
  previously populated agentWallet. Canonical listing assignment stays absent;
  future trusted binding support must also invalidate both relation directions on
  transfer before it is enabled, not merely update the owner string.
- A Transfer to zero exposes a schema decision: required nonzero Agent.owner has
  no representation for a burned/no-current-owner identity. Do not silently retain
  the old owner, invent zero as a valid owner, or remove Agent and leave required
  Feedback/Validation/ListingClaim relations dangling. For the smallest unchanged-
  owner contract, propose a fixed fail-closed indexing error for this unsupported
  transition; parent may instead explicitly approve nullable owner + lifecycle
  state and consumer changes. No claim is made here that deployed registries can
  or cannot burn: the event ABI alone does not answer that question.

## Bounded metadata claims

Only known Agents can receive ListingClaim, with actual registry/event/agent
references. Key order does not matter: each supported valid event independently
creates exactly one typed immutable claim; no mutable multi-key claim becomes
canonical authority. Proposed bounds/policies for parent approval:

- `arcade.listingId`: ASCII lower-case/digit/dash, length 2..64 and leading
  letter/digit, matching the existing G7 accepted listing-ID grammar.
- `arcade.feeSplitter`: exactly `0x` plus 40 hex digits, nonzero; validate every
  nibble first and store the 20 actual bytes. This records an address claim, not
  deployed code, USDC/seller/version verification or dynamic-source permission.
- `arcade.priceAtomic`: canonical decimal `0` or nonzero-leading digits, at most
  78 digits and <= uint256 max. Preserve BigInt; no floats, signed coercion,
  native-gas scaling or `.toI32()`. Zero is a claim, not a proven free listing.
- `arcade.endpoint`: at most 2048 bytes of valid UTF-8, nonempty and without C0/DEL
  controls. Store bounded opaque URI text only; do not claim URL validation,
  normalize it, fetch it or create a link. A stricter supported-scheme policy is
  a parent choice, not reason to add an ad-hoc general URL parser in AssemblyScript.

Decode metadataValue bytes before calling host conversion. Reject truncated
sequences, stray continuations, overlong forms, surrogate code points, >U+10FFFF,
NUL/control bytes and field-specific grammar violations; no replacement-character
or empty-prefix acceptance. Invalid/oversized/unsupported claims do not mutate
Agent relations, create Splitter/Listing/Marketplace, or instantiate templates.

The indexed string key is a hash: installed Graph codegen maps indexed strings to
bytes32. Real tests must put `keccak256(UTF8(metadataKey))` in a fixed-bytes event
parameter, not the literal plan's fromString(key). Compare that hash to the actual
unindexed supported key before accepting a claim. NewFeedback's indexedTag1 has
the same generated Bytes behavior; do not decode a hashed topic as plain text.

## Feedback and validation transitions

Feedback key stays `5042002:agentId:lowercase-client:feedbackIndex`, with exact
uint256/uint64 components. Known Agent only. First NewFeedback records all actual
signed int128 value/uint8 decimals and bounded optional textual fields and adds
one observed-unrevoked record. A repeated logical key never resets isRevoked or
increments again; conflicting replacement facts get a fixed ignored-conflict
marker. Values may be negative; they are not money/payment amounts.

FeedbackRevoked for a known, not-yet-revoked record sets revoked state/time once
and decrements its Agent exactly once. Already revoked or missing feedback is a
no-op/remembered skip. NewFeedback replay after revocation cannot resurrect it.
Never decrement below zero or silently clamp corruption: a contradictory stored
counter should fail closed. Counts describe observed registry records, not verified
ARCADE service payments; do not apply the plan's misleading payment-evidence comment.

ValidationRequest is keyed by requestHash within the one pinned validation
registry. Known Agent only; preserve its first agent/validator/requestURI/creation
transaction/time and increment request count once. Duplicate request must not
reset an existing response to PENDING. A conflicting same-hash agent/validator
request must not replace or redirect that record.

ValidationResponse requires an existing request and exact matching incoming agent
and validator. Preserve actual response/responseURI/hash/tag/transaction and event
timestamp. The ABI permits uint8; the comment's 0..100 domain is not established by
ABI shape alone. Proposed explicit policy: PASSED only for 50..100 inclusive,
FAILED otherwise, retaining the raw uint8 even for 101..255. This is a named local
classification, not validator trust or payment proof. Parent must choose it (or
another explicit rule) before implementation.

Update validationPassCount by `newPassed - oldPassed`: pending->pass +1,
pass->pass 0, pass->fail -1, fail->pass +1. Request count never changes on responses.
Exact old response replay is ignored by its event marker, so it cannot rewind the
latest state. First-seen response without request, or with mismatched identity,
does not mutate any count. Do not silently clamp impossible negative counters.

**No G5 handler creates Marketplace.** Coverage is still incomplete without an
explicit source epoch/history/counter-completeness policy. Per-Agent observed
counters do not authorize aggregate zeros or a market-wide completeness claim.

## Actual G7 compatibility and installed runtime limits

`apps/hub/src/graph.ts` returns null for absent Marketplace; evidence requires
Listing plus reciprocal Agent.listing and Splitter.listing, exact chain/agent ID,
valid nonzero splitter, positive observed block and bounded counters. It does not
query ListingClaim, registry provenance, owner or attester identity. Therefore
reciprocal strings must not be manufactured to unlock this decoder. Claims-only
G5 naturally leaves stats/evidence unavailable. No G7 relaxation is needed.

graph-ts 0.38.2 exposes store get/set/remove, crypto.keccak256, Bytes, BigInt and
nullable generated relation setters. Bytes.toString is a host bytesToString
declaration without a fatal-validation promise; Bytes.fromHexString asserts on
odd length and parses pairs, and BigInt.fromString is a host call. Validate first.
Both inspected installed AS UTF8.decodeUnsafe implementations stop early on
truncated input and mask continuation bytes; neither is a strict UTF-8 validator.
The root isolated compiler package is AS 0.19.23; graph-ts additionally contains
AS 0.27.31. Do not confuse those with the actual Matchstick/compiler selected at
execution. Use only capabilities that the pinned real build/runtime demonstrates.

matchstick-as 0.6.0 provides real host store assertions, null/bytes/BigInt checks
and dataSourceCount. Its newMockEvent defaults reuse identities and short address-
derived hashes: fixtures must assign exact 32-byte tx hashes, unique log indices,
correct emitters, block/timestamp and typed parameters. It is not the Rust runner.
Reuse G4's explicitly verified native/container runner decision; do not run bare
graph test and accidentally download, or substitute a JS state-machine mirror.

## Small real Matchstick behavioral matrix

Call production handlers using generated registry types and assert actual store
state after each transition. Proposed minimum 20 cases (parameterized boundaries
may share a case; all execution remains pending):

1. Full-width registration, exact owner/time/registry; no canonical associations.
2. Mint Transfer then Registered; only one Agent, no fabricated mint placeholder.
3. Transfer A->B then replay the original registration/transfer: owner stays B.
4. URI update by a non-owner operator; invalid new URI clears old optional URI.
5. Every unknown-Agent route remains absent, including a later registration with
   replay of previously skipped supported events (no retroactive fake backfill).
6. Explicit zero-recipient transfer policy; no stale eligible owner/partial writes.
7. Four supported metadata types in arbitrary order produce four separate claims.
8. Claims by two Agents naming the same listing/splitter never bind either one.
9. Same metadata occurrence replay vs a distinct occurrence; immutable IDs/counts.
10. Exact indexed-key Bytes/hash binding, wrong topic hash and unknown/agentWallet keys.
11. UTF-8 valid multibyte + truncated/overlong/surrogate/control/oversize cases.
12. Address/ID/decimal zero/max/overflow/leading-zero/sign/whitespace boundaries.
13. NewFeedback signed int128 extremes, uint64 max index and exact indexed tag hash.
14. Duplicate/logical-conflicting feedback: one record/count, original facts remain.
15. Revoke twice, replay NewFeedback, and missing-feedback revoke: no resurrection
    or underflow; a corrupt counter fails closed rather than being clamped.
16. Duplicate/conflicting requests preserve first identity and any existing response.
17. Missing request/wrong agent/wrong validator response changes no record/count.
18. Pending->pass->pass->fail->pass then replay old responses: exact count deltas.
19. Response policy boundaries 0/49/50/100/101/255 with raw uint8 preserved.
20. Across all paths: no Marketplace/Listing/Splitter/template creation; time is
    timestamp seconds, IDs do not narrow/alias, and unsupported log indices refuse.

## Proposed ownership and explicit parent choices

Mapping author: `subgraph/src/{identity,reputation,validation,registry}.ts`;
tests `subgraph/tests/{identity,reputation,validation}.test.ts`. Keep reusable
event fixtures small within those suites initially, not another runtime layer.
Consume G4's frozen occurrence/agent-ID helpers; coordinate any tiny ids.ts change
with that owner rather than assuming the literal marketplace() API will exist.

Parent/integrator must separately release: the RegistryEvent schema addition and
exact schema-check expectation; registry ABI codegen/real mapping declarations,
needed manifest/check delta (or explicitly test-only manifest while activation is
held); Matchstick configuration and dated coverage docs. No hub/runner/payment,
metadata writer, deployment or arbitrary emitter-discovery source belongs here.

Before source release choose: (1) event-marker addition and canonical-order/
remembered-skip policy; (2) zero-owner/burn representation or fixed fail-closed
unsupported transition; (3) exact claim bounds and agentWallet omission;
(4) validation pass classifier and latest-response delta semantics; (5) activation
epoch/test-manifest route and actual runtime provisioning, leaving Marketplace
absent. These are technical parent decisions, not requests for owner keys/spend.

Read checkpoint SHA256s: schema 913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483;
G2 decisions e19b04f79bd00c096213f59d5f394a1f22d731e81068baa82a93a54437e1d810;
G7 service 87b72678d4493a0625aba4b61e39158bb7b12940586b7243497161c0864c7ad7;
G3 provenance review bbea9fbe17dc1c6f53545fe606783d2f8d2dbab7d83e042f38cbd416d7322cbb.
