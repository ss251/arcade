> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 source handoff proposal — September 6, 2026

READINESS ONLY. Read complete actual Plan F Task 8/global constraints,
task8-parent-decisions (including the newly appended single-attempt rule),
task8-integration-readiness, task8-capability-review and current F7/F6, Store API,
paid/result router, pipeline, broker, EIP/Gateway/Test wire/binding, validation and
representative lineage/tree tests. No source/test/fixture edits, test execution,
full gate, Git, network, keys or live action. Only this ignored note is written.
F8 source remains held until the reviewed F7 commit and explicit parent release.
Prior readiness alternatives are historical; the latest parent decisions settle
fee policy, uncertainty503, capability separation and paid body limits.

## Proposed exact ownership

Nine implementation paths, separate from the receipt-getter agent:

1. NEW `apps/hub/src/server-session-calls.ts`: import-safe session-only paid/result
   route factory, header-presence dispatch/authentication, capacity, selected
   snapshot/rail resolution, challenge/verify/admission and private projections.
2. NEW `apps/hub/src/session-call.ts`: pure bounded admission/binding/terminal
   preparation and shared internal types. Exact queued time, fixed release
   headroom, own-data normalization and local-only acceptance sizing live here.
3. NEW `apps/hub/src/pipeline-sessions.ts`: separate session-root executor with
   actual Broker/Store/F6/Rail seams, one-attempt closure, validated terminal
   preparation, durable begin/finish and EIP-only downstream attestation.
4. `apps/hub/src/server.ts`: construct/wire that factory with the already captured
   service/Store/Rails/chain/secret; retain the ordinary paid branch unchanged.
   Narrow guards for session-header presence on ordinary job metadata, and
   private no-store job-authentication refusals, are included here.
5. `apps/hub/src/server-sessions.ts`: narrowly export/reuse the reviewed private
   response/auth helpers and body reader through a trusted internal byte-limit
   argument (16,384 default; 1,048,576 for new paid requests). Existing open/close
   defaults, 5-second timer+monotonic checks, empty-chunk behavior and tests stay
   intact. No untrusted request chooses limits.
6. NEW `apps/hub/test/session-call.test.ts`: paid binding/router/capability/result
   unit regressions using real F5/F6 and only narrow controlled failures.
7. NEW `apps/hub/test/session-pipeline.test.ts`: executor/size/barrier/fee/D/child
   integration cases using actual local accounting, broker and rail seams.
8. NEW `apps/hub/test/session-call.bun.test.ts`: actual production router,
   loopback/raw body limits, durable terminal/reopen, capability realm bypasses,
   and real owned root/child broker flow.
9. NEW `apps/hub/test/fixtures/session-call-preload.ts`: one bounded child fixture
   with actual memory/SQLite Store, offline controlled rails/failure injection,
   observed calls/IO and production routing; no external services or real keys.

The existing `pipeline.ts` can remain byte-unchanged: server dispatches admitted
session roots through the new executor, ordinary roots/children through runJob.
Its exported RunJobArgs type may be consumed as a type-only reference for the
existing attest/hire fields. No wrapper branch in the legacy executor is needed.
This minimizes risk to its different failure/fee/tree behavior. If the parent
prefers a tiny typed delegating branch there, that would be an explicit tenth
path; it is not necessary for the proposed implementation.

Read-only regression targets include existing pipeline, rail-pipeline,
pipeline-tree, pipeline-attest, lineage, F7 endpoint/receipt and F6 tests. No
edits to core, payment rails, buyer/runner/hire, D/ENS or those frozen tests are
proposed. No dependency, schema, migration, table, queue or ownership cache.

## Non-overlapping receipt getter handoff

The separate agent owns ONLY the declaration in session-ledger.ts and actual
sessionStoreApi implementation in store.ts, plus its dedicated getter tests:

```text
getSessionReceipt(sessionId: string, jobId: string)
  => Effect<Receipt | undefined, SessionError>
```

Use the exact parent-approved canonical IDs, selected call membership, actual
validated persisted evidence and defensive copies. Pending may be undefined;
missing terminal evidence is corruption. SQLite reuses its existing selected
read transaction; memory retains its current representation. I do not edit
those files or introduce a second implementation. Consume the getter only for
terminal session result reads, after capability authentication and snapshot
membership. A selected pending/uncertain poll needs no receipt or Job lookup.

Before final integration, confirm the getter agent's frozen signature/error
contract and exact-target tests. Mandatory interface additions may expose old
explicit mock types; any minimal parity correction belongs to that agent/parent,
not an unannounced rewrite in this branch.

## Router order and capability contract

At request dispatch, presence of EITHER x-arcade-session or x-session-token
selects the session path, including empty values. Canonical method/path and both
session credentials precede body/capacity or ANY Store IO. No truthiness fallback.
Session+hire-capability presence refuses before challenge/admission; seller-funded
sub-hires still work through the separate ordinary path.

After that transport/auth precondition, preserve the existing semantic order:
selected listing/input gate, C delisting, selected session snapshot/rail,
root lineage, challenge/verify, recovered payer check, immutable admission.
Bound raw paid JSON to1MiB/5s/32 handlers only on this branch. Apply existing F5
bounded canonical input/depth/node checks before recursive input validation;
the raw byte bound is not queued/terminal headroom. Release transport capacity
with the HTTP response, not when the asynchronous job finishes.

The selected built rail issues both challenge and verify and is retained through
settle. No fallback or new provider check. Real call admission uses the captured
configured-secret/durable guard plus F6 defense. Validate exact payer/from,
amount/value/listing price, selected network/asset/domain, nonce/time, payTo,
seller, skill/version, request digest and root coordinates. EIP/Test's broader
value>=required and accepted.network behavior is not enough by itself.
Keep the actual VerifiedPayment object by identity; snapshot its binding data
separately without cloning it into a substitute for Gateway's WeakMap object.

Before reserve, create the exact immutable queued Job and prove room for its
minimal fixed released terminal. Only reserve(created:true) creates the worker.
created:false returns the authoritative ORIGINAL job ID, corresponding token
and token-free result URL without dispatch. Verify still precedes reserve; no
claim that all expired/mined replays succeed and no signature bypass.

Issue first32 lowercase hex HMAC-SHA256 over
`arcade-session-job:<sessionId>:<jobId>`, never `arcade-job:`. Validate F5's exact
job_[A-Za-z0-9]{16,128} and canonical session ID first. The new 202 preserves
job_id/status/poll_url/job_token/price, but poll_url is exact-origin and token-free.
No session credentials or job-result capability are passed into Broker/runner/
seller-funded child requests, alternate response fields, logs or URLs.

New result requests require both session headers AND HEADER x-job-token; a token
query parameter refuses even with valid headers. Authenticate both HMACs before
any Store read, then prove selected snapshot membership. /jobs/:id metadata gains
no session feature: either session header refuses privately before IO. Without
session headers, session-job tokens fail ordinary authentication before ordinary
getJob/allReceipts. Both existing job-auth failure responses therefore need the
private no-store header even for ordinary malformed tokens: their opaque bytes
cannot be classified by realm without the session ID. The ordinary error body
and valid header/query compatibility remain unchanged; this is the required
capability privacy guard, not a new lookup or migration scheme.

Poll from current persisted evidence, not a long-running in-memory job map:

- reserved/settling: bounded202 `{job_id,status:"pending"}`, no output/receipt.
- uncertain: fixed503 `{error:"session_settlement_uncertain",
  settlement_status:"uncertain"}`, no output/receipt.
- released: actual persisted receipt, `result:null` and a fixed local refusal;
  never copy retained Job output, provider error or arbitrary diagnostic.
- settled: retrieve the actual correlated persisted receipt and only then the
  validated immutable Job output; expose the bounded intended result shape.
- corruption/unavailable: fixed503 session_unavailable, no fallback/synthesis.

All new responses are private,no-store. Only EIP/onchain canonical nonzero hash
on the selected known network may be linked; Gateway/test references stay
unlinked. The F9 client must retain job_token and send all three headers; ordinary
callSkill's query-token poll behavior is not session support.

## Executor invariants

Allocate an attempt latch once in the issued executor closure, outside repeat
Effect evaluation, and claim synchronously before dispatch. Re-evaluating that
same Effect concurrently or later cannot execute the runner/children again.
This is process-local attempt ownership, not durable accounting or a boot
resumer. It cannot replace reserve(created:false) or F5's independent one-shot
settlement barrier. Do not add a second per-job accounting map.

Dispatch preserves original admission Job ID/createdAtMs. Bounded own-data
outcome normalization precedes output validation; malformed/oversized output
uses a fixed prevalidated release before begin, never raw output/error. Preserve
valid cost when known; do not make absence zero. Validate full accepted terminal
shape/coordinates and worst allowed reference/timestamp serialization before
begin. Sizing-only synthetic references stay local and never reach storage,
finish, log, attestation or a response.

Only durable claimed:true may call settle, through Effect.suspend, with the
EXACT verified object and actual available EIP V2 SettleTree where applicable.
Keep every post-begin typed error/defect/timeout/interruption/malformed result or
terminal-storage failure held (settling/uncertain). Bounded best-effort marker
failure cannot erase the already-durable hold. Preserve interruption; no resend,
expiry release, compensation, synthetic refusal or no-charge claim. Only atomic
finish permits terminal output/log/evidence.

Gateway/Test and direct EIP allocate full seller/zero fee. Splitter EIP uses the
configured valid fee only with verified per-listing splitter plus exact payee/
requirements binding; an unverified announced splitter refuses before challenge.
No session receipt has feeAccrualId. Root session terminal receipts omit children
and all optional tree commitment fields; mandatory root lineage remains.

Seller-funded children keep existing A ledger/ordinary pipeline/ordinary tokens.
Where an EIP V2 tree is actually available, its current assembly depends on
treeState plus actual child receipts (legacy allReceipts), not merely Job status.
Retain that existing separate tree-evidence operation only for eligible roots
with children; never use global receipts for session status/result or claim the
legacy child-tree operation became indexed. A new arbitrary-child receipt getter
is not included in the approved session-receipt getter scope. Do not infer a
settled child receipt from a committed A row if actual evidence is absent.
No graph-wide-finality, child-refund or dual-ledger-atomicity claim.

EIP-only D enqueue follows actual terminal persistence and existing verified
owner/chain gates, carries actual verified.payTo, and stays best-effort50ms.
Gateway/Test/uncertain skip the hash-only D service. ENS remains observational.

## Failure-first matrix and release checkpoints

Capture genuine behavior before fixes, including current ordinary-token access
to an actual legally released Job retaining output, without inventing a deployed
F8 issuer. New-domain headerless legacy requests must subsequently refuse before
all relevant reads. Keep valid ordinary header/query compatibility cases.

Cover swapped capabilities/foreign membership, malformed/Unicode/merged/empty
headers, query rejection, snapshot/receipt corruption and healthy recovery;
one-shot/semantic duplicate admission; exact too-large amount/domain/payee
misbinding; pre-admission release headroom; output depth/cycle/getters/cost/time/
byte limits; held outcomes after settlement ambiguity/commit failure; repeated
and concurrent evaluation of the SAME issued Effect; EIP/direct/splitter/Test/
Gateway fee/category differences and D exclusions. Assert actual side-effect
counts, original queued timestamps and absent output, not tautological fixtures.

Actual owned router tests include paid body exact1MiB/+1/stalled/chunked/abort/
late-byte/capacity, actual disk terminal/reopen with stable secret, released
retained-output nonexposure, selected receipt reads, and real local root/child
Broker flow with seller-funded ordinary child headers. Existing F7 16KiB and
5s/32-handler regressions remain unchanged and collected. Gateway fixtures must
respect actual F3 verification-object identity; no fake mining/provider-support
claim follows from an offline controlled facilitator/rail response.

Coordinate frozen getter interface first, produce initial meaningful Reds and
pure admission/executor API shape before large implementation, then focused
unit/actual Bun and exact nested strict only. Parent owns full gates, independent
review, publication and commit. F7 source must not be edited before its reviewed
commit; F1 approval remains consumed and no live run is part of this release.

No unresolved policy decision was found in these inputs. The parent must approve
the exact proposed file ownership/legacy auth-header guard and confirm that the
existing EIP child-tree evidence read remains within the intended scope; neither
requires a payment-policy change or F5 schema expansion. Any concrete later
need beyond these named paths is escalated before editing.
