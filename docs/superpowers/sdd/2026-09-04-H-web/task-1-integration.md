# H1 review follow-up — September 5, 2026

The original worker report is preserved unchanged with its public banner. Parent
read every changed/new production file, test and report; independent source review
found three concrete issues before any H1 commit.

1. The route did not read Store.statsSource. It now reads that Effect and returns
   fixed `503 {"error":"stats_unavailable"}` if it cannot supply data from that
   source. Hub totals are never relabeled subgraph totals. This deliberately
   corrects G8's unsafe one-line-only historical sketch: G8 must wire the actual
   indexed aggregate as well as its provenance.
2. Memory appended repeated job receipts while SQLite upserted by job ID, so
   counts could fall after restart. Memory now upserts at the original position
   and removes any further duplicate of that job. Feeds and headline counts
   share that invariant. The large-bigint fixture now uses two distinct jobs;
   no amount, count, privacy or existing compatibility assertion was weakened.
3. An unsettled receipt could still publish a shaped settleTx. Both root and
   child references now require settled=true, alongside the existing rail/shape
   policy. Explorer absence alone was insufficient.

At 16:30:31 IST the new regressions produced three genuine Vitest failures and
four actual owned-HTTP/SQLite failures: missing provenance read, false available
indexed stats, duplicate receipts and exposed unsettled references. At16:31:32,
after the fixes, parent repeated 45 Vitest cases, 13 Bun tests /62 assertions and
root/web strict TypeScript: all passed. These are finite local test-rail fixtures,
not an external provider, real payment or deployed service result.

Independent follow-up review is CLEAN. The reviewer separately passed45Vitest
and6Bun/45assertions (new actual HTTP/SQLite file) with loopback permission and
checked the diff. Its preceding denied-bind sandbox attempt is not a product
failure or independent Green. The reviewer did not claim a full repository gate.

Public-copy/link verification and the frozen H1 full precommit gate follow this
checkpoint. H2/H3 source may be present but remains separately scoped and not
imported by staged H1 source/tests. Live F/Studio/Base prerequisites and canonical
merge order remain unchanged; no public push or production change occurred.
