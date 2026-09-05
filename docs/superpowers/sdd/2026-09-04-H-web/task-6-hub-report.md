> Historical H6 hub implementation record, September 5, 2026. Original retained unchanged; only this banner differs. Dated checks and pending-gate statements remain historical; subsequent review and parent gates are recorded separately.

# H6 hub catalogue projection — root implementation record

2026-09-05. Frozen source/tests; full repository gate and commit remain separate.
Own only apps/hub/src/server.ts GET /listings additive projection and the new
apps/hub/test/market-listings.bun.test.ts actual-router fixture. No H4 client,
routes, catalogue filter, registry, database or payment behavior was changed.

The route publishes store-derived payTested as explicit null when no observation
exists, otherwise atMs, ok and redacted empty jobId. Only passing, nonzero 32-byte
hex references survive; no rail/network/explorer proof is invented. Existing
delisted and ENS-expired filtering is unchanged. The projection overwrites any
same-named manifest field and makes no new call, receipt/statistics fanout or IO.

## Failure-first and focused checks

The actual production router ran in an allowlisted no-env-file child with a fresh
memory Store and private preload fixtures. Before source implementation, two
tests genuinely failed on missing null/delisted fields and the absent safe
projection; the one-read/no-write test passed. Initial result: 1 pass, 2 fail,
10 assertions. After the additive projection, the three tests passed.

The root combined the new three with six existing public-feed checks: 9 pass,
101 assertions before supplemental failed-hash coverage. Adding a hash to the
failed pay-test fixture passed immediately; that was supplemental coverage, not
another Red. Independent review noticed the partial equality did not yet prove
its omission, so an explicit no-settleTx assertion was added. Final repeat:
3 pass, 57 assertions, with no production change for that assertion.

Separate unchanged actual ENS and delisting HTTP regressions passed: 11 Vitest
tests in two files. The exact root-option TypeScript program containing server
and the new nested Bun test returned zero diagnostics before the final single
absence assertion; full final strict verification remains part of the parent gate.

Fixtures seed passing, failed, no-history, delisted, malformed-reference and zero
reference records. Responses are decoded by real H4. Counters verify exactly one
current listing read and zero mutations, detail reads, receipt fanout or external
requests. Non-GET routes remain 404. Children use owned loopback/port0, bounded
startup/request deadlines, explicit TERM then bounded KILL fallback and awaited
close; listener refusal is asserted. No live hub, key or payment was used.

## Independent review and frozen hashes

B9 independently read the complete route diff, fixture, real H4 decoder, memory
decoration and SQLite hydration: production review CLEAN. Its independent repeat
passed 3 tests /56 assertions before the supplemental absence assertion. No claim
is made that B9 authored or tested the initial Reds. Root owns the final 3/57 run.

server.ts SHA256:
35a3b4463f3d40a581b3f368126affaa0cf8dcd6636054618c84d94b07bd9c1b
market-listings.bun.test.ts SHA256:
7fc273397e50cfed86539e028ee9922bd5893ac9cf194f3272238dc22d668216

The parent also read the entire separate web report and all seven web source/test
files, inspected all eight final browser images and accepted the reported layout
correction. Parent did not repeat the author's keyboard/detail-click sequence.
Web actual route tests and full final gates remain separately attributed. No
H9 detail implementation, live marketplace proof, new deployment or main merge
is claimed by this checkpoint. Original private reports remain unchanged.
