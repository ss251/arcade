> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b6 parent implementation and native verification report

September 6, 2026, root-only on feat/h-web after e87ae07. This is self-review,
not an independent review. The owner machine-load restriction remains active:
no delegates, no concurrent reviews/gates, explicit four-worker command limits.
No new spend, live chain RPC, owner-key read, one-shot replay, deployment,
production ENS change, mainnet operation or push.

## Implemented boundary

Real Chat/useChat now owns a private conversation controller in effect setup/
cleanup. Restored initial tool IDs are retired. Only the live Confirm completion
callback can mint a bounded one-use permit for exact approval/call/tool IDs,
canonical actual input, skill, ceiling and full displayed quote. SDK flags,
output, historical records and preliminary output cannot create authority.
Pending entries are removed before queued execution; duplicates cannot replay.
Runs serialize and keep their original expiry. Cleanup closes unused permits,
aborts active continuations and suppresses late updates. It cannot revoke a
signature already produced by a wallet or cancel an admitted remote job.

PendingPurchase uses the complete bounded quote/ENS context and a bounded
15-second selected-wallet check. It blocks unknown accounts/network, getters,
sparse arrays, unsupported rails and prices above the ceiling. Only explicit
connect invokes the existing connector; each nested RPC stays under the deadline.
Wallet events invalidate the card; the final shared signer also rechecks actual
selection. Full private identity reaches Confirm only in memory. Exact input
and selected buyer remain inspectable. Prototype names cannot impersonate a
private result view, and malformed later SDK parts cannot erase that view.

The old auto-mounted Settlement/signPayment path is removed. The old /api/settle
endpoint is a fixed 410 with zero request-property/body/quote/forward/result IO.
Model-facing purchase prose now describes readiness, not settlement or proof of
no charge. The server preparation API is retained; it never supplied payment
authority by itself and is no longer described as making mismatch impossible.

Only closed H10b4 results populate live views. Full paid JSON is escaped,
selectable and disclosed without truncation. EIP explorer links are explicitly
hub-reported, not independently verified chain proof. Gateway UUIDs say they
are not mined transactions. Recovery storage failures stay visible and private
capabilities/results are not added to SDK/model/history/SSR/URLs. Generic Thread
and restored Chat purchase records remain passive unverified transcript claims.

## Failure-first and focused chronology

- Initial foundation tests passed20 conversation +45 retained runner checks,
  then11 wallet +20 conversation checks. New-module tests were prewritten;
  no manufactured missing-import failure is claimed.
- 15:50:08: three new conversation edge cases failed: already-answered requested
  approvals (true/false) could mint, and malformed requested-state denial failed
  to burn an existing permit. Fixed; later25 conversation cases all pass.
- Wallet account table was changed to object-wrapped cases so array arguments
  are not spread by Vitest. The first disclosure fixture was below the1200-char
  threshold; enlarged to150 lines. These were fixture corrections, not product
  regressions. React19 ref initialization/mock return types were also corrected.
- 15:55:24: both zero-IO retirement expectations failed on the old courier;
  after replacement both pass.
- 15:58:37:82 focused tests/7 passed in1.87s, including real keyless quote/ENS,
  offline shared signer, direct POST and header-only recovery.
- 16:12:11: four review cases failed: three prototype-named IDs falsely selected
  inherited private views, and preliminary output entered the runner. Fixed.
- 16:12:53: broad focused web selection was mistakenly run without local-socket
  escalation:930 passed,2 failed,9 skipped across41 files; three existing
  Start-fixture files failed setup. This was NOT the full gate. The closed run
  was followed only by those three files with permissions:11/3 PASS at16:13:31,
  2.08s. No source change or full selection rerun for that setup correction.
- 16:14:13: two new wallet cases failed on null options/sparse account arrays.
  Closed own-data options and account snapshots fix both without invoking getters.
- 16:14:48:42 focused/3 PASS,849ms; exact14 web roots (including generated route
  registration) and2 fixture-program roots: zero strict diagnostics. The earlier
  four route registration diagnostics were fileless compiler setup, not suppressed
  source errors; a fixture literal scheme typing was corrected before the final check.

## E13 regression migration

| Previous courier/presentation concern | Current exercised boundary |
| --- | --- |
| Actual input + ENS + payee/price recheck | quote-routes (actual handleQuote + default runner), purchase-quote, purchase-run |
| Forward only once, no redirected paid request | ordinary-payment-http and default-runner integration |
| Never follow untrusted polling URL | ordinary-payment-http ignores it; ordinary-job-http constructs fixed header-token paths |
| Valid15-second poll / overall90-second bound | quote-routes direct long poll; retained ordinary-job-http deadline/cancellation tests |
| Job/status/buyer/seller/money/nonce correlation | purchase-outcome + purchase-run; canonical bounds_exceeded/runner_lost/rejected checked through actual-run fixtures |
| No private diagnostics or no-charge promises | purchase-run/outcome, live view, confirm-ens, passive Thread/Chat |
| Full escaped purchased result | purchase-view plus actual native DOM; raw historical output is no longer certified |
| Old route cannot remain a signature backdoor | settle-retired zero-property/body/IO assertions |

Old test expectations that accepted uncorrelated raw receipt flags or asserted
“you were not charged” were deliberately replaced, not silently retained as
false guarantees. Historical public records and their old source pins remain
unchanged; updated source/test pins below supersede only the current behavior.

## Native proof, scope and cleanup

Owned fixture sources use actual Chat/useChat/Confirm, keyless quote + ENS/server
preparation, the shared EIP/Gateway signer and offline signature recovery, direct
ordinary transport, H9 storage and production H10a CORS. The SSE model, wallet
account and hub receipts are explicitly synthetic. No chain execution, mined
batch/transaction, real provider prompt, model selection, production deployment
or paid live evidence is inferred.

Two initial startup attempts failed before rendering: the first had no startup
diagnostic; the second captured the global location redeclaration caused by
serving a Bun browser bundle as a classic script. The fixture now serves a module
script. The third attempt passed9 cases. After final source hardening, the final
attempt passed10 cases, including the added preliminary-output refusal.

Final cases: SDK/native hold/EIP recovery plus duplicate output chunks; passive
approved-output restore/repaint; Gateway domain and qualified UUID; preliminary
output refusal; mismatched output identity; native denial; retired unanswered
restore; wallet-chain event during hold; failed SDK request; unmount while a
wallet signature is pending followed by a real late offline signature.

Final totals are2 simulated signed submissions,2 offline recoveries,2 result
reads,4 actual browser preflights. A third fixture signature completes after
cleanup and is not forwarded. No private signature/token/result appears in
SDK/model/history payloads or DOM capability locations. Twenty exact owned PIDs
across four attempts are ESRCH;12 recorded web/hub/CDP ports ECONNREFUSED; no
remaining process refers to the owned runtime/profile directories. SIGTERM
cleanup sufficed; no shared browser/profile, update, telemetry or recording.

Desktop1280-light and390-dark width-emulation screenshots were inspected.
Full address/verified ENS/price/hold instructions remain visible or scrollable
without horizontal document overflow. This is not touch-device, screen-reader,
production Start hydration or live-wallet UX proof. Existing Start-route tests
separately exercise server-rendered routes. Public native-check artifact records
the actual test logic; runtime journals/screenshots stay local and hash-pinned.

## Source freeze (SHA-256)

- apps/web/src/components/chat.tsx: 8ed008bee5657d0d63d1771d2b5d7c4f161f991dcd4d4c68f78b481c6820bb06
- apps/web/src/lib/purchase.ts: f73d947b43b2ec2121d0b8768fcf9a7f6766988eeee41a5a099b49aba6136c48
- apps/web/src/lib/tools.ts: d6469184fe0b6a95f60caf2df9198e9cb27aa8e479a92231bc4432c71ef5b526
- apps/web/src/routes/api.quote.ts: 2081388b5ff42bbb8360872cf27dc508ee9b16776b9c9fde77c2a0ee973341b8
- apps/web/src/routes/api.settle.ts: 55d7d01b3bcf5f400838c9993e7fd08474b7a7eed0192611f28717bb36d4b2df
- apps/web/test/confirm-ens.test.tsx: 738b72676acc6608402f178c6f6e07ce20ccb813822e5af9d1bbe67c0003c23f
- apps/web/test/quote-routes.test.ts: 30e46768a04fae12682ad73eea9e9322ed0b4a62e2ca4b3d8089428bea9b68aa
- apps/web/test/thread.test.tsx: 4911bca90b4ecac7a151629ee8783fb10c3753e69b05d0e02d3319e4ebe553d7
- apps/web/src/components/purchase.tsx: cdc3b342121aa4be14c621747b61b4789d792a92eb817c355253647188a71df6
- apps/web/src/lib/purchase-conversation.ts: 5d1a162a0386a6550aa8691279947c79ab030efa5f95e56bd3f2ac43bdc05ecd
- apps/web/src/lib/purchase-wallet.ts: 1abf3898aae6f121c69ffcaac5c810032c0919a735cfd27e920fb8b4e4deda17
- apps/web/test/fixtures/chat-purchase-browser-server.ts: 39280bd82058e24653b8ef849aa48736927439f9e13871e6a0000efb8acabb4e
- apps/web/test/fixtures/chat-purchase-browser.tsx: cca6168cd4a60ec3a492dc52f5642f354e670e98edaa8a469370440b12fcef80
- apps/web/test/purchase-chat.test.tsx: dca0cd580af527fbcde95e5d866e7bf21a626aaed474b630fa3916bde769d162
- apps/web/test/purchase-conversation.test.ts: d5aa69cbd9b4b475f0e1ad76999608dd91bd3c6d36809a82e80d103a0d97e03f
- apps/web/test/purchase-view.test.tsx: 745da7b6cbb7c3a288a025794c0570a6d250ee4f03048765ceb0409cbde41384
- apps/web/test/purchase-wallet.test.ts: 92582065f6732a0c93bb2d1330b79c7a96156a2c3fe9484e718870e8fefba9c7
- apps/web/test/settle-retired.test.ts: b17524986c787a9f18d943fa0eaab6fae072585bc81534c72a25979442cefac6

## Gate and next work

The single frozen full gate is pending at this report's initial checkpoint;
its exact completion is appended below before publication/commit. Active ordinary
Chat purchase migration is implemented; H10 buyer/session recovery, H11–14,
H merge, deferred G8/G9, vendor tasks and Plan I remain separate. Main5259f9a
is unchanged. OWNER-NEEDED has no new owner-only blocker from this task.

Final native runtime artifact SHA-256 pins (owned local runtime only):
- check.stdout.log: 2039f22c21f502feac3d5cd83c481f7e8d6122a3460fc7885979b7ceb49d950a
- check.stderr.log: c91cb20c4e774d969e7388cd092ce119172121e6827d2f1386fd92ef6a41c00a
- check-result.json: 6b5972f5327812d8f93fd4b5b66fc8013e4547a1db17fa055abef54bad748167
- ready.json: 59afb620a328cc5f6e9e325df9ba3604a220bbafddc36e35806e3ab58995686b
- cleanup.json: c48396a21142840c43fbe8593493b7e95d1ddfd389c51e66d2e983e39d5e89f5
- shots/1280-light.png: f26732a139dfbf10ee1497b1960eb079e4602c9f091ca2cb266608304480e2c5
- shots/390-dark.png: e6328f622e2f894b23a015ed6755ff9dd156c27a7ff7efcbd6ac9e7e22ea0d5a
- check.py: 1408950684ca5ea6af2d4bb6a3bdc4508d355c55eb59c0dc17c1454e7cbcb966
- supervise.ts: 911a1d4d0da098eb354ddac4e58bb8e0b56bcb6c66cb314ef7d0261ee5064975

## Final frozen gate completion

The sole full gate began16:22:25IST and closed94360 exit0. Vitest:3,918/164
PASS in50.20s. The sequential Bun suite exited0; its numeric footer was lost
inside the tool's truncated completion chunk, so no freshly observed Bun count
is claimed. Root and web strict commands passed through the same && chain;
actual client build362ms and SSR155ms. No source change, second full gate,
concurrent gate or independent review occurred. The earlier focused socket
setup recovery is separately recorded above, not represented as this full gate.

Final native check succeeded on the frozen18 source/test files; both final
screenshots were inspected and their hashes retained above. Public copy/source/
privacy/link/preservation audit and atomic local commit follow this checkpoint.
