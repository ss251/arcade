> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H2 pure seller summary — September 5, 2026

Offline implementation checkpoint, not a live earnings or chain-verification claim.
Read the complete H Task 2 plan (lines 350–757), repository instructions, actual
Receipt/ReceiptChild/PublicListing/Bounds and store models, pipeline finish/tree
construction, lineage derivation and money formatter before implementation. The
ts-testing skill guided typed real-model fixtures and failure-first behavioral tests.

## Ownership and interfaces

Only `apps/hub/src/summary.ts`, `apps/hub/test/summary.test.ts` and this ignored report
were created. No route, store, public feed, shared model, dependency, Git mutation,
full-suite run, live network, credential lookup or service was used. H1's concurrent
store/feed files were left untouched; parent owns route integration and full gates.

Preserved `usdToAtomic`, `sellerSummary`, `SellerListingRow` and `SellerSummary`.
Added the named exported `SellerSummaryUnavailable` (`_tag` and fixed public message
`seller summary is unavailable`) so a later route can return a fixed unavailable
response without reflecting diagnostics or receipt identifiers.

Parent approved a necessary nullable contract widening: inferenceCost/Atomic,
subSpend/Atomic, margin/Atomic and listing marginPerCall/Atomic are string-or-null.
Completeness flags and knownInferenceCost/Atomic, knownSubSpend/Atomic expose exact
known subtotals without presenting them as complete costs. Missing reported cost is
unknown even for scripts or jobs that never reached an engine; known failed-job
inference cost is included. Empty ledger totals are exactly zero; the existing core
formatter renders `$0.00`. No settled calls means no per-call average. Otherwise
per-call margin is total listing margin divided by settled calls, including failed-job
overhead, with integer atomic division toward zero. Losses remain negative.

## Actual accounting and lineage

Income uses unique settled hub receipts; attempted-call counts and inference costs
use all unique seller receipts, including failures. Historical receipts remain the
seller's income after the listing changes hands; they do not make the former seller
own the current listing. Addresses are exact-width, nonzero and case-normalized.
Arc-USDC accounting refuses incompatible receipt networks instead of mixing units.
The module reports the receipt's seller share/fee; it does not infer historical fee
refunds from a current mutable listing, or claim reported inference costs are invoices.

The legacy Receipt.children comment says direct children, but the actual pipeline
populates it only on roots from the entire root ledger's committed descendants.
Ancestors are skill IDs, not job IDs. The module therefore never sums that flat list
as direct spending. Full receipts establish exact parentJobId, common root, hop and
skill-ancestor chain. Only a settled direct child's actual buyer matching its parent
seller incurs that seller's spend. Every unique direct edge is counted once, including
when a parent failed or the same seller serves several nodes. Foreign-wallet payments
are not subtracted; grandchildren paid by other sellers are not attributed to the root.

Completeness additionally requires the full root receipt and its bounded manifest,
matching full descendant identities/amounts/settlement/transaction locators and committed
total. Missing or inconsistent lineage/manifest context produces null spend/margin;
any independently known direct subtotal remains labeled as partial. Legacy receipts
without modern root context therefore cannot manufacture zero sub-spend. The input
must be a complete hub snapshot, not a paginated or buyer-redacted public feed.

Canonical identical jobs deduplicate, including reordered flat child commitments.
Economically contradictory duplicates relevant to the seller throw the fixed named
error; contradictory foreign context is removed and leaves lineage incomplete. No
last-wins rule can boost income. Duplicate listing ownership refuses; contradictory
runner identity cannot mark a row live. Counts are bounded by 10,000 input receipts,
1,024 listings/runners, 1,024 descendants per manifest, 20,000 total descriptors and
64 lineage hops. Monetary inputs use bounded uint256 atomic integers; reported USD
rounds once to six decimals only while atomic precision remains a safe integer.
Bounds fail unavailable rather than silently truncate evidence.

## Public projection and liveness

Rows require actual current listing ownership and exact listing.runnerId binding to
the same seller's runner and announced skill. Connection/publication/heartbeat times
must be coherent and nonfuture; heartbeat age is inclusive at 30,000ms. Delisted rows
are not live. Only validated existing pay-test and agent/ENS fields are projected;
no job IDs, runner IDs, buyers, reasons, inputs, outputs, provider diagnostics or
invented validation/feedback counts enter the result. Canary receipts remain calls
in a ledger, not an invented count of independent customer demand.

`ensExpired` remains an optional interface field for compatibility but is not invented:
the actual ListingRecord has ensName, while expiry is held by the E watcher. A later
route may only attach a fresh seller/publication-bound watcher observation explicitly.
Registration transaction is announced metadata; owner verification does not claim that
transaction was independently checked. Full receipts remain local inputs to this pure
summary; no private subtree identifiers are returned.

Array data is snapshotted using own descriptors, without caller iterators/accessors.
Only bounded validated primitive projections are compared or serialized, so malformed
runner timestamp objects cannot invoke toJSON. Unused private getters are never read.
Original rows/arrays are not mutated. No current-chain proof verifier is implemented.

## Genuine Red and Green evidence

- 10:50:18 UTC: collected Vitest import failed on missing summary.ts before implementation.
- First source run exposed a fixture construction error: Effect's PublicListing.make
  requires Bounds.make, and the actual H-base PublicListing has no capabilities field.
  Fixed the typed fixture, not production schemas. This is not counted as a product Red.
- The existing formatPrice intentionally retains at least two decimal places; corrected
  the illustrative `$0` expectation to the real `$0.00`, without changing the formatter.
- 10:54:37 UTC: four genuine behavioral Reds: incompatible-network mixing, ambiguous
  runner marked live, duplicate listing ownership accepted, and reordered same-tree
  receipt incorrectly considered contradictory. Narrow fixes passed 29/29 at 10:55:25.
- 10:56:28 UTC: two genuine Reds demonstrated invocation of a caller array iterator and
  malformed runner timestamp toJSON. Own-data snapshots and primitive-only comparisons
  fixed both. Final 31/31 focused Vitest Green at 10:56:59 UTC (1.32s overall).
- Exact root compiler options with summary source and test explicitly included: zero
  diagnostics; `git diff --check`: exit zero. No type suppression or assertion weakening.

Commands: `bun --no-env-file x vitest run apps/hub/test/summary.test.ts`; targeted
TypeScript compiler API using parsed root tsconfig options and exactly the two owned
root files (normal imported model dependencies included). No full-repository test run.

Source and tests are FROZEN for independent parent review. Parent owns all integration,
full gates, public report publication and the separately scoped commit.
