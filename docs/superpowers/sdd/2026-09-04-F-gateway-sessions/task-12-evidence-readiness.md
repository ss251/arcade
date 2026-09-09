> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 evidence readiness and minimal F14 handoff

September 6, 2026. Only this ignored planning note is written. No source, tests,
web changes, Git, full suite, research, network, environment/key access or live
execution occurred. Current instruction forbids new spending. Future harness code
can be built and tested offline after dependency/source release; actual F12 live
execution is NOT RUN / pending, not a failure that activates F13. No owner request
is needed now. F1's approval remains consumed; G/H remain held.

## Read set and corrections to the literal plan

Read full Plan F Task12 (`:2609–2708`) and Task14 (`:2787–2845`), current F1 live
report and `docs/evidence/m6-gateway.md`, full private F8/F9 parent decisions and
F11 funding readiness, actual core SessionReceipt and public receipt/UI paths.
Inspected the existing owned-process/loopback patterns in
`scripts/e2e-erc8004.ts:267–314` and `scripts/e2e-lineage.ts:211–279,315–415`,
the F4 offline boot fixture, Gateway HTTP/rail construction, and the real
usdc-flow-check manifest/entry. Read TypeScript-testing guidance: exercise actual
business behavior and existing Bun/Vitest tooling, not a fake SDK returning PASS.

Task12's shell cannot be copied: it calls the consumed F1 script with a rejected
legacy invocation, deposits again, trusts ambient CALLS/SKILL/PORT, uses fixed
sleeps and shared temporary outputs, greps JSON, may kill PID 0, and confuses transfer
references with batches. The canonical SessionReceipt now requires DISTINCT
Gateway transfer UUIDs for distinct settled calls. Twenty successful Gateway calls
mean exactly twenty references, not one and not refs.length < calls. Do not relax
schema uniqueness or aggregate/deduplicate transfers to satisfy historical copy.

F1 proves one deposit/payment acceptance and exact buyer debit only. Its recipient
was 1000 atomic pendingBatch and zero available, transfer received with no batch
hash. It proves neither twenty session calls, withdrawal nor mined aggregation.
Preserve this historical evidence rather than rewriting it as F12 success.

## Smallest buildable harness

Keep `scripts/e2e-gateway-session.sh` as a tiny no-tracing, strict, dotenv-disabled
launcher into an import-safe `scripts/e2e-gateway-session.ts`. Add focused
`scripts/e2e-gateway-session.bun.test.ts` and only the necessary test fixtures.
Reuse audited bounded process/body helpers if their imports stay inert; do not
invoke the existing live evidence entry points or inherit their role addresses.
Root's existing scripts/**/*.ts inclusion permits strict checking without a new
test stack, dependency or relaxed tsconfig. Parent owns full test/type gates.

Separate three outcomes in both CLI and machine-readable output:

- Help/invalid arguments: no credential, child, database or remote IO.
- Explicit offline harness: `mode: offline`, simulated facilitator, real local
  SDK/router/runner/SQLite behavior, `liveEvidence: NOT_RUN`, `fundsMoved: false`.
- Future live harness: distinct explicit entry with a separately scoped execution
  gate. Under the current instruction it refuses BEFORE credential/network/child
  work with `liveEvidence: NOT_RUN`; neither installed keys nor environment flags
  bypass that gate. Do not expose an implicitly armed default mode.

No invocation of F1, ensureGatewayDeposit, gateway-deposit, withdrawal, faucet,
canary purchase, fee sweep, registration, attestation writer, external AI provider
or seller-funded sub-hire belongs in this harness. F11 is a separate funding
boundary, not a startup dependency. Future live insufficiency refuses, never tops
up. Existing F4 tests cover multi-rail construction; the smallest evidence hub may
use Gateway as its explicit default/session rail to avoid an unnecessary EIP
facilitator role. If dual-default coverage is desired, add a separate offline case
with public dummy roles, not another live funded role or fallback purchase.

Use a single frozen, deterministic, schema-valid nonempty script probe for the
minimal harness: no secrets, provider, network egress, hire capability or subprocess
outside its owned runner job. A dedicated test/evidence manifest and source digest
must identify that scope honestly. Proposed offline fixture price is $0.01,
20 calls and exact $0.20 budget (10000 and 200000 atomic); those values are fixture
policy, NOT live authority. The existing usdc-flow-check costs $0.01 but performs
five external RPC reads per invocation, so it is not intrinsically offline.
If retaining that canonical skill instead, inject only its external RPC boundary,
retain its source hash and label the data simulated; do not silently replace its
implementation while claiming canonical live execution. Freeze one choice before
the future harness implementation, not an arbitrary SKILL/INPUT override.

## Owned local resources and no external escape

The orchestrator creates one owned 0700 directory and exclusive 0600 journal,
SQLite file and bounded evidence outputs. No shared temporary receipt file,
global runner config, user HOME rewrite or pre-existing service/database reuse.
Runner config points only to that directory/skill and captured loopback hub;
maxConcurrency=1 for the twenty-call success sequence. Preserve source secrecy:
only the public manifest crosses the hub handshake, never engine/source/secrets.

Bind hub and any fixture server to literal 127.0.0.1, port 0. Obtain the actual
bound port through a unique bounded child control marker; validate it before use.
The current server omits hostname, so PORT=0 alone is not a loopback guarantee:
reuse the narrow owned-process preload pattern that sets hostname/port/public URL,
without replacing the router or binding a second unsafe listener. Use bounded
readiness polling with child-alive checks, not sleep-and-grep. Decode health and
listing exactly: expected network, built Gateway rail, one exact seller/skill/
version/price/schema and online owned runner. Never attach to a discovered port.

Supply explicit role-isolated child environments and Bun --no-env-file everywhere;
do not spread ambient credentials or enable loader/debug/preload options by
inheritance. Offline mode uses only public dummy signer fixtures and an ephemeral
test-only hub secret supplied to the owned hub. The selected actual SQLite Store
and stable secret must satisfy real-session durability gates; do not swap Store
for memory or mock the F6 facade/session admission merely to make the test pass.
Retain the same generated hub secret in the owning test process if testing a
controlled restart; it is not evidence that arbitrary production keys persist.
No buyer/session/job capability goes into runner or seller subprocess environment.

Offline Gateway coverage should keep actual F2 signer/recovery, F3 Gateway rail,
F6–8 lifecycle/router, F9 SDK and runner broker. Intercept only approved external
RPC/facilitator boundaries in test-only code, with strict finite fixtures. A
simulated facilitator correlates each expected authorization to one unique UUID;
duplicate send attempts and unknown methods/origins fail the test. Permit real
HTTP/WebSocket only to owned loopback surfaces, and fail/count all other outbound
attempts, including redirect/preconnect/provider paths. No copied RailTest result
may masquerade as GatewayLive evidence. A separate genuine RailTest case retains
its `test` reference kind and is labeled accordingly.

Clear canary and all optional paid/attestation writer credentials. Do not send a
splitter/agent claim in the probe's handshake that triggers unrelated contract or
registry work. Any unavoidable boot read in offline mode gets a bounded fixture,
never real RPC or a weakened session authority check. Assert exact external
mutation counts; a successful child exit alone does not prove no extra work.

## Exactly twenty operations with write-ahead evidence

Capture immutable run ID, mode, buyer/seller, network/rail, source/manifest hashes,
price P, count 20, budget B=20*P, hub origin, time/response bounds and private storage
identity before opening. IDs/amounts are canonical and bounded, with bigint money.
No CALLS override, cap rounding, implicit fee allowance or additional test purchase
in the live success path. Capability-negative/replay/budget-overflow cases belong
in independent offline tests, not a twenty-first live probe.

Exclusively claim the private journal before session creation; fsync public intent
facts before each mutation/signature boundary, and retain uncertainty before send.
F1's journal mechanics are useful but its fixed event whitelist/amounts are not
the session journal schema. Use a separate bounded versioned schema; corruption,
partial writes, claim or sync failure stop subsequent work. Never delete/rename
the journal to rerun a consumed attempt, auto-resume it, or create a replacement
session because the opening response was lost.

One session open, then exactly twenty sequential explicit session.call operations,
then at most one close after twenty validated terminal successes. Claim each call
index before await. A frozen signer wrapper can fsync index/nonce/authority digest
before exposing its sole signature; a bounded captured fetch wrapper can fsync
paid-request intent before forwarding the one signed retry. Do not record actual
signature/payment header/body or capability. Preserve F9's own one-shot operation
latch; rerunning the Effect or receiving a second 402 is not another authorization.
The hub's durable begin gate precedes its actual settlement attempt; maintain exact
VerifiedPayment identity through verify/settle rather than rebuilding it for audit.

For each index, require expected valid output and matching job, seller/buyer,
session/rail/network/price, locally authorized amount and persisted terminal receipt.
Record only safe correlation facts and output digest, not arbitrary runner text.
Status must conserve budget/spent/held; no next call after held uncertainty or a
failed outcome. The paid probe, single signed retry and EVERY result poll carry
both session headers; polling also carries the distinct job-token header to a
query-free validated same-origin job path. Any actual-input quote uses the same
session context, with no public-rail/catalog fallback. No redirects or hire
lineage. Probe/quote/read counts are not job or settlement counts.

Offline fixture instrumentation asserts exactly twenty signatures, twenty paid
submissions, twenty runner executions, twenty begin/settle attempts and twenty
distinct persisted roots. Do not infer these counts solely from the final summary.
For future real evidence, state what is actually observable from journal/SDK/Store
and correlated facilitator readback; do not claim inaccessible internal Circle
send counts. No mutation retry can be used to fill a missing success slot.

## Closed artifact and independent evidence checks

Decode close through the frozen F9/core closed-artifact contract, not JSON.parse
plus three counters. Require matching session/buyer/rail/network/budget, persisted
opened/closed times, complete=true, heldAtomic=0, spentAtomic=B, settledCalls=20,
exactly twenty unique job IDs, each price P and settled, and no released/pending
call. Gateway calls require gateway-transfer and canonical distinct UUIDs;
settlementRefs must equal that same twenty-element unique set. Order is not a
batch boundary. Missing/extra rows, reused UUID, mismatched sums/time/bindings or
legacy tree fields are failure, not normalization opportunities.

F8 Gateway session receipts allocate the full price to seller, fee/feeBps zero,
omit feeAccrualId and all children/tree fields, while retaining mandatory root
lineage. Validate those actual receipts separately: SessionReceipt summary does
not carry every seller/fee/nonce field. The harness is deliberately childless;
complete is not graph-wide finality or refund of already settled child purchases.

After owned work is stopped/reaped, read only the isolated persisted session,
selected call membership, jobs and terminal receipts, bounded to 21 rows to detect
extras. Prefer frozen selected Store read APIs or a read-only SQLite connection
with actual sessionParse/core decoding; never open a mutating bootstrap/reaper as
an alleged independent read. Correlate to all twenty journal operations and the
returned artifact. A controlled offline reopen test can prove persistence, but
must not silently restart a live uncertain settlement or resend anything.

Future live readback would correlate each facilitator UUID to exact payer/payee,
amount, network, token and authorization nonce, plus properly separated buyer and
seller available/pending balances. A transfer UUID/status or API-reported batch
hash is not canonical mined evidence. Independently verified batch transaction
receipts/events and a transfer-to-batch mapping, if later available, belong in a
separate read-only evidence layer. Their count may be one, several or unproven;
no assertion requires fewer batch hashes than calls, and SessionReceipt references
remain the original per-call UUIDs. No waitForTransactionReceipt or unbounded poll.

## Failure, capability and process cleanup

F8 reserved/settling 202 is bounded pending; fixed settlement-uncertain 503 requires
reconciliation and no next call/output/fabricated receipt. The exact run is
INCOMPLETE, with observed completed count, not a twenty-call PASS. A lost/invalid
close retains its token and blocks calls; only bounded authenticated status reads
may recover/validate closed_receipt. Do not retry close/open, redeposit, switch
rails or announce a no-charge outcome. A fully decoded pending 409 is not closure.

Keep tokens only in the SDK closure and job-capability memory, out of command
arguments, URLs, child logs, SQLite/public evidence and the safe journal. Successful
validated close permits releasing references during cleanup; JavaScript reference
release is not guaranteed secure memory erasure. On failure, retain capability
until bounded in-process read-only recovery completes/exhausts. After process exit,
do not claim HTTP recovery remains available unless a separately reviewed private
capability-storage policy exists. The token-free journal and isolated DB still
support local read-only accounting review; do not reconstruct a token from data.
Cleanup must not close a session in finally or erase unresolved durable evidence.

Track actual child handles, not loose PIDs or port matches. Terminate owned buyer,
runner/jobs and hub in safe reverse order; await confirmed close, TERM then bounded
KILL if necessary. Never kill 0/-1 or unowned processes. Child/job parent-death and
hard-deadline guards cover the case where the orchestrator is killed; verify worker
descendants and listeners cannot outlive the owned scope. Abort all polls, remove
signal handlers/timers, drain/close journal and SQLite, and check listener/resource
cleanup. PASS prints only AFTER cleanup succeeds; cleanup failure remains failure.
Retain private run journal/database/checkpoints for uncertain/live runs. Tests may
remove only their explicitly owned disposable fixture directories after assertions,
never a historical journal or shared path. Raw child stderr is discarded, not
publicly dumped when readiness fails; parse only bounded whitelisted control data.

## High-value offline tests and current completion boundary

Use existing Bun integration tests and Vitest pure helpers, dummy signers and
owned local resources. No test imports should boot the server outside its child.
Genuine failure-first cases should cover:

- Live mode denied before IO; no args/help/malformed args; inherited credential/
  loader/canary sentinels; attempts to invoke F1/fund/faucet/withdraw all rejected.
- Actual twenty-call Gateway fixture through real router/SDK/runner/SQLite with
  signature recovery and exact operation counts; no memory-Store substitution.
- Foreign origin/redirect, missing either session header on probe/retry/poll,
  wrong job/session token, duplicate or twenty-first authorization, changed payer/
  rail/price/source and insufficient budget; failure before unintended signature.
- Duplicate transfer UUID, nineteen/twenty-one rows, altered money/time/fee/lineage,
  fabricated terminal receipt and missing persisted evidence rejected independently.
- Journal failure before open/sign/send, lost acceptance/settlement/close response,
  202 deadline, uncertain 503, read-only closed_receipt recovery and zero mutation
  retries; pending/uncertain state remains held across controlled storage reopen.
- Partial startup/runner exit, stalled body, cancellation, SIGTERM-resistant child,
  parent death, leaked listener, cleanup failure and safe journal retention.
- No token/session identifier/private locator in public summary or UI; no arbitrary
  provider/runner output in errors; no hidden external network, funding or canary.

Dependencies are the reviewed/frozen F7–9 APIs and F8 result shape. F11's withdrawal
gaps do not block funding-independent offline harness work. Live execution remains
NOT RUN under the current no-new-spending instruction, even if all offline tests
pass. No tests or harness code were written/run for this readiness.

## Minimal F14 UI/docs handoff, separately owned

Current `apps/hub/src/ui.ts:185–213` links every present settleTx; the legacy result
route/publicReceipt do likewise. Core explorerTxUrl currently concatenates the
selected default explorer, so checking only `kind !== gateway-batch` is inadequate.
Use one narrow settlement-evidence link policy: settled EIP-3009 receipt, canonical
nonzero 32-byte hash, permitted onchain/validated legacy kind and known agreeing
receipt network. Derive explorer from that network, not ambient current selection.
Unknown/mismatched network/kind and all Gateway/Test references remain unlinked,
even if their text looks like a hash. Gateway UUID chip says transfer accepted;
Test says simulated. A legacy gateway-batch field is not independent mining proof.
Keep registry-registration links and other non-settlement artifacts separate.

The public feed's current rest-spread still includes sessionId until F7's mandated
correction lands. Derive a boolean session marker from private trusted receipt
association while stripping sessionId, buyer, job/root/parent IDs, nonce and all
capabilities. Emit no ID in text, href, data attributes, hidden JSON or nested
children. Do not reintroduce the private field to make a badge work. F7 owns its
privacy fix; F14 consumes the approved public boolean and adds only presentation.
Private authenticated full SessionReceipt is distinct from this public marker.

Mixed rails invalidate a page-wide "every row is a real on-chain transaction"
claim based on default rail. Test minimal mixed EIP/Gateway/Test rows, malicious
reference HTML, missing/incorrect network and session-ID sentinels using actual
Receipt fixtures, not the plan's as-never cast. Preserve direct EIP links and
existing escaped output; do not broaden into a web redesign. Review any ordinary
"not settled/$0 charged" copy separately where issued uncertainty can exist;
session-uncertain has no terminal public row and cannot fabricate that conclusion.

README, architecture, buyer-guide and sessions docs should show the actual frozen
SDK/MCP/CLI APIs, local ceiling versus funds, explicit F11 funding, header-only
private session access, held uncertainty and read-only close recovery. State
"offline harness available; live twenty-call evidence NOT RUN" until it actually
runs. F1's dated one-payment proof remains linked at its real scope. No twenty-
calls-one-settlement headline, automatic-batch guarantee, seller-available credit,
zero-total-gas claim or operational-mainnet implication. Batch readback and any
withdrawal proof get separate dated statuses; no owner prompt is needed now.
