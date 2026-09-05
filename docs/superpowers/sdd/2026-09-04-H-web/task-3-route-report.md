> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H3 authenticated receipt-tree route — September 5, 2026

This is the route-integration checkpoint after H2 commit e253f34, not a live-chain
proof, full-suite result or authorization to publish/deploy. Earlier H3 pure-helper
reports and source/tests remain unchanged. No keys, external network, live services,
wallet calls, Git mutations, dependency changes or web implementation were used.

## Scope and behavior

Only server.ts gains the tree-view import, the narrow shared jobTokenOk guard and
the GET /trees/:rootJobId branch; receipt-tree.bun.test.ts is new. The existing pure
buildTreeView, its twenty tests, H1/H2 routes and paid execution branches are unchanged.

The route accepts only job_ followed by 16–128 ASCII alphanumeric characters. It
uses tokenFrom and the existing HMAC jobTokenOk before allReceipts. Missing, wrong,
malformed and foreign tokens are indistinguishable fixed404 responses without Store
IO. The existing header-over-query precedence is preserved: a malformed header is
not rescued by a valid query token. Non-GET methods and malformed IDs are likewise
refused without reading the ledger. All tree-namespace responses, including errors
and HEAD, carry Cache-Control: private, no-store. No token is returned in a body,
generated URL, redirect, cookie or log.

The shared token guard now requires exactly32 lowercase ASCII hexadecimal characters
before timingSafeEqual. Minted tokens were already in this format; their HMAC bytes
and ordinary success behavior are unchanged. Previously, a32-character non-ASCII
token passed the character-length check but its UTF-8 buffer had a different length,
making the existing /jobs route throw and return500. Both existing job routes now
return their normal fixed404 without reading the Store for that malformed input.

After authentication, exactly one full raw receipt read feeds the frozen pure helper.
An unknown root or a child presented with its own valid token remains404; a child
is never promoted into a root. Effect.exit contains Store defects and emits only
the fixed503 body {error:"tree_unavailable"}, without reflecting their diagnostics.
The test arms exactly one private allReceipts defect and verifies healthy recovery.

Complete trees retain positional parent edges from full same-root lineage, not the
reversed flat descendant commitment. An unresolved manifest reservation remains
complete:false with reservation-unresolved and no fabricated settlement. Only the
authorized top-level root handle survives; child identifiers, buyer addresses,
session/nonce/signature fields, private provider reasons and future properties are
absent. The matching treeHash is a recorded canonical digest, not independently
verified chain evidence. Existing pure-helper completeness/bounds policy is preserved.

## Actual-router fixture and bounds

The test file is also a preload only for its explicitly owned child. That child runs
the real server router, real typed Job/Receipt/ReceiptChild models and real StoreLive,
with a replaced StoreFromEnv layer. Its test-only observation/fault endpoint is not
in production source. All read operations are counted; mutation methods are refused
and counted. Global fetch and preconnect are disabled and counted in that child.

The child receives an allowlisted environment, a fixed dummy HMAC fixture secret,
test rail and no dotenv loading. It binds127.0.0.1 on an ephemeral port. Startup is
bounded8s, each HTTP request2s, termination escalates only the owned child from TERM
to KILL after1s and waits at most3s for close. Output is drained into a bounded16KiB
buffer, never printed as a startup diagnostic. Teardown proves child close and a
refused connection to the old listener, and checks the buffer contains no job tokens
or injected storage diagnostic. Every observation preserves zero mutations and
zero external fetch/preconnect attempts.

## Failure-first and verification record

- 11:50:41UTC: actual production-router Red, 0/7 pass. Valid trees returned404,
  missing cache policy was observed, storage-failure behavior was absent, and the
  existing /jobs/:id non-ASCII token regression specifically returned500 rather
  than404. The owned child/listener were cleaned up even on this failing run.
- 11:51:38UTC: first implementation passed5/7. Two remaining failures were test
  fixture IDs accidentally15 characters long; they were corrected to the required
  sixteen-character minimum. This was a fixture correction, not a production Red.
- 11:52:06UTC: 7/7 Bun tests,175 assertions Green. A subsequent exact-target strict
  check found only the test wrapper's unknown Reflect.apply return; an Effect.isEffect
  guard made the fixture properly typed without casting away the unknown result.
- 11:53:16UTC: final focused rerun, 7/7 Bun tests,175 assertions Green. Exact root
  TypeScript options explicitly covering server.ts and the new Bun test passed;
  diff whitespace check passed. No full suite was run by this agent.

Focused command: `bun --no-env-file test apps/hub/test/receipt-tree.bun.test.ts`.
Strict checking uses TypeScript readConfigFile/parseJsonConfigFileContent on the real
root tsconfig and createProgram with those exact two targets, retaining all imports.
The TypeScript-testing skill guided the real-router regression and bounded fixture;
there was no substitute reimplementation of production authorization or tree logic.

Source is FROZEN for independent review and parent-owned full gates/commit.

## Source fingerprints (SHA-256, not transaction hashes)

- server.ts: 5e0205e94b72b1fddb304ab46016e167c1d4b8a5a07db1977c70e7fa9cb73785
- receipt-tree.bun.test.ts: c65e429f227dc287845201c2f593ed6fab1bea75797771e797b64974138fd0bb
- unchanged tree-view.ts: c6ac65dd4e92cbb81bee2c1aebf92248887342fabaaddf423b8f8d5afe14f19f
- unchanged tree-view.test.ts: 501ad2f4931a90534666323700eb692bd60841e9a475d2f15b78092156355395
