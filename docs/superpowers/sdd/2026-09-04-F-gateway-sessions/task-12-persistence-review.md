> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 independent persistence checklist — September 6, 2026

Read-only preparation, not a runtime verdict. Read the complete source handoff,
parent decisions, evidence readiness and runner-seam check, plus actual SQLite,
ledger, F9 closed/result decoding and core Job/Receipt/Session contracts. No test,
database opening, child, signing, network, key, Git or full suite was run. Only
this ignored note was written. TypeScript-testing guidance kept persistence,
execution and external-counter evidence distinct. Live evidence remains NOT RUN.

## Smallest bounded read

After confirmed shutdown/reaping of every owned writer, open the captured existing
owned DB with `new Database(path, { readonly: true, strict: true })`, in try/finally
with an awaited/checked reader close before PASS. Bun's installed sqlite.d.ts:30–50
defines readonly as no write/no create. Do not import/call openSqliteStore:
store-sqlite.ts:167–174 creates schema and changes PRAGMAs; :188–209 reaps legacy
jobs. Do not checkpoint, remove WAL/SHM, restart a hub or repair evidence here.

For this fresh isolated one-session database, use global reads, not selected-only
joins that can hide orphan or unrelated extra rows. Each query returns at most21
rows; the header needs only2. Enumerate fixed columns, not arbitrary SQL input:

```sql
SELECT id,buyer,budget_atomic,spent_atomic,rail,network,opened_at_ms,
       closed_at_ms,call_count,held_atomic,json FROM sessions ORDER BY id LIMIT 2;
SELECT job_id,session_id,authorization_key,state,amount_atomic,created_at_ms,
       settlement_key,json FROM session_calls ORDER BY job_id LIMIT 21;
SELECT id,status,boot_id,created_at_ms,json FROM jobs ORDER BY id LIMIT 21;
SELECT job_id,accrual_id,created_at_ms,json FROM receipts ORDER BY job_id LIMIT 21;
```

Require exactly1/20/20/20 before constructing Maps. Check unique keys and exact
equal job-ID sets across all three20-row sets, the20 frozen journal operations
and the closed artifact. All memberships must name the one captured session.
The LIMIT21 sentinel detects any extras;19 fails; never truncate/deduplicate to20.
For the already required childless/no-canary/no-writer topology, fixed
`SELECT 1 FROM tree_reservations LIMIT 1` and equivalent pay_tests/erc8004_docs/ratings
queries must return no row. These are supplementary side-effect absence checks,
not new product features. No unbounded COUNT/SUM or global Store enumeration needed.

## Exact decoding and column agreement

Actual table definitions: apps/hub/src/store-sqlite.ts:53–105. Column/JSON
agreement reference: :143–163 and :323–346. Session JSON is NOT F9 wire JSON:
use session-ledger.ts:56–69 `sessionParse`, which rejects noncanonical tagged
bigints/keys/bytes. Limits are16,384 for header/call and1,048,576 for job/receipt.
Then strict `Schema.decodeUnknownSync(...,{onExcessProperty:"error"})` for core
Session/Job/Receipt; capture the call as unknown until the ledger validator passes.
Never use permissive legacy fromJson or monetary Number/SQL numeric coercion.

- Header envelope keys are exactly `session,callCount,heldAtomic`. Every scalar
  column must equal its decoded counterpart, including canonical amount strings
  via bigint.toString, null-vs-defined close time, and call_count20/held_atomic"0".
- Call columns equal binding.jobId/sessionId/amountAtomic, call.state/createdAtMs.
  authorization_key equals JSON.stringify([network,domainName,domainVersion,
  verifyingContract,buyer,nonce]); settlement_key equals
  JSON.stringify([network,rail,settleRef]) for these settled calls.
- Job columns equal decoded id/status/createdAtMs. boot_id is writer provenance,
  not a receipt field or a cryptographic process identity; compare only if captured
  independently, rather than inventing a value from a timestamp.
- Receipt columns equal jobId/createdAtMs and `(feeAccrualId ?? null)`; F12 requires
  accrual_id null and feeAccrualId absent, not just matching arbitrary values.

Build exactly bounded SessionLedgerState and call `validateSessionLedger`
(session-ledger.ts:165–223) for canonical bindings, current terminal digests,
authorization/reference uniqueness, monetary conservation and job/receipt links.
That shared production validator is useful but NOT sufficient independently:
it does not reject unrelated orphan jobs by itself, require an optional receipt
nonce, recompute a settled call's queuedDigest, or prove fixture output correctness.
Keep the global row-set checks and the following explicit F12 comparisons.

## Required20-call correlation

For each journal index0–19, match one job, one binding, one receipt and one closed
call by job ID, not incidental SQL/receipt order. Require all20 nonzero canonical
nonce values unique and identical to the signer/facilitator observation for that
index. Bind buyer/seller, skillId/version, gateway/eip155:5042002, token, Gateway
Wallet verifying contract, GatewayWalletBatched/version1, payTo=seller, actual
validAfter/validBefore and10000n amount to captured authority and signature facts.
No valid-looking but independently unbound nonce or UUID is sufficient.

`Job` (core/job.ts:58–73) has NO sessionId/nonce/version/rail/network fields:
these come from session_calls.binding (session-ledger.ts:88–104) and Receipt
(core/receipt.ts:35–96). Require receipt.authorizationNonce explicitly present
and equal, despite its broader schema being optional. Root lineage on both job
and receipt is rootJobId=jobId, hop0, ancestors[], with parentJobId absent.
Require no children/treeHash/treeCeilingAtomic/treeCommittedAtomic/receiptSignature,
feeAccrualId/feeSweepTx/canary; Gateway sellerAtomic10000n, feeAtomic0n, feeBps0,
settled=true, reason=ok, kind=gateway-transfer. All20 settleTx UUIDs must be
canonical/distinct and match call refs and independently observed facilitator map.

Require job.status=outcome.status=succeeded, expected exact nonempty schema-valid
output and no refusal. Compute input digest using `sessionRequestDigest(input)`:
0x-prefixed SHA256 of canonical sessionJson at1MB (ledger:70–71), equal to binding
requestDigest AND independently captured expected input. Compute output digest
with the same declared canonical algorithm; match expected output, buyer-returned
output and runner observation, not only the terminal receipt summary.
Recompute terminalJobDigest/receiptDigest via that same canonical1MB encoding;
reconstruct original queued job by omitting outcome and setting status queued,
then compare queuedDigest too. Do not hash ordinary JSON.stringify as a substitute.

Require call.createdAtMs=job.createdAtMs; receipt.latencyMs=receipt.createdAtMs minus
job.createdAtMs; opened <= job.created <= outcome.started <= outcome.finished <=
receipt.created <= persisted closed time, all safe nonnegative integers. These
match actual session-call.ts:131–137,164–170 and ledger close:293–299.

Decode returned F9 close using `decodeSessionClosed` (buyer/session-wire.ts:111–119)
and core SessionReceipt (core/session.ts:30–47), then independently require closed
persisted identity/times, budget=spent200000n, held0, complete=true, settledCalls20,
exact20 all-settled10000n calls, no released/held row and identical20 UUID set.
Compare every closed-call field to persisted binding/state/time/ref, not just sums.
Object key order is not identity; call/ref sequence follows F9's stable fingerprint
(buyer/session.ts:118–124). Cross-source set matching must not be confused with a
batch count or permit a changed close artifact during recovery.

## Evidence boundary / implementation handoff

SQLite stores input/output and correlation digests, NOT source or manifest hashes,
runner ID or actual process-launch/exit counters. Retain manifest, original probe
and guarded executable hashes in the independent journal/runner evidence; bind the
expected output function to those hashes. SQLite boot_id cannot replace those.
Twenty rows prove durable correlated records only; they do not prove twenty real
execSkill executions/signatures/begin/settle/provider submissions. Keep those
independent exact counters and descendant/listener cleanup evidence separate.
No mined batch, credit availability, funds movement or source-attestation claim.
The checklist fits the released orchestrator path without changing Store/core.

Read SHA256 inventory: handoff d68c0a724bf1f2e8d8f0566475a396269f2b7ee6fa94bbc8aaec417795dc3e2b;
decisions05484ffc8cdb68926e5fd5f5afd3b88f7d35fa27ce21c87f57aec4f7315e2b6b;
readiness22bcb235d527bf1d88500d9947bf3ba5398e963f8a77bd9f43c7aa5326202561;
runner-seam207cb60229c9f391a6f721923b2a744fff9383fd39e2d6a26e40239eb7c69894;
store-sqlite97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a;
ledger9eddd13eb1d8a5462aac3a905cb2fef05d14509407fc22b9e7859a7109a66b32;
wire ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef.
