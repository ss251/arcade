> Historical H6 independent hub review, September 5, 2026. Original retained unchanged; only this banner differs. This bounded source/test review is separate from author browser observations and the parent full gate.

# H6 hub catalog projection — independent review, September 5, 2026

Verdict: **CLEAN** on the final parent-owned production/test files. Read-only
review; no edits to hub or web source/tests, no full suite, Git mutation or live
network/key/provider action. This review is separate from my authored web slice.

Reviewed all of the GET `/listings` delta and its complete actual-router test,
plus actual H4 listing/pay-test decoding, seller-keyed Store decoration and
SQLite-to-memory hydration. Evidence is existing store-derived pay-test state,
not a seller-asserted flag, new purchase or chain query. The projection overwrites
any similarly named public-listing fields with current store-derived fields.

Explicit null means no recorded pay-test history. H4 still accepts absent metadata
from older hubs as unknown, without converting it to null. Public `jobId:""` is
redacted compatibility only, not correlation or a capability. No private reason,
runner, buyer, nonce, token or diagnostic is added. A nonzero 32-byte reference is
kept only for passing evidence; malformed, zero and failed-observation references
are omitted. Neither this shape nor H4 invents rail/network/explorer authority.

Delisted and ENS-expired filtering is unchanged. This adds no detail/statistics/
receipt/RPC fanout or mutation: the production code still reads allListings once,
and uses the existing local watcher predicates. The fixture runs the production
router with a real memory Store, feeds the actual H4 decoder and measures one list
read, zero forbidden reads/writes/external calls. Its dummy environment excludes
ambient provider keys and dotenv; it drains output, bounds startup, then awaits
TERM/KILL reaping and confirms listener refusal.

One supplemental assertion gap was reported: adding a hash to the failed fixture
did not make its partial `toMatchObject` reject a leaked settleTx. Parent added an
explicit missing-property assertion. This passed immediately, honestly a coverage
addition rather than a new Red; no production correction was needed.

Independent final focused rerun:
`bun --no-env-file test apps/hub/test/market-listings.bun.test.ts`
passed **3 tests / 57 assertions**, 649ms, exit 0, after the final assertion.
The earlier independent checkpoint was 3/56. No independent full-gate or additional
strict-compiler result is claimed by this review.

Final SHA256:

- `apps/hub/src/server.ts`: `35a3b4463f3d40a581b3f368126affaa0cf8dcd6636054618c84d94b07bd9c1b`
- `apps/hub/test/market-listings.bun.test.ts`: `7fc273397e50cfed86539e028ee9922bd5893ac9cf194f3272238dc22d668216`

No remaining actionable source or assertion finding in this bounded slice. The
independent source check is not proof of real purchases, mining, live ENS status,
external service availability, or customer demand.
