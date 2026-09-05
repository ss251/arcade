> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H2 second follow-up — unresolved reservations and rail equality

September 5, 2026 UTC. Original task2-report.md and task2-followup-report.md remain
unchanged. Only summary.ts and summary.test.ts changed after independent review;
no shared H1 source, dependencies, Git, full suites, keys, networks or live actions.

The actual root pipeline selects ledger entries with state !== released: a flat
manifest can contain both reserved and committed descendants. Earlier shorthand
"committed descendants" and the original unsettled-child exact-zero expectation
were inaccurate. An unsettled descendant still present in the manifest now makes
spend/margin incomplete. Conversely, a full failed child omitted from the root
manifest represents the legitimate released case and can retain exact zero spend
when the remaining complete local lineage is coherent.

Root and full-child rail must also match. A hash-shaped locator is accepted as a
locator shape on all known rails, so the prior UUID mismatch test did not establish
rail identity. A root on eip3009 plus a full gateway child with the same hash now
leaves spend/margin incomplete and does not enter the known seller-spend subtotal.
Neither rail locators nor local completeness become mined-chain proof.

11:14:10 UTC: two genuine new focused Reds reproduced unresolved reservation being
reported as complete zero/profit and hash-shaped mixed-rail spending being counted
as complete. The separate released-child compatibility case already passed and is
not represented as a new Red.

11:14:52 UTC: all 43 focused Vitest tests passed after the narrow corrections.
Exact-root-options targeted TypeScript (source plus test explicitly included) and
diff check exited zero. No assertions were weakened; the original invalid fixture
interpretation is corrected explicitly here. Final source and tests are FROZEN for
independent parent re-review and root-owned integration/full gates.
