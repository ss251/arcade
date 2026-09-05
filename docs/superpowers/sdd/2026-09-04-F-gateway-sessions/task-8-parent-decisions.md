> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 parent integration decisions — September 6, 2026

Parent read full Task8, current paid/result router, pipeline, F3 Gateway/EIP/Test,
F5 ledger/Store and D constraints, and the complete task8-integration-readiness.md.
Source release remains after F6/F7 reviewed commits. Adopt its smallest explicit
session-only branch; preserve the ordinary sessionless pipeline and A/C/D/E paths.

## Actual payment and child evidence

Gateway and Test session payments allocate the full price to seller, zero fee and
zero feeBps. EIP session direct-to-seller does the same. EIP routed through a
per-listing splitter may allocate the configured fee only when splitterVerified
is true, actual verified.payTo/requirements identify that exact splitter, and
feeBps is valid. A present but unverified splitter on an EIP session is a fixed
pre-challenge/admission refusal, not a guessed fee or silently different payee.
No new paid-path RPC read is required. This tightens only the new session path.
No session receipt gets feeAccrualId: legacy sweep explicitly excludes them.

Keep F5's receipt schema frozen: root session terminal artifacts omit children,
treeHash, treeCeilingAtomic and treeCommittedAtomic, even empty values. Preserve
mandatory root lineage and separate seller-funded sessionless child A ledger/
receipts through existing mayHire/hireCapability paths. Never forward session
ID/token to runner or children. Preserve an actually available EIP V2 SettleTree
argument where applicable, without pretending the session artifact contains its
proof. Complete describes only admitted session roots, not graph-wide finality
or refund of a seller's settled children. No dual-ledger atomicity claim.

Only EIP session terminal evidence may reach the existing hash-only D service,
after atomic terminal persistence and under existing owner/chain checks. Use
actual verified.payTo; preserve bounded best-effort enqueue. Gateway/Test skip D;
uncertain has no terminal artifact and cannot enqueue a fabricated failure.

## Admission and settlement boundary

Preserve the EXACT VerifiedPayment object from verify through settle (Gateway's
WeakMap identity is meaningful). Snapshot own-data binding/Job/outcome separately.
Retain queued createdAtMs exactly; never run legacy putJob/putReceipt on these IDs.
Bind exact payer, amount, nonce, time, asset/domain/network/payTo, skill/version,
request digest and root lineage. Same-authorization created:false returns the
original handle with no dispatch; do not bypass live rail verification to promise
all expired/mined replays will succeed. No new automatic retry.

Before admission validate room for the minimal fixed released terminal as well as
the queued Job. Before one-shot begin validate the full accepted outcome/receipt
and worst-case allowed reference/timestamp size. Any sizing placeholder stays
strictly local and is never stored, logged or passed to finish. Malformed output
may become the fixed prevalidated released terminal before begin; after begin,
all ambiguity remains held. Do not clone a rail result into stronger evidence.
No false no-charge claim, output or downstream evidence precedes atomic finish.

## Bounded private result reads

Approve SessionStore.getSessionReceipt(sessionId,jobId) as a narrow F8 addition
through existing sessionStoreApi and selected validated SQLite read transaction.
Canonical IDs and selected call membership are required. Return defensive copies
of the actual persisted receipt only; pending may return undefined, while missing
terminal evidence is corruption. No table/migration, global allReceipts scan,
new cache or receipt synthesized from Job/SessionCall. Include focused memory,
disk, two-handle/reopen, cross-session, corruption/copy and query-bound tests.

New session result requests need both canonical session headers plus the job
token. Authenticate before session IO, then prove selected snapshot membership.
Reserved/settling returns bounded 202 pending without output/receipt. Uncertain
returns private,no-store 503 with fixed error session_settlement_uncertain and
settlement_status uncertain, no arbitrary diagnostic or fabricated receipt.
F9 must recognize this as reconciliation-required, not resubmit or reinterpret it
as nonpayment. Corrupt/unavailable is fixed 503 session_unavailable. Only persisted
correlated settled receipts release output; definite releases return null output
and fixed local refusal. EIP-only valid hash/network links; Gateway/Test unlinked.
Ordinary headerless no-receipt polling remains its existing pending behavior.

F7's optional closed_receipt recovery field comes from the same authoritative
closed snapshot. Client recovery is read-only, never another close/open/deposit.
F1 consumed; no new live payment, withdrawal, credential, deployment or push.

## Distinct session job capability realm (parent accepted, September 6)

Accept the independently prepared task8-capability-review. Existing ordinary
/jobs/:id and headerless result routes accept ordinary job capabilities, and a
legally released Job may retain output. Therefore the new session issuer MUST NOT
mint or return ordinary arcade-job tokens. Use the first 32 lowercase hex digits
of HMAC-SHA256(hubSecret, "arcade-session-job:" + sessionId + ":" + jobId), with
canonical session/job IDs and the same stable configured secret. Mint only for
the authoritative original reserve job, including semantic duplicate admission.

The 202 handle has an opaque job_token and exact-origin, token-free result URL.
Dispatch result requests by presence of EITHER session header, never truthiness;
require BOTH canonical session headers and HEADER x-job-token, validate both HMACs
before any Store access, and refuse a token query parameter. Then prove snapshot
membership and retrieve actual persisted terminal evidence through the approved
bounded getter. No ordinary fallback, query-token fallback, global Job lookup,
new ownership table/cache, or dual-realm acceptance. Released retained output and
diagnostics remain inaccessible on this path.

The existing /jobs/:id route gains no session feature: any session header presence
returns fixed private/no-store 404 before IO. Without those headers the distinct
session-job token fails ordinary header/query authentication on BOTH legacy job
endpoints before their Store reads. Preserve unrelated ordinary compatibility.
Seller-funded hire capabilities remain separate and do not inherit this session.

F9 must implement the three-header session poll contract: current ordinary
callSkill ignores job_token and relies on poll_url, so it is not already compatible.
Later H receipt-tree endpoints must likewise not accept the new session-job realm.
Do not rotate secrets or claim retroactive revocation of hypothetical externally
issued ordinary tokens. This checkout has no earlier F8 issuer to migrate.

## Paid transport boundary for the new session-only branch

F7's 16 KiB reader covers open/close, not legacy req.text() paid inputs. Approve
a bounded reader for the new session paid branch: at most 1 MiB raw UTF-8 JSON,
one five-second monotonic deadline, abort/late-read refusal and at most 32 active
session-paid HTTP handlers. Release transport capacity after the response; it is
not a job, budget, settlement or execution ledger. Canonical path/method and both
session capabilities are checked before body/capacity or Store IO. Reject a hire
capability on a session-root request before challenge or admission. No change to
ordinary paid input limits or behavior is bundled into this task.

The raw byte limit does not replace exact F5 queued/terminal serialization and
pre-admission release headroom checks. Keep the bound on actual bytes without
Number money coercion, strict UTF-8/JSON, whole-body rather than per-chunk timing,
empty-chunk retention avoidance and cancellation that cannot mutate later. Reuse
or extract F7's reviewed transport helper only through a narrow trusted internal
limit argument; keep its default open/close limits and existing regressions intact.
All new session-aware refusal/probe/accepted/result responses are private,no-store.
No new source implementation is released by this preparation note before F7 commit.

An issued pipeline Effect must also claim its own single execution attempt before
dispatch, outside repeated Effect evaluation. Re-running that same Effect may not
execute the runner or its seller-funded children again before the settlement
barrier. This process-local attempt latch is not durable accounting or a restart
resumer; reserve(created:false) still never dispatches and the durable F5 barrier
still independently decides whether settlement may be attempted. No boot replay.

## Observed splitter fee provenance

Current ListingRecord persists splitterVerified/version, but not the observed
feeBps; a later boot can configure a different FEE_BPS while reading that old row.
Do not infer an exact session payout from that flag plus current environment.
Approve optional splitterFeeBps and splitterNetwork fields in ListingRecord,
stamped only from the successful existing handshake contract read and selected
chain. No paid-path RPC, new table, migration or global cache. The getter author
owns the two store.ts type declarations; paid-route author owns handshake stamping
and consumption. Existing ordinary receipt behavior is unchanged.

For a new EIP session using a splitter, require verified true, valid observed
integer fee0..10000, observed network matching the session's pinned network,
canonical exact splitter payTo and known observed version. Use that observed
fee value, not current FEE_BPS. Legacy rows missing either observed coordinate
refuse before challenge/admission on this session path; a normal successful
runner handshake can populate them. Gateway/Test/direct EIP retain their already
approved full-seller/zero-local-fee policy. These observations are handshake facts,
not a fresh per-call RPC attestation or defense against a compromised Store.

## Accepted source split and response integration

Parent fully read task8-source-handoff. Approve its nine paid-router/pipeline
paths and separate getter ownership, leaving legacy pipeline.ts byte-unchanged.
The observed splitterFeeBps/network decision above supersedes that report's
earlier configured-fee wording. New private no-store headers on the two ordinary
job-auth refusal branches are the narrow required capability privacy change;
valid ordinary responses/token compatibility stay unchanged.

Approve the existing A tree-evidence read only when an eligible EIP V2 session
root actually has seller-funded children. It may retain the existing legacy
allReceipts assembly for that separate tree; never use it for session polls or
claim it is indexed/bounded selected-session lookup. Require actual correlated
child receipt evidence, not inferred settlement from committed A rows. No new
arbitrary-child getter, global cache, tree-schema change or dual-ledger guarantee.

The proposed non-long-polling result shapes are accepted: reserved/settling202
{job_id,status:"pending"}; uncertain503 fixed error/status above; released200
with actual receipt, null result and fixed local refusal; settled200 with the
actual correlated receipt and validated intended output. F9 must use its elapsed
overall polling deadline and strict phase decoders, not the legacy120-second
long-poll timing or automatic uncertain retry. Exact final settled/released wire
field names must be frozen and handed off with F8 before F9 source release.

## Implementation split and early genuine corrections

After F7 commit61fe5ca, the getter's four files froze and entered independent
review. To parallelize the remaining existing scope, G14 handed its first drafts
of pipeline-sessions.ts and session-pipeline.test.ts exclusively to B9 after
stopping edits and completing focused run90309. G14 retains the other seven paid
paths, including pure session-call.ts, router/wiring and actual HTTP/root-child
integration. No total source-scope expansion. B9's four getter files remain frozen
during their independent review; parent owns combined gate/publication/commit.

Parent identified and author actually reproduced two draft failures at01:50:35
IST: actual TestRail mixed-case payer admitted but could not finish against F5's
canonical buyer, and an oversized escaped object key reached JSON encoding before
the intended early bound. The latter was not accepted oversized input; its
instrumentation proves allocation-order behavior. Retain both failures distinctly.

Approve full semantic EVM address canonicalization before selected rail.verify,
including requirements/payTo/extra splitter or verifying-contract and payload
accepted/auth address coordinates consistently. Preserve signature bytes and
prove actual EIP typed-data recovery is unchanged. Normalizing auth.to alone is
unsafe because EIP settlement compares extra.feeSplitter to its target literally.
Keep exact original VerifiedPayment identity after verify, and refuse a verifier
result that is noncanonical before admission rather than knowingly stranding a
valid mixed-case result after payment. No F5/payment-layer schema broadening.

The pure own-data walker must also count/bound object-key bytes before assigning
or encoding them, alongside value/depth/node bounds. Final canonical serialized
limits remain independently enforced. The pipeline single-owner attempt guard
must reject repeated evaluations outside that owner's cleanup: a duplicate may
not mark an active owner's settlement uncertain or mutate/release its state.

## Getter review acceptance and evidence scope

Parent read the frozen independent getter review at SHA-256
4fc1a85360de041914d657fcb912ca03fda59b6e4ff2a3db8cd0a1c94fa41413.
The four-file slice is CLEAN: 87 focused Vitest, 12 native SQLite Bun /54 assertions,
exact four-root strict0 and all14 foundation checks (12 direct, two reconstructed
by removing only approved additions). This does not accept the remaining router
or pipeline. Carry the review's narrower accessor claim into public documentation:
the tested stored reason accessor is refused without invocation, but unchanged
memory validation indexes receipt.jobId; no general hostile in-process getter/
Proxy sandbox is proved. JSON-backed SQLite cannot store such JS accessors.
Existing selected-session loading is bounded four-SELECT evidence, not a physical
one-row getter. The original author report remains historical and unchanged.

## Same-read terminal authority correction

Parent source review and G14's genuine actual memory Ref regression show that a
separately validated receipt followed by global getJob can deliver changed output
outside the selected read's digest authority. SQLite revalidates its global Job
read and is not claimed vulnerable to that same demonstrated memory race.
Approve additive getSessionTerminal(sessionId,jobId) returning a defensive actual
{job,receipt} pair from one selected validated read; retain getSessionReceipt as
its compatibility projection. Root owns the same four getter files for this
correction; B9 independently reviews them after freeze. G14 consumes only the
pair on result routes, no global getJob. No table/schema/SQL/kernel/F6 change.
Post-read mutation must not alter the already validated returned pair; the next
read detects the corrupt state. No latest-after-read or general hostile-server
guarantee is implied. Original reports/hashes stay historical.

Preserve C's trusted canary classification in the new path: only a selected
verified payer matching the configured canary yields prepared canary:true and
terminal canary:true. No claimed payer/header shortcut or credential propagation.
G14 owns this minimal pure/router change and informs G3 of the new frozen hashes.

Parent read the complete independent bundle review at
ebc35a86e2bedc218a872abad7e6bf343d29e8f012a186f4330ff0e3807b4062:
CLEAN94focused/14nativeSQLite68/exact4strict0, all seven pins and exact original
test reconstructions match. Pure baseline plus canary delta reviewed independently
by G3 at63d8b90ace27ae6573f5c5fd3afbab240281cd0eeac010d685c6e7f9e6a2ff02,
23admission/21routerdeliberatelyskipped/exact2strict0 plus separate20assertions.
Parent independently read executor/all48tests/report and passed79focused/exact2
strict0 with both hashes matching. These slice acceptances do not replace full
router review or the combined repository gate. Original historical reports remain.
