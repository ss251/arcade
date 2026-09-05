# G12 integration checkpoint — September 5, 2026

The client and runner halves are implemented and frozen for final integration.
Their [client report](task-12-client-report.md) and
[runner report](task-12-run-report.md) are exact retained originals plus a public
checkpoint banner. This is **offline implementation evidence**; live Base payment,
deployed historical-query support and Studio indexing remain unproven.

## Parent-owned dependency and query adaptation

At 15:27:39 IST the added manifest/query contract test genuinely failed because
the root did not directly declare `@x402/fetch`. Root added exact `@x402/fetch`
2.25.0 and `@x402/evm` 2.25.0, already present as locked transitive dependencies.
Install and frozen reinstall succeeded; the lock diff adds only those two root
declarations, with no existing package resolution or version changed.

The second query now requires `$block: Block_height!`; both `feedbacks` and
`_meta` receive that argument, with `{hash: firstMetadata.block.hash}` supplied by
the runner. Existing query assertions were adapted to this real contract change.
All 30 manifest/query tests passed at 15:34:41 IST. This uses the documented
[Graph historical-query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/)
and upstream graph-node's `Block_height` generation. It is not evidence that the
selected deployed Agent0 backend has accepted a paid historical query. Failure
does not cause an unpinned fallback.

## The one unsigned public challenge

At **2026-09-05T09:54:03.618Z**, one bounded unsigned POST to the fixed canonical
Graph gateway returned 402. No key, payment signature, authentication header or
paid retry was used. Reviewed public fields were:

| Field | Observed value |
| --- | --- |
| Version / scheme | v2 / exact |
| Network / amount | `eip155:8453` / `10000` atomic USDC |
| Asset | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Recipient | `0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB` |
| Timeout / method | 300 seconds / `eip3009` |
| EIP-712 name / version | `USD Coin` / `2` |

The exact advertised resource URL was
`http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`.
It is pinned comparison metadata, **never a network request target**. Only the
canonical HTTPS gateway and Base RPC receive production requests. Optional
description/mimeType were not retained as independently pinned observations;
bounded strings there are ignored and unknown resource fields are refused.

This observation supports a scoped price/domain policy, not a paid-query, receipt,
data result, billing or counterparty-service claim. Base-mainnet spending remains
separately OWNER-gated; there is no funded payer configured by this task.

## Independent checks and remaining work

Client agent reports 58 Vitest tests and six Bun tests / 62 assertions, with
targeted strict checking. Runner agent reports 22 Vitest tests and four Bun tests /
17 assertions, plus global and explicitly targeted strict checking. Both retained
reports distinguish genuine product Reds from setup errors. Parent read all
production source and tests and requested four narrowly reproduced client fixes:
contradictory settlement fields, length/encoding, late signing and child-close
ownership. The final implementation incorporates their passing regressions.
Client agent independently reviewed all runner source/tests as CLEAN.

Final sibling client review, combined parent checks and the whole-repository gate
are still pending at this checkpoint; their observed results will be appended to
the progress ledger. The pure synthesis proof type remains a trusted local caller
boundary, not an implemented service-payment verifier. Production supplies neither
verified service proofs nor trusted validators, and cannot promote raw claims to
allow or a nonzero settled count.

### Later September 5 review checkpoint

Sibling independently read the entire final client, both client test files and
the G13 guide/tests: CLEAN. It verified both guide-local links and syntax-checked
both shell fences without executing commands. As a test-only privacy follow-up,
parent set a known dummy `X402_PRIVATE_KEY` before the unchanged-environment
assertion, so a future failure cannot print an ambient credential. This is fixture
hygiene, not a new product Red. The retained client report's test fingerprint is
the historical pre-follow-up fingerprint; its original bytes remain unchanged.

Parent's combined repeat passed all 165 skill Vitest cases (including the separate
seven G13 guide checks), ten actual Bun fixtures / 79 assertions, root/web strict
TypeScript and diff check. An additional compiler program using the exact root
options plus every nested skill test exposed a test-only `Headers` iterator type
error: the root does not include `DOM.Iterable`. The fixture now builds its header
record using the existing `Headers.forEach` API, without broadening compiler libs
or suppressing errors. Both client-test fingerprints therefore predate narrowly
documented parent fixture changes; production client bytes remain unchanged.
