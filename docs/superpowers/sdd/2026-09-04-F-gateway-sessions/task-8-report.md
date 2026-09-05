> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 paid routing / execution integration author report

September 6, 2026 (Asia/Kolkata). Frozen after the focused run beginning02:14:14.
Parent release followed F7 commit61fe5ca. The original literal Task8 memory-first
accounting and ordinary-token proposals were superseded by the complete approved
parent decisions. Used the ts-testing skill: actual behavioral Reds, existing
Vitest/Bun tooling, strict types, real Store/Broker boundaries, controlled external
seams only. No Git, full suite, dependency, real credential, public deployment,
real network service, Gateway deposit/payment or F1 approval reuse occurred.

## Ownership and freeze

Original nine-path release was split during implementation: B9 owns the two new
executor files and its separate report; this author owns the seven paths below.
The parent owns the additive selected terminal-pair getter correction in its four
separate files. No edits to the parent's getter files, F5 ledger behavior, SQLite
schema, core/payment/buyer/runner/hire modules, or legacy pipeline.ts by this author.

| SHA256 | Author-owned frozen path |
| --- | --- |
| 505269de0137d9e4cd083cc4890262268b44b3a4f3fa6a7ab7b7f9ee22841389 | apps/hub/src/session-call.ts |
| 10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c | apps/hub/src/server-session-calls.ts |
| af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968 | apps/hub/src/server-sessions.ts |
| b0a9a2d8ffee922cf2e0a695e4ce27ab4ad40159cf275bd34bba6bbed5446e22 | apps/hub/src/server.ts |
| 346b7db6a34f8d6bb3e4b4dad92fa5dabd3a9cbfb637bc9179aa0f7387b220de | apps/hub/test/session-call.test.ts |
| 2058a6c3fdfd4b363b7374070dc6a2442e7a84e0727807a38c78027a494acc62 | apps/hub/test/session-call.bun.test.ts |
| ec7d3f8d01877ab12f36632dcd147f3d043ffa5808ed73a4d213fe7ab1bdead8 | apps/hub/test/fixtures/session-call-preload.ts |

Read-only integration fingerprints at the same checkpoint:

- B9 pipeline-sessions.ts84a152c3faa35cdc5e271716430d9509bf4b3c5cc4ac0a44e9ef132de206e692.
- B9 session-pipeline.test.ts1b70eb59279cc972f766b6875ee855cb5464b2c52d970dd7a6a2759361999fc0.
- Legacy pipeline.ts37897842bfac306bfd2ab6f19ec35d04f96f05192acfca59c161350ba4783762.
- F6 sessions.ts unchangedf1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30.
- F6 sessions.test.ts unchangedf67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5.

The complete executor ownership/review chronology is separately recorded in
task8-pipeline-report.md and task8-pipeline-parent-review.md. The original getter
freeze and the parent's additive terminal-pair change remain separate evidence;
this report does not relabel their work as authored here.

## Implemented behavior

The session-only route selects by presence of either session header, including
empty values. Canonical path/method and both session capabilities precede body,
capacity and any Store IO. Ordinary paid execution remains its existing branch.
Session+hire-capability presence refuses before payment work. Session job tokens
have a distinct HMAC realm, and both ordinary job-auth refusal branches now have
private,no-store headers without changing valid ordinary tokens/query behavior.
No session metadata feature is added to /jobs/:id.

The paid reader reuses F7's exact reviewed logic with one trusted byte-limit
argument: F7 defaults remain16KiB, F8paid allows1MiB, full monotonic deadline5s,
32active HTTP handlers, no empty-chunk accumulation, invalid UTF8/JSON/length
refusal, abort/late-read safety. This counter is transport capacity, not accounting.
F5's separate depth64/nodes65536, own-data and exact evidence-byte constraints
remain authoritative. Oversized keys are bounded before JSON encoding them.

Input validation and C delisting precede selected session state/rail/payment.
No fallback rail, provider discovery or paid-path RPC is added. Real admission
requires actual durable storage and a captured nonempty bounded configured secret
equal to the captured hub secret; F6 retains its independent Store defense.

Canonical EVM address representation is established before actual rail.verify:
asset/payTo, authorization.from/to and extra.feeSplitter/verifyingContract are
normalized together. Signature bytes are unchanged. Actual viem EIP typed-data
recovery and actual F3 Gateway recovery/provenance are exercised offline. Raw
noncanonical verifier results refuse before admission; exact original verified
object identity survives to settle, with separately frozen Job/binding data.

Amount, payer, payee, original requirements, selected network/asset/domain,
nonce/window, listing seller/skill/version/input and root lineage are bound.
Semantic retry returns the original Job and corresponding token without dispatch.
Before admission, a maximal-width fixed release candidate plus explicit16bytes
of finite-cost spelling headroom is checked against the Job evidence limit.
Before settlement, accepted output/Job/Receipt sizing validates all known local
coordinates. Sizing placeholders never escape into storage, finish, logs or proof.
Known finite nonnegative inference cost can survive a fixed release; absence or
malformed cost is not replaced by zero. Failed output/provider prose is withheld.

Gateway/Test/direct EIP allocate full seller and zero fee. Splitter EIP requires
handshake-observed fee/network, verified flag, known version and exact splitter
payee. Successful existing Hello reads stamp splitterFeeBps/splitterNetwork;
unreadable or legacy missing observations do not fabricate these facts. The new
session path never uses a changed boot fee as an observed contract fee. No new
RPC/cache/table/migration is needed. These are handshake observations, not a
fresh per-call network/contract attestation. Verified canary classification is
trusted router context only and marks both root terminal categories, not Jobs
or runner assignments. Buyer/header/body claims do not establish this marker.

F5 reserve/one-shot begin/atomic finish remain the only accounting authority.
B9's issued-Effect attempt latch prevents repeat runner/child execution and has
owner-only error cleanup; post-barrier ambiguity remains held with no output/D
or retry/release. No boot resumption or crash-proof remote settlement guarantee
is asserted. The ordinary seller-funded child path retains A ledger/capability/
receipt behavior and receives no session credentials. Only eligible EIP V2 roots
with actual children use the separate existing global child-receipt assembly;
it is not session polling and is not claimed to be bounded/indexed by this work.
Actual committed child evidence is required, never inferred from an A row alone.
Session root receipts omit optional child/tree fields. Complete covers admitted
session roots, not graph-wide finality or refund of a seller's settled children.

## Exact result contract for F9

All application responses from the new session-aware branch are JSON with
`Cache-Control: private, no-store`. Tokens are opaque32lowercasehex strings.
Amounts in serialized Receipt atomic fields are canonical decimal strings;
formatted price fields are the existing formatPrice strings. Result output is
the bounded intended persisted output only after settled terminal authority.

- Paid request: POST/x/<service>/<skill>, with x-arcade-session canonical
  ses_32lowerhex and x-session-token. Payment retry also has the existing
  payment-signature (or legacy x-payment). A probe returns402 x402Version2,
  error"payment required", accepts[the selected validated challenge].
- Accepted/semantic retry202: `{job_id:string,status:"queued",poll_url:string,
  job_token:string,price:string}`. poll_url is exactly request origin plus
  /jobs/<original-id>/result, with NO token/query component.
- Result GET requires both session headers AND HEADER x-job-token. A token query
  parameter refuses even with valid headers. Its job token is first32hex
  HMAC-SHA256(secret,"arcade-session-job:"+sessionId+":"+jobId). Canonical job
  IDs are job_ followed by16..128ASCII alphanumerics. No ordinary token is issued.
- Reserved/settling202: `{job_id:string,status:"pending"}` only.
- Uncertain503: `{error:"session_settlement_uncertain",
  settlement_status:"uncertain"}` only. F9 must treat this as reconciliation
  required; never automatic resubmission or assumed nonpayment.
- Released200: `{job_id:string,status:"rejected",result:null,
  detail:"session_released",receipt:ReceiptProjection}`. No retained output/error.
- Settled200: `{job_id:string,status:"succeeded",result:unknown,
  receipt:ReceiptProjection}`. Only the actual validated same-read Job output.
- ReceiptProjection is the actual core Receipt fields (bigints serialized as
  strings) plus `{price:string,sellerShare:string,fee:string,explorer:string|null}`.
  Gateway transfer UUID and simulated Test references are unlinked. Only a valid
  EIP/onchain nonzero32byte hash on the selected known network receives a link;
  its category/link is not independent proof of mining. No fake batch reference.
- Canonical auth/membership refusal404 `{error:"not_found"}`; unknown session
  may return404 `{error:"session_not_found"}` after authenticated lookup.
- Corrupt/unavailable selected evidence503 `{error:"session_unavailable"}`.
- Input400 `{error:"input_invalid"}`; verify/binding402
  `{error:"payment_invalid"}`; verified other buyer403
  `{error:"session_buyer_mismatch"}`; C refusal403 listing_delisted;
  capacity429 session_capacity; budget402 session_budget_exceeded;
  closed409 session_closed; unbuilt rail409 session_rail_unavailable;
  conflicting reservation409 session_conflict. Error bodies reflect no provider
  prose or capability. These are non-long-polling responses; F9 owns its elapsed
  overall deadline/strict phase decoder, not ordinary120second polling semantics.

After capability auth and selected membership, terminal polling calls exactly
getSessionTerminal(sessionId,jobId), returning a defensive Job/Receipt pair from
one validated selected read. No global getJob/allReceipts call is used in this
route. Pending/uncertain do not request a terminal pair. The original narrow
getSessionReceipt remains a compatibility projection owned by the parent.
F7 same-snapshot closed_receipt read-only recovery is unchanged.

## Genuine Reds and setup-only failures

- Initial unchanged production server: actual F5 legal released Job retained
  sentinel output/provider diagnostic. A session-header metadata request using
  the old ordinary token exposed both. Owned Bun0pass/1fail5assertions. This is
  a real route-composition failure, not an invented earlier F8 token issuer.
- Missing session-call.ts and later pipeline-sessions.ts were separately recorded
  collection failures, zero tests. They are not behavioral Reds.
-01:50:35: actual mixed-case TestRail completion failed after settlement, while
  oversized escaped-key instrumentation observed JSON.stringify encode the
  >1MiB key before its final refusal.5pass/2fail. Preverify canonicalization and
  early key accounting fix these different boundaries; the key test never claimed
  an oversized input was admitted. B9 inherited the mixed-case pipeline test.
-02:01:23: typed TestRail verification refusal incorrectly returned503 rather
  than402; a contradictory returned Receipt.reason was projected200.31pass/2fail.
  Fixed local error mapping and stricter terminal response correlation.
-02:05:22: session-aware /x and /jobs namespace-root requests fell through without
  the private response;41pass/2fail. Added their private pre-IO rejection.
- Parent's read-race concern reproduced with actual memory Store/Ref: real getter
  validates the terminal, then a wrapper updates only Job output, and the later
  memory getJob delivered the replacement200.0pass/1fail,9filtered. SQLite's
  existing getJob separately revalidates digests and is not claimed to have this
  same behavior. Parent added one-read terminal pairs. The regression now returns
  original validated output200 for that same interleaving and rejects subsequent
  corrupted state503. Initial corrected rerun caught corrupt memory snapshot
  mapping as402; selected-read failure mapping now preserves storage503.
-02:09:37: verified canary marker omitted from fixed release (1fail/43skips).
  Minimal trusted-context/receipt addition, no runner propagation.
- Setup-only corrections: original unit listing fixture used nonexistent public
  fields; initial release-size sample was not actually at the boundary and was
  replaced with measured serialized Job sizing; uppercase-only viem address was
  not checksum-valid, replaced with actual getAddress; guessed hire header was
  corrected to exported HIRE_CAPABILITY_HEADER. No production fixes were inferred
  from those fixture errors. Adding fixture stats fields required an additive
  expected-field assertion update. Exact TypeScript exposed a fixture `now:number`
  accidental spread into a `now:()=>number` route option; replaced with exact deps.

## Verification actually executed

Final focused Vitest run beginning02:14:14 exited0:193tests/6files, including
44author call tests,48B9 executor tests,56unchanged F7 endpoint,30unchanged F6,
5receipt and10rail tests. This is not the root full suite.

```text
bun --no-env-file x --no-install vitest run apps/hub/test/session-call.test.ts apps/hub/test/session-pipeline.test.ts apps/hub/test/session-endpoints.test.ts apps/hub/test/sessions.test.ts apps/hub/test/receipts-feed.test.ts apps/hub/test/rails.test.ts
bun --no-env-file test ./apps/hub/test/session-call.bun.test.ts ./apps/hub/test/session-endpoints.bun.test.ts
```

Final actual owned Bun run exited0:21tests/2files,308assertions,19.24seconds.
Includes10F8 tests and11unchanged F7 tests: actual production router, raw1MiB/+1,
five-second whole-body stall plus late valid remainder/no mutation, owned real
Broker root/ordinary-child flow, SQLite close/reopen with original capability and
no execution replay, successful/unavailable signed Hello observations, retained
released-output privacy and one-read memory mutation regression. Gateway tests
use the actual F3 implementation/signature recovery with an offline controlled
fetch response; no live facilitator/provider/mined-batch claim.

Exact TypeScript program: actual root tsconfig options, nine explicit original
paid-router/executor source/test roots, dependency traversal, noEmit:true and
incremental:false. Final diagnostics0, exit0. No file exclusions or weak types.
Trailing whitespace scan of newly authored files returned no matches.

Owned subprocess envs are allowlisted, use no env-file loading, and do not inherit
real secrets. Cryptographic fixtures are ephemeral/unfunded. Loopback bind used
the explicit sandbox approval; outbound fixture traffic is blocked except its
exact owned origin. Every owned child is awaited with bounded TERM-to-KILL,
streams drained, secrets absent from bounded output, and listener refusal checked
after cleanup. Actual raw HTTP completion is observed by bounded Content-Length;
Bun's peer EOF is NOT asserted, and socket closure is not cancellation of remote
paid work. SQLite temporary directories are removed only after owned handles and
child processes close. No fixture listener or test process remains running.

Parent and independent final reviews/full gate/publication/atomic commit remain
parent-owned. G3's original pure review and narrow canary re-review are separate
historical checkpoints, not substituted for the final router review.
