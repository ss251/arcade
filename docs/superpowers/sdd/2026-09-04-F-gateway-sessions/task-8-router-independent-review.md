> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 paid router — independent final source/runtime review

Frozen September 6, 2026 (Asia/Kolkata), approximately 20:55 UTC September 5.

**CLEAN for G14's seven frozen paths and their reviewed integration.** No source
correction requested. Parent still owns the combined repository gate, publication
and commit. Earlier getter/pure reviews retain their original checkpoint scope;
this review does not rewrite their hashes, counts or chronology.

## Read scope and freeze

Read complete current task8-parent-decisions and the complete 228-line author
report at SHA-256
`0afc09de4d72b24f5e555ebd059b9404285328a598dac4eb4a2509e8296dce9c`.
Coordinated the final seven-file freeze directly with G14 before running checks.
Read the full router, shared transport helper, 1,350-line production server,
actual Bun tests and preload; the complete pure pair had already been read at
its accepted final checkpoint, with all later router-only mock deltas inspected
and exactly reconstructed. Read the actual executor, same-read Store operation,
delisting/input gates and public receipt projection as integration context.
The ts-testing skill informed behavioral checks using the existing runners and
actual strict options; no unrelated review automation was invoked.

```text
505269de0137d9e4cd083cc4890262268b44b3a4f3fa6a7ab7b7f9ee22841389  apps/hub/src/session-call.ts
10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c  apps/hub/src/server-session-calls.ts
af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968  apps/hub/src/server-sessions.ts
b0a9a2d8ffee922cf2e0a695e4ce27ab4ad40159cf275bd34bba6bbed5446e22  apps/hub/src/server.ts
346b7db6a34f8d6bb3e4b4dad92fa5dabd3a9cbfb637bc9179aa0f7387b220de  apps/hub/test/session-call.test.ts
2058a6c3fdfd4b363b7374070dc6a2442e7a84e0727807a38c78027a494acc62  apps/hub/test/session-call.bun.test.ts
ec7d3f8d01877ab12f36632dcd147f3d043ffa5808ed73a4d213fe7ab1bdead8  apps/hub/test/fixtures/session-call-preload.ts
```

All seven and the author report matched before checks and at final inventory.
Legacy pipeline.ts remains
`37897842bfac306bfd2ab6f19ec35d04f96f05192acfca59c161350ba4783762`;
F6 sessions.ts remains
`f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30`.
Parent/B9 separately own executor and terminal-pair getter acceptance.

## Independent commands and exact observed results

All shells used login:false and all Bun commands used --no-env-file.

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/session-call.test.ts apps/hub/test/session-endpoints.test.ts apps/hub/test/sessions.test.ts apps/hub/test/receipts-feed.test.ts apps/hub/test/rails.test.ts
bun --no-env-file test ./apps/hub/test/session-call.bun.test.ts ./apps/hub/test/session-endpoints.bun.test.ts
```

- **145 Vitest passed / five files**, exit 0 at 02:18:54 IST, 1.56 seconds:
  all 44 F8 unit cases, 56 F7 endpoint, 30 F6, five receipt-feed and ten rail cases.
  Unlike the prior pure reviews, no router cases were filtered out here.
- **21 actual Bun passed / two files / 306 assertions**, zero failures, exit 0,
  18.49 seconds: ten F8 cases plus eleven F7 regressions. The author observed 308
  assertions on its run; this reviewer observed 306 and does not copy 308. The
  bounded poll loop adds assertions for each pending response, so its assertion
  count can vary with completion timing while the case count remains fixed.
- Exact installed TypeScript createProgram through `bun --no-env-file -e` used
  the absolute root tsconfig, actual parsed options, exactly the seven owned
  absolute roots (including nested Bun tests/preload), noEmit:true and
  incremental:false. Collected config/parse/all pre-emit diagnostics:
  **EXACT_F8_ROUTER_ROOTS=7 DIAGNOSTICS=0 WATCHED_STABLE=true**, exit 0. All seven
  hashes stayed unchanged across compilation; no compiler option was weakened.

Actual loopback tests ran under the explicit scoped sandbox approval, not a
default unrestricted network command. Their child processes have allowlisted
dummy environments, --no-env-file and controlled external seams. Owned raw
sockets, WebSockets, processes and SQLite directories are bounded/cleaned, and
post-cleanup listener refusal is asserted. No operational account was used.
The fixture signs only with ephemeral unfunded offline accounts. Its contract
client and Gateway fetch responses are controlled local test evidence, not an
RPC/facilitator observation.

## Additional independent router checks

Ran a fileless `bun --no-env-file -e` script importing the real route, TestRail,
Store, Sessions and Broker. **Five cases / 40 assertions passed**, exit 0, 186 ms.
Four cases crossed configured verified-canary match/nonmatch with runner
success/failure. Every request carried a forged marker in its body and header;
only the configured verified payer produced receipt.canary:true on either
terminal category. Actual settled output was delivered only on success; release
returned null output. Runner assignments had no top-level sessionId/sessionToken/
canary field. Every completed root had held zero and each owned runner was
unregistered. The fifth case seeded an actual volatile Gateway session and
proved that paid admission returned fixed 503 before challenge/verify even with
a matching configured secret. The trap rail performed no Gateway operation.

All supplementary assertions passed on first run, not claimed as Reds. No fixture
file was created; the executable invocation is retained in command history.
The four completed payments were entirely simulated TestRail accounting.

## Reviewed boundaries

Presence of either session header selects the session-only /x and /jobs branch.
Canonical path/method, both session credentials, distinct session-job header
token for results, and query-token refusal precede body/capacity/Store reads.
Invalid capability remains private 404 under load. Session+hire presence refuses
before challenge/admission. Both ordinary job endpoints reject distinct session
tokens before reads, and session-header metadata requests cannot reach ordinary
Job projection. Valid ordinary capability compatibility is unchanged.

Paid input uses the same F7 whole-body monotonic deadline, abort/cancellation
and empty-chunk handling, with a trusted 1 MiB bound and 32 active transport
handlers. F7 defaults remain 16 KiB. Actual raw 1 MiB/+1 and five-second stall
plus late remainder tests passed without late admission. These are application
responses observed through bounded Content-Length parsing. **Peer EOF was not
asserted**; socket destruction is not proof of cancellation of remote paid work.

The selected rail and network are pinned by actual session state; real admission
requires captured durable storage plus bounded nonempty matching configured
secret. Actual verification precedes buyer/canary classification and durable
reserve. Canonical address normalization preserves the original VerifiedPayment
identity. Splitter fee/network fields are stamped only from successful existing
signed-Hello observations, consumed without boot-fee fallback, and unavailable
observations remain absent. The actual Hello tests use controlled contract reads,
not live contract identity or deployed-chain proof.

Only newly created reserve results dispatch. Semantic retries return the
authoritative original ID/token without redispatch. The issued executor is not
tied to the HTTP response lifetime. Its separate one-shot/uncertainty behavior is
covered by the parent's executor review; there is no new restart resumer or
automatic retry. Actual owned Broker root/ordinary-child execution passed:
child requests were seller-funded/sessionless with hire capability, while only
the root consumed the session ledger. Root receipts omitted tree/child fields.
This is not cross-ledger atomicity, graph-wide finality or a child refund claim.

Result reads authenticate then establish selected membership. Reserved/settling
return only pending202; uncertain returns fixed private503 with explicit
uncertainty status and no output/receipt. Terminal reads use exactly one selected
getSessionTerminal operation, never a later global getJob. The actual memory
mutation regression returned original validated output, then refused later
corrupt state503; it does not claim the old SQLite path had the same race.
The pair's own data and receipt/Job coordinates are checked before projection;
released retained output/provider error never escapes. Actual SQLite reopen
retained the original capability and receipt with zero execution replay.

Terminal result shapes match the author's frozen F9 handoff: fixed rejected/null
result/detail for release; intended output only for succeeded/settled evidence;
canonical serialized atomic fields plus formatted price/share/fee and explorer.
Gateway/Test references remain unlinked; only the selected EIP/onchain valid hash
gets a link. All new application responses are private,no-store and fixed errors
reflect no raw provider prose or capabilities. These links/categories are not
independent mining or credit proof. Existing F7 public receipt ID omission and
same-snapshot closed-receipt recovery regressions remained green. F14's later
global UI/docs handoff is not claimed complete by this review.

## Narrow source-scope audit and limits

Read-only in-memory reversal of approved imports/wiring, observed splitter
fields and the two ordinary private auth refusals reconstructed the exact F7
server.ts hash
`8079438b515405e4b0cf507afdc9fc05b54d0f9ac3f6805bf75370e4c088b923`.
Reversing helper exports/aliases, trusted maxBytes argument/comparisons and the
Content-Length digit bound `{0,6}` back to `{0,4}` reconstructed exact F7 helper
hash `6ea6b0f61bc42f1482db75867745bc02de4182864a3e1d4decd50c654c65dd1d`.
The initial helper reconstruction omitted that necessary digit widening and
therefore did not match; parent supplied the exact old expression from its
committed-source check. This was an audit-script omission, not a source Red or
behavioral finding. No Git command or source rewrite was needed by this reviewer.

Own-data checks are not a hostile JavaScript Proxy sandbox; existing memory
validation indexes receipt.jobId. The output validator remains its existing
documented subset, not a newly complete JSON-Schema engine. Same-read authority
does not promise newest-after-read output or defend against a compromised Store.
Local process/disk tests do not establish crash-proof remote settlement, current
Gateway state, deployment safety or live funding authority.

Only this ignored report was written. No production/test/dependency/public-doc
change, Git operation, full repository suite, external network service, operational
wallet/Keychain/ambient-env access, live spend, F1 approval reuse or G/H work.
