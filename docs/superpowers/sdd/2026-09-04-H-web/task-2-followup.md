> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H2 follow-up — funding attribution, rail locators and tree consistency

September 5, 2026 UTC. This separate report supersedes the narrow assumptions below;
the original `internal/task2-report.md` and its historical source/test fingerprints
remain byte-identical. Only summary.ts and summary.test.ts changed. No route/store/H1
edits, Git mutations, full suites, dependencies, keys, live network or payments.

## Actual compatibility findings and corrections

The A9 workflow uses a dedicated subbuy address distinct from the payout seller.
A child's buyer differing from its parent seller therefore does not establish
external sponsorship: it may be another wallet controlled by that seller. Full
receipts provide lineage and payer, not funding-ownership attribution metadata.
Such a settled direct child is not subtracted as known seller-wallet spend, but
now marks the parent's subSpend/margin incomplete/null. The known subtotal remains
explicitly partial. This applies equally to the actual public A9 subbuy address
and an arbitrary external buyer; neither is automatically classified as a sponsor.
The initial report's stronger foreign-wallet/no-spend interpretation is superseded.

Actual TestRail.settle emits `0xtest` plus ten nonce hex characters and a bounded
hex settlement counter (`packages/payments/src/test-rail.ts:123`). Actual Gateway
returns the facilitator transaction locator unchanged, and H1 supports UUID transfer
references (`gateway.ts:165`; `receipts-feed.ts:45–47`). The summary now validates
the exact rail enum, accepts nonzero 32-byte hashes plus bounded test references
only on test rail and UUIDs only on Gateway, and refuses arbitrary malformed or
wrong-rail references. Child descriptors are parsed under their root receipt's rail;
full child receipts are parsed under their own declared rail. These are local
ledger locators, not proof of a mined transaction, and no locator/explorer is added
to the derived economics output.

Supplied root treeHash must be a nonzero 32-byte hash matching core treeHashOf over
the exact root job and flat child bytes. References retain their original byte case
because the canonical commitment includes those bytes. Malformed or contradictory
commitments make spend/margin incomplete; they cannot leave a profitable complete
summary. No additional chain query or signature verification is introduced.

Missing hash behavior is explicitly local-ledger-only: full, mutually consistent
parent/root/hop/ancestor/descendant/committed-total data can still account exactly
without a hash. The summary never exposes a tree hash or asserts mined proof.
Legacy records missing that fuller lineage context remain unknown, as before.
The completeness flag describes local accounting, not blockchain verification.

## Genuine regressions and final checks

11:04:24 UTC: six genuine behavioral failures before the follow-up source changes:
dedicated-wallet attribution returned false exact zero/profit; valid TestRail and
Gateway locators were each refused; an unsupported rail name was accepted; a zero
transaction hash was accepted; a supplied mismatching tree commitment was ignored.
Additional malformed/wrong-rail and missing-hash cases were passing coverage and
are not labeled new Reds.

11:05:55 UTC: all 41 focused Vitest cases passed, including unchanged prior accounting,
deduplication, historical ownership, liveness and own-data privacy cases. Exact root
compiler options with summary source/test explicitly included produced zero TypeScript
diagnostics; diff check exit zero. The existing test stack and real core constructors
and canonical hash helper were used; no test expectation was weakened to preserve
the earlier incorrect sponsorship assumption.

The final source/tests are FROZEN for independent parent review. H1 review was
reassigned by parent to the other independent reviewer; no duplicate H1 work ran here.
