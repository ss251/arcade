# H1 brief — real hub statistics and one public receipt whitelist

Implement GET /stats and GET /listings/:id/receipts?limit with the planned public
row/child exports and Store.statsSource Effect. Keep the paid branch untouched.
Extract import-safe pure helpers rather than booting the server in Node tests.
Use one explicit receipt whitelist shared with the existing /receipts endpoint;
never rest-spread private receipts or publish call/session handles, buyers,
authorization nonces, signatures, fee correlation, future fields or arbitrary
provider diagnostics. Preserve the canary marker and safe public compatibility
fields. Root children are flat descendants, not inferred direct edges.

Count actual store data with exact bigint amounts, casefold sellers, retain
historical listing feeds and sort newest first. Follow finite limit truncate/clamp
1–100 with default20 for invalid/nonfinite inputs; reject ambiguous duplicates.
Stats remain hub-derived, including canaries, not a customer-demand metric. Read
the store provenance seam, but do not relabel local counts as indexed data merely
because a future Graph probe succeeds. G8 must provide actual indexed aggregates.

Require genuine failure-first privacy, shape, limit, accounting and source tests.
Run actual router fixtures only in owned finite loopback processes, with no real
key/provider access; prove no mutations/private job access and cleanup. Preserve
existing C/A compatibility assertions. Match SQLite's one-receipt-per-job behavior
in memory so counts do not change on restart. Unsettled rows expose neither
settlement references nor explorer links; Gateway/test references are never
misrepresented as mined per-call chain proof.

Independent review and full test/type gates precede a scoped local commit with
public execution records. H2/H3 and all web routes are separate tasks. No live
payment, deployed service, owner configuration, mainnet or GitHub push is in scope.
