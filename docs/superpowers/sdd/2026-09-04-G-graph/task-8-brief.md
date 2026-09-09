# G8 — bounded Graph evidence on merged H routes

Start: September 6, 2026. Base `1f39c34` includes H's tested code checkpoint.
Root-only execution, four test workers, no parallel reviews/gates or new spend.

## Contract and deviations

Wire the existing G7 service into the hub lifetime. Add GET /graph/stats and four
optional listing graph fields (agentId, settlementCount, feedbackCount,
validationPassCount), never provider configuration, agent URI or raw errors.
Preserve H/E/C filters, pay-test fields, D identity and every payment/session path.
Graph-off, null marketplace, malformed data and defects fail softly; one bounded
batch accepts at most 256 listing IDs, deduplicated, with four concurrent reads.

Keep /stats and Store.statsSource hub-labeled and unchanged. The literal plan's
source-only probe would relabel local counts as indexed facts; H explicitly
refuses that. The Graph schema lacks active listing/seller/failed-call counts.
Only /graph/stats selects an actual indexed aggregate, or two clearly hub-sourced
fallback fields; never invent zeros for unavailable indexed fields. Feedback is
indexed feedback, not automatically settlement-backed or independently verified.
G6's pilot proof does not establish Marketplace or canonical listing attribution.

Test the actual loopback hub router with the real G7 decoder and simulated
GraphQL responses before implementation. Add pure boundary/concurrency/defect
tests in the existing Vitest stack; no side-effectful server import in Node.
Read-only tests use an in-memory Store, synthetic records, disabled external
fetch, exact child ownership and bounded cleanup. No keychain or live graph/pay
request. Self-review, exact-root strict check, one sequential full gate, public
evidence/privacy audit and one atomic commit follow.
