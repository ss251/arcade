> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G8/G9 current integration readiness — September 6, 2026

Read-only preparation during the parent's G6 gate, not source release. Read
existing task6/task15 readiness and current decisions, complete G7
source/report, final schema, actual Tasks8/9, the Task15 authority distinction,
H1/H4 actual producer/decoder and H7 readiness. No tests, processes, remote
requests, credentials, Graph commands, Git or source/public edits were performed.

## Safe sequence

1. Parent completes G6 local review/gate and separately authorized no-payment
   deployment/known-A9 read-only acceptance, preserving all failed observations.
   Merge G2–6 together with the already implemented G7/G10–14 work onto main,
   after the completed A–F chain. Preserve atomic task histories and main gates.
   G15 is not a hidden prerequisite or implied spend in this merge.
2. Rebase H onto that resulting main; preserve F's sessions/private receipt
   boundaries and F14 reference/session-marker work when reconciling H1/H4.
   Complete H7–14 and its actual UI/route acceptance, then merge H. H7 is the
   receipt-tree SVG; the listing page is H8, not historical H6's stale numbering.
3. Rebase the remaining G integration on post-H main. Only then release G8's
   shared server/store integration, followed by G9's MCP evidence projection.
   This implements the recorded H-before-G8 exception, not a general H-before-G
   reversal. Root retains all merge/commit/full-gate authority.

## Current absence behavior is safe, and intentionally mostly empty

G7's three query fields still exist in the final schema. `decodeStats` requires
a non-null Marketplace(id:arcade); the selected two-emitter mappings never create
Marketplace, so `stats()` returns null, not fabricated zero totals. `evidenceFor`
requires Listing plus Agent and Splitter with reciprocal listing IDs, canonical
Arc agent identity, first observed block and coherent counters. Canonical Listing
and reciprocal links are intentionally absent; all registry templates are inactive.
It therefore returns null even when a selected Splitter has real settlements.
Metadata ListingClaim rows cannot satisfy or bypass this requirement.

`treeFor` can expose the selected emitter's unambiguous event summary independently
of Marketplace/listing evidence. Final G4 clears Tree.root on a distinct occurrence
collision; G7 requires a root and representable childCount, so ambiguous/null-count
summaries return null. This remains emitted tree-hash/count/amount evidence, not
independent verification of every off-chain receipt descendant or complete coverage.

Current GROOT server/store/MCP contain no GraphTag/GraphFromEnv, statsSource,
graphStatsPayload or graphEvidenceLine wiring. Thus G7 currently adds no public
Graph labels at all. A G6 deployment alone will not make routes emit Graph numbers.

## Concrete updated H finding and later edits

The earlier readiness correctly identified the source/value mismatch in the
literal plan, but **actual H1 already prevents false labeling**:
`public-feeds.ts:19` publicStats computes hub receipt/listing totals and returns
undefined if source is not hub; H server972–974 returns503 in that case.
Store.statsSource is currently constant hub. Merely replacing that one line with
a successful Graph probe would therefore break `/stats`, not make truthful Graph
stats. Keep it hub. GraphStats lacks H's catalogue listings/sellers/all-call counts,
and two EIP-3009 emitters cannot stand in for hub Gateway/test/all-receipt totals.

Smallest later G8 work is Graph layer/service wiring and bounded optional evidence
plus a separately named `/graph/stats` payload that selects its values and source
together. With the current schema it must use real hub fallback values/source,
omit indexedBlock, and leave listing.graph absent. Preserve H's `/stats` unchanged
unless a genuinely compatible complete aggregate contract is separately approved;
never manufacture missing Graph fields from a different read. Do not populate
Marketplace or canonical links merely to make the positive example light up.

H4's actual ListingSummary/Detail decoder ignores unknown graph fields and H's
plan explicitly renders neither the Graph key nor `/graph/stats`. No H web
redesign is required for absent/optional G8 evidence. Preserve D's independently
verified erc8004 projection and its different validation semantics.

One exact future compatibility edit is easy to miss: G6 graph-splitters.ts uses a
closed current catalogue field set. A later valid listing.graph key would currently
fail its discovery decode. G8 integration must explicitly admit/ignore the new
bounded public optional field in the generator and its actual-producer fixtures,
without treating it as splitter binding authority. This is deferred compatibility,
not a defect in the current G6 producer contract.

G9 must strictly decode the four allowed graph fields before either text or
structured output, removing malformed/untrusted graph data rather than leaving it
in MCP's current spread of raw detail. Preserve F10 queue/budget/session behavior.
Replace the literal “settlement-backed feedback”/seller-cannot-write assurances
with qualified observed registry-record/policy-response language; settlement and
registry counts are not service-payment verification. Missing evidence emits no
line, and valid explicit zero must remain distinguishable from unavailable.

## G15 is a separate authority/evidence boundary

The accepted exception authorizes exact Base Graph queries at10000 atomic each:
at most5 recorded-evidence reservations and10 global including video, durable
cache/uncertainty accounting, reserve5 for video, retain the0.90USDC floor.
It does not authorize a new Arc-settled `$0.05` purchase, Gateway funding or an
A9/C10/D13 replay. Base-only live facts plus local TestRail composition remain
partial evidence, not full cross-chain G15 PASS. Follow the existing detailed
task15 readiness; no new owner request or paid probe is made by this note.

Current source fingerprints: G7 graph.ts
87b72678d4493a0625aba4b61e39158bb7b12940586b7243497161c0864c7ad7;
schema eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db;
H public-feeds.ts af457b884d34fb94df55c9e8e9fb88bf6b201458f68f7a6970beabaa2edeb97e;
H hub-decode.ts 7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9;
G6 generator2507b8241c9ed373ef5d9e4f239c8e649cf0e784a9f510e631c2dd299555e766.
