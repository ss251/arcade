> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 MCP sessions — author report and source freeze

September 6, 2026. Parent released source after F9 commit
`6d3222b9e3c5a6713758ae573a626535ab5ae9de` (03:30:22 IST).
Implemented only the three approved paths: mcp.ts, existing mcp.test.ts, and new
mcp-session.test.ts. Parent owns full repository gates, independent/public review
and commit. This report is an ignored execution artifact, not public/live evidence.

## Shipped seam and authority limits

New `arcade_open_session({budgetUsd, rail?})` and `arcade_close_session({})` are
non-idempotent lifecycle mutations. Their text explicitly says opening/closing
spends nothing; open creates no deposit/escrow and close revokes no authorization.
The exact canonical positive six-decimal string budget cannot exceed process
remaining. Explicit rails are Gateway, EIP-3009 and labeled testing-only Test;
omission passes through to the hub/F9 selected supported rail, without fallback.
The existing ordinary localhost default is unchanged; session opening requires
HTTPS or literal 127.0.0.1/[::1] HTTP and otherwise gives a fixed configuration hint.

F10 consumes the actual F9 openSession/BuyerSession Effects, never session tokens
or an ID-only payment path. The handle captures buyer, network, fetch and chain.
Active call/quote uses a bounded direct listing serviceName projection; the SDK's
seller argument is that URL segment, not the catalog wallet field. The actual
F9 quote receives actual input (default {}), is read-only, and call independently
probes again. No active-session ENS/hire fallback, metadata-price fallback,
environment key reread or production-wide SDK reset is introduced.

Open, close and purchases share one predecessor-preserving lease. Relevant own
JSON is bounded/copied before awaiting it. Canceled queued B may return early,
but its node remains dependent on active A before releasing C, and B never runs.
Active work is joined through Effect cleanup rather than releasing its successor
from a raced cancellation. Actual installed MCP extra.signal is forwarded into
the Effects and discovery transport. RequestId0 and empty string are refused at
createServer before dispatch because SDK1.29.0 does not cancel those IDs through
notifications. This does not claim every schema-valid MCP ID is cancellable.

Purchase/close intents retain phase, context identity and generation at enqueue.
A stale queued purchase never becomes an ordinary payment or a purchase on a
newer handle. Calls during opening/closing/uncertainty are fixed unsigned refusals.
An uncertain open without a handle still blocks ordinary mutation fallback.
Unknown close retains its handle; explicit later close only reads F9 status for
matching complete closed proof, never repeats close POST. Read-only budget/quote
does not mutate lifecycle; budget labels a captured handle historical if changed
during the read. Closing does not reset cumulative process accounting.

Active calls reserve min(caller cap, configured per-call cap, process remaining).
Only local SDK failure phase/authorizedAmountAtomic or the SDK's attributed result
amount can narrow unused reservation; remote receipt/status amounts cannot.
Signed releases retain exposure, and unclassified interruption/defect conservatively
retains the cap. Correlated settlement moves the same amount from exposure to spent
once; duplicate job evidence or a forged lower receipt cannot enlarge remaining.
Closed receipt/status totals are never added again or treated as a refund. A small
per-handle duplicate-job set is capped at100; no second durable accounting ledger,
wallet-wide persistence or post-restart authority guarantee is claimed.

Active budget reports hub spent/held/remaining separately from process spent and
reserved exposure. A single captured-chain JSON-RPC batch reads eth_chainId and
pinned-token balanceOf using the captured buyer/fetch. The two fixed distinct IDs,
exact cardinality, unique IDs, chain equality and 32-byte uint256 balance result
are checked. No batch fallback, retry, ambient chain selection or key lookup.
Wallet failures are unavailable, never zero; Gateway available/pending remains
unavailable without F11 evidence and is never a wallet USDC alias.

The wallet request has a5-second fetch-plus-stream deadline; listing/ordinary
public reads retain the existing10-second bound. publicJson now checks current
abort/monotonic deadline before and after every read and refuses more than1024
consecutive empty chunks. Body bytes remain bounded at128 KiB, redirect:error,
credentials:omit, fixed diagnostics and best-effort body cancellation. These are
synthetic stream/installed-protocol checks, not physical TCP EOF or provider proof.

New/session failures never reflect provider bodies, signal.reason, raw parse
diagnostics, notes, tokens or input. Seller text remains in the SDK's fence in
content, with raw result only in structuredContent. Ordinary discovery/fencing,
ENS and ERC-8004 behavior stays covered by its existing tests. The existing
ordinary balanceAtomic implementation is unchanged.

## Actual Red/Green chronology (IST)

- 03:32:40: four genuine Reds against unchanged mcp.ts: two lifecycle advertisement
  assertions; pre-canceled ordinary purchase reached the paid seam; canceled
  middle B executed, producing [1,2,3] instead of [1,3]. No missing-module failure.
- 03:34:44: both cancellation lease regressions Green after the shared lease and
  signal propagation. Lifecycle was not implemented yet.
- 03:36:09: four lifecycle Reds / one pass / two skips. Unknown open did not create
  a handle or poison fallback; active quote/close/recovery did not exist. The malformed
  budget case already passed via unknown-tool refusal, so this was not claimed as
  a demonstrated budget-validation Red; final meaningful cases assert the SDK and
  IO counters remain untouched with the tools implemented.
- 03:39:44:100 focused MCP/ENS/ERC-8004 tests Green. Exact owned roots then exposed
  one test-only exactOptionalPropertyTypes diagnostic for `{signal: undefined}`;
  corrected the helper to omit the optional property, without weakening assertions.
- 03:42:09:19 new cases Green including actual Client/InMemoryTransport active
  cancellation/disconnect and explicit unsupported IDs. This initially tested the
  SDK seam with injected Effects; it was not yet actual F9 signing coverage.
- 03:44:55:22 cases Green with actual protocol A/canceled-B/C ordering, concurrent
  opens and old budget-read generation handling.
- B9 independently captured two genuine old-lane/new-handle Reds on source7d87459d.
  Author fully read and reproduced its unchanged private fixture:0 pass/2 fail/8
  assertions. At03:45:42 the two collected counterparts also failed. At03:46:11,
  captured-intent refusal made the collected24 and private2/8 Green. The earlier
  queued-input fixture had waited behind opening; it was moved behind an active
  same-handle purchase so it still proves immutable queued input without relying
  on the now-refused opening-to-new-handle rebind. Its input equality stayed intact.
- 03:47:10: genuine wallet-read acceptance Red: valid captured chain/balance fixture
  still returned unavailable because no wallet inspection ran. At03:47:53,30 tests
  Green after the bounded captured batch, including malformed/unavailable cases.
- 03:49:54:34 tests Green, now including actual F9 SDK quote/fresh-sign/call/close
  success and released-output paths, plus stalled wallet body/cancellation checks.
- 03:50:31: finite synthetic3000-empty-chunk fixture was incorrectly accepted as
  a valid balance response. Guard/current deadline checks fixed this genuine Red;
  it is not F9's separate historical356080-pull result or an endless-stream claim.
- 03:51:00:174 focused tests Green; exact3 roots plus private regression strict0.
- 03:52:07: new own-data normalization over-rejected inert JSON `constructor` and
  `prototype` keys in ordinary input. Genuine regression failed before correction;
  preserving them as copied null-prototype data fixed it. Reserved __proto__ and
  __bigint, accessors, cycles, invalid prototypes and other bounded-JSON refusals
  remain enforced. No global prototype or F9 normalization was changed.
- **03:52:35 final:175 Vitest /6 files**, then unchanged private **2 Bun /8 assertions**.
  Exact three owned TypeScript roots plus that private regression: **0 diagnostics**.

No source/test command was a full repository gate. Focused final commands:

```text
bun --no-env-file x --no-install vitest run packages/buyer/test/mcp-session.test.ts packages/buyer/test/mcp.test.ts packages/buyer/test/mcp-ens.test.ts packages/buyer/test/mcp-erc8004.test.ts packages/buyer/test/session.test.ts packages/buyer/test/promise-api.test.ts
bun --no-env-file test [private standalone MCP queue regression fixture]
```

The exact TypeScript program used the actual absolute root tsconfig/configFilePath,
three absolute owned roots plus private regression, dependency traversal,
noEmit:true and incremental:false. Existing tests count26 MCP,28 ENS,39 ERC-8004,
39 session and7 Promise; the new suite contributes36. No test is a new live spend.

## Frozen evidence and scope

| Path | SHA-256 |
| --- | --- |
| packages/buyer/src/mcp.ts | b730d50eccd11742355a6efeddf1d4a359252a97c1cc0ab50dbd1981100060ac |
| packages/buyer/test/mcp.test.ts | 1c072b92ed9b8d701bb023528274e01bb523109b26d8e629c5c83e5f61f0eec7 |
| packages/buyer/test/mcp-session.test.ts | 608b8d39a207e2188e4fefd96d2e72e3da2a9ca8ed2f8f5f0c8074e22f992b4c |
| [private standalone MCP queue regression fixture] (reviewer-owned, unchanged) | 3f41e9f4b59c56a2a0aea37290a23876e76df2ff232165d426445ce41d54e3d5 |
| task-10-independent-review.md (initial historical review) | b710a75cd8ca59d7f206b244f11e846ffb872828ef196fd5aa839f51381a335a |

Removing only the added lifecycle advertisement case and reverting the exact
writer-list/title update reconstructs the original mcp.test.ts SHA
`16ed9647a3b16a2e1caad2bdc578d8dc81ac89ffb85cde84dcf806ee7e4e4d78`.
All eight F9 files match the committed correction/native hashes; no F9, payment,
hub, CLI, dependency, G/H source, public doc or Git mutation occurred.

The ts-testing skill guided genuine regression-first implementation, retaining
setup/typing distinctions, and real installed-protocol plus actual SDK integration
coverage. Fixtures use synthetic unfunded identities and injected transports only;
no operational credential, external network, deposit, settlement, approval replay
or owner-required action. B9's private fixture owns/reaps its isolated dummy child;
no new native fixture path was added by this author. All author tests/processes
are stopped; final independent/root review and parent full gate remain pending.
