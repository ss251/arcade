> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 integration readiness — session roots, actual rail semantics

September 6, 2026 (Asia/Kolkata). Readiness only; no source/tests, full suites,
Git, dependencies, network, key or live actions. Fully read task7-parent-decisions,
literal F8, current pipeline/server, F3 Gateway/HTTP, F5 terminal checks, D attester
and core documents, relevant EIP/Test settlement and seller hire-broker contracts.
F6 independent review takes priority when its author freezes. F7 parent limits
and dual-header privacy decisions are approved; this note does not expand them.

## Actual contradictions and approved smallest handling

| Actual source fact | Session-only handling |
| --- | --- |
| gateway.ts challenge uses input.payTo (seller), ignores feeSplitter; settlement accepts full amount/UUID | Parent APPROVED sellerAtomic=priceAtomic, feeAtomic=0, feeBps=0, omit feeAccrualId; no splitter payout, mined batch or withdrawable-credit claim |
| pipeline.ts always splitFee(...500), stamps accrual, then discards settlementKind | Do not reuse this finish unchanged; keep full actual rail result for atomic session finish and label its actual category |
| F5 receiptMatches rejects all children/treeHash/treeCeilingAtomic/treeCommittedAtomic, including empty children | Parent APPROVED omit those fields on session root artifacts; preserve mandatory rootJobId=jobId, hop=0, ancestors=[]; no F5 schema extension |
| F5 pending Job must match original queued digest/time and have no outcome | Never reset createdAtMs to pipeline startedAtMs, write running/terminal through legacy APIs, or store output while uncertain |
| D processOne/buildValidationRequest/buildFeedback require a 32-byte settlement hash | Recommend no Gateway-session attestation enqueue; never convert UUID to hash or publish response=100 as mined payment proof |
| Current result endpoint treats any terminal receipt as finished and maps an unsettle to generic no-charge copy | Add selected session-aware status handling; no fabricated terminal receipt on ambiguity, no output before atomic accepted finish |

References: packages/payments/src/gateway.ts challenge/verify/settle;
apps/hub/src/pipeline.ts finish and settlement section;
apps/hub/src/session-ledger.ts jobMatches, receiptMatches, transition;
apps/hub/src/attest.ts processOne; packages/core/src/erc8004.ts document builders;
apps/hub/src/server.ts paid and /jobs/:id/result branches.

Gateway context: an accepted transfer is correlated by F3 to its frozen verified
object, payer, amount, network and UUID. F3 already bounds the request and refuses
redirect/retry. It does not show merchant available balance, batch inclusion or
an ERC-20 splitter payout. Fee=0 here is the actual local session receipt policy,
not evidence that Circle has no external service charges. Sessionless behavior
and existing F4 discovery stay unchanged by this bounded F8 release.

Two additional allocation decisions remain for parent, rather than silently generalizing
the approved Gateway change: actual EIP without splitter and actual TestRail also
transfer full price to their payee. Recommend full seller/zero fee for those new
session branches; for EIP with a verified per-listing splitter, preserve its
validated feeBps and split only when the exact verified payTo/extra identify that
splitter. F5 deliberately excludes ALL session receipts from legacy sweep backfill;
parent now APPROVED no accrual marker on any session receipt, including EIP. Do
not promise a later feeSweepTx either. A per-call
splitter fee and a later accrual sweep are different mechanisms. Invalid fee
configuration is refused before execution/settlement, not repaired by arithmetic.

## One narrow session execution branch, not best-effort bookkeeping

Keep the ordinary runJob path unchanged. An explicit internal session context can
carry the immutable admission Job and binding plus F6 service; preserve RunJobArgs
rail and the existing lineage/canary/attest seams. Never accept this context from
runner JSON. The server selects the exact built rail and creates the context only
after F7 auth and actual payment verification. Gateway must receive the EXACT
VerifiedPayment object returned by verify: F3 uses WeakMap identity, so deep-cloning
that object before settle would falsely fail AFTER the durable barrier. Its own
data is already frozen. Snapshot binding/Job/outcome data separately.

Admission checks include verified amount == listing price == authorization.value,
buyer == recovered payer/from, expected payTo, selected network/asset/domain,
nonce and time bounds, listing seller/version, request digest, and root lineage.
EIP/Test verify currently accept value >= required and EIP returns network from
payload.accepted; F8 must enforce its stricter exact immutable session binding
before admission. Do not infer trust from merely passing the existing broad wire
Schema. Signature/token must not be persisted in the new ledger or sent to runner.

reserveSessionJob atomically stores queued Job + held amount + nonce claim. Its
created:false result means return the original handle WITHOUT a new dispatch.
Current rail verification may refuse a mined/expired authorization on a later
retry; do not claim every post-settlement replay can return that handle unless the
actual endpoint proves it. A safe refusal still does not permit another spend.
No new binding lookup or bypass of signature validation is proposed here.

### Predictable terminal validation before the one-shot barrier

Parent APPROVED exact VerifiedPayment identity, immutable admission time,
pre-admission minimal refusal-size allowance and pre-barrier full accepted sizing.

1. Before admission, use the actual immutable input/queued Job to construct and
   validate a MINIMAL fixed released terminal candidate too. Queued JSON near
   F5's 1 MiB limit can otherwise fit while any added outcome exceeds it, stranding
   a reserved hold even on an ordinary safe refusal. Reject before admission if
   this candidate cannot fit. A session-only bounded raw body reader is a separate
   source-scope decision: current req.text() is not bounded. Do not claim F7's
   16 KiB session-opening limit already governs paid inputs.
2. Dispatch with the original admission job ID and timestamps. Capture the returned
   outcome once into bounded plain data; reject accessors, cycles, nonfinite cost,
   unsafe times, oversized depth/bytes or changed binding before signing/settling.
   Preserve valid reported inference cost; missing remains absent, never zero.
3. Run actual output-schema validation plus shouldSettle. Construct the exact
   terminal Job using the ORIGINAL createdAtMs; validate with sessionJobCopy and
   bounded sessionJson. Build session Receipt with actual fixed reason 'ok' for
   acceptance or 'session_released' for definite release; no unsupported tree
   fields or receiptSignature. Validate all known fields and ledger relationships.
4. Before begin, validate the full successful candidate's size including reserved
   space for a maximum allowed reference (128 chars), category and safe timestamp
   digits. Any sizing-only placeholder must remain local, explicitly synthetic,
   never passed to finish, stored, logged or described as evidence. Prefer a bounded
   serialization sizing helper rather than running a ledger mutation as validation.
   Receipt/Job shape checks alone do not prove all ledger invariants; compare known
   binding/time/fee coordinates now, leaving only actual result correlation later.
5. An invalid/oversized output takes a bounded fixed rejected outcome, no raw output
   or provider reason, and the prevalidated released candidate. Release only from
   reserved via the atomic F6 terminal API. A store failure is a fixed unavailable
   response with the hold retained; no legacy writes or amount-only compensation.
6. beginSessionSettlement must durably return claimed:true before invoking settle.
   Use Effect.suspend to contain a rail that throws before returning an Effect.
   claimed:false causes zero rail calls. Parent-approved no retries covers typed
   failure, defect, timeout, cancellation, malformed result and uncertain persistence.
7. Keep the complete actual SettledPayment, normalize only EIP omitted kind to
   onchain/test omitted kind to test, and let F5 correlate the actual result with
   the actual terminal Job/Receipt atomically. Only after successful finish may
   output become visible or a terminal success log/attestation be emitted.

Any error after begin retains settling/uncertain and full held budget. Marker
failure leaves the already-durable settling hold authoritative. No expiry release,
second execution, synthetic nonsettlement or 'not charged' result. Cancellation
must remain cancellation after bounded cleanup/marker handling, not a disguised
success. If cancellation occurs before begin, a proven bounded released terminal
may be recorded; otherwise keep reserved rather than guess. Atomic terminal commit
and response delivery are separate: losing the response cannot undo a commit.

## Seller-funded root sub-hires remain separate

Parent APPROVED: session artifact accounts ONLY its admitted roots, not the whole
hire graph. complete means no session holds, not graph-wide finality or all child
spending reconciled. Preserve existing mayHire, mintHireCapability and broker
dispatch's hireCapability. The admitted session root Job has normal root lineage,
so existing resolveLineage can authenticate seller-funded sessionless children.
Current hire-broker constructs purchases with its own subBuyKey and lineage only;
it does not receive the buyer session ID/token. Do not add those to HubMessage,
runner env, context, broker JSON, headers or child purchase options.

Keep children on ordinary A reserveTree/commitTree/releaseTree and their own
receipts. Refuse an incoming request that itself combines session headers with
non-root lineage before challenge/admission. A root session caller may still hire
through the separate seller-funded path; do not disable maxSubSpend or fake child
settlement to make a session receipt fit. Root Job identity persists; root Receipt
omits only the unsupported optional tree projection/commitment fields.

For EIP V2, preserve an actual available A SettleTree argument where the verified
splitter path would normally use it; Gateway/Test ignore that argument. Do not
synthesize child evidence or imply the session artifact records an on-chain tree
commitment it omits. No atomic dual-ledger or cross-rail descendant-finality claim.
Root execution failure does not refund already settled seller-funded children.
No concrete source-level inability to retain the separate child path was found;
actual behavioral integration still needs the tests below.

## D and result endpoint integration

Parent APPROVED gating new session D enqueue to EIP only, with actual verified.payTo rather
than feeSplitter ?? seller and with existing verified agent ownership/chain gates.
Do it only after atomic settled/released terminal persistence, retaining the existing
bounded 50ms best-effort queue call. Uncertain has no terminal artifact and cannot
enqueue a false refusal/response=0. Gateway and Test session outcomes skip the
existing hash-only D service; no new proof schema or fake public document needed.
EIP definite nonsettlement can retain existing D behavior after its fixed terminal
record. ENS observation remains entirely outside the paid settlement decision.

F5 has no public indexed job-to-session lookup; pending Job has no sessionId, and
only terminal Receipt does. Parent APPROVED the smallest poll adaptation: F9
sends protected session ID/token AND the job token to the existing
result route. Canonical auth precedes session Store IO; one selected snapshot must
contain that job ID before returning its state. No transient process map, global
session scan or unauthenticated status oracle. Never accept a session capability
as a replacement for the job token. Use private,no-store on all new responses.

Actual Store has getJob but NO exact Receipt getter. Parent APPROVED the narrowly
scoped F8 API addition (not to be edited during F6 gates):
SessionStore.getSessionReceipt(sessionId,jobId)
returns Effect<Receipt | undefined, SessionError>. Add its declaration in
session-ledger.ts and implementation in sessionStoreApi; SQLite reuses the existing
readSessions/loadSessionState read transaction, indexed by selected session and
bounded to 100 calls with correlated jobs/receipts. Validate IDs, prove selected
call membership; a foreign or missing call refuses. Return a defensive copy of
the ACTUAL persisted Receipt, not
one reconstructed from SessionCall or Job. Missing terminal evidence must fail
storage validation; pending without a receipt may return undefined. No table,
migration, global allReceipts call, nonce mutation, or new cache. Memory retains
its existing bounded whole-state pure validation/array representation; do not
claim this makes its physical lookup indexed. SQLite decodes only selected-session
evidence, not all hub receipts. Existing getJob already uses selected-session
validation on disk; terminal rows are immutable through the API. Route first proves
authenticated snapshot membership, then uses the getter only for a terminal call,
not every 300ms tick. Add exact memory/disk getter tests for foreign membership,
missing/corrupt terminal vs pending, defensive copy, two handles and reopen;
assert the selected indexed SQL query rather than a global receipt enumeration.

Parent also APPROVED F7 GET optional closed_receipt for read-only lost-close
recovery. Derive it through F6 sessionReceipt only from the SAME authoritative
closed+complete snapshot, with the actual persisted close time and no fresh read,
fabricated time or remote proof claim. Open/pending snapshots omit it. This is a
read-only recovery mechanism, not authorization to automatically retry POST close
or any paid request after an ambiguous response. Preserve it when F8 consumes
status; full persisted per-job Receipt retrieval remains the separate API above.

Known reserved/settling => bounded 202 pending with no output/receipt; uncertain
=> fixed explicit reconciliation-required response with no output/receipt (choose
either 202 pending plus settlement_status=uncertain, or fixed 503; F9 must handle
that exact approved shape without resubmission). Core JobStatus has no uncertain,
so do not invent a terminal Job status or mutate the queued Job. A corrupt snapshot
is 503 unavailable, not pending/empty. Session status GET remains the durable
read-only accounting authority. Generic polling without session context may remain
pending when no receipt exists; no stronger state can honestly be inferred.

For settled calls, verify selected snapshot/terminal receipt correlation before
releasing persisted output; for released calls return null output and a fixed
pre-settlement refusal. Do not reflect job.outcome.error/provider prose. Gateway
UUID/test references are unlinked; EIP explorer requires known network, settled,
onchain kind and a canonical nonzero hash. Never call explorerTxUrl(UUID). Keep
ordinary sessionless poll behavior unchanged unless a specific shared safety fix
is separately approved. New session poll URLs should carry no session capability;
prefer job token in its existing response field/header, never add it to a new URL.

## Narrow behavioral gates after source release

- Actual configured Gateway fixture: payTo=seller despite listing splitter;
  full seller/zero fee/no accrual, UUID kind, no D enqueue or false explorer.
- Actual TestRail and independent EIP fixture: exact amounts/category, original
  queued time, no unsupported tree fields; actual disk terminal/reopen projection.
- Pipeline dispatch returns valid output while receipt commit fails: no output,
  no D, held retained, settle once. Synchronous settle throw/timeout/cancellation/
  malformed result behave the same; duplicate begin/finish never resend.
- Exact queued/terminal byte boundary, released-candidate headroom, multi-byte
  output, depth/cycles/accessors, bad times/cost and oversized valid-schema output
  all refuse before settle; fixed bounded released terminal remains writable.
- Real owned root+child broker flow: child uses seller subbuy payer/default rail,
  separate A reservation/receipt, no buyer session headers anywhere; root session
  spends only root price. Incoming session+hire capability refuses before payment.
- Authenticated pending/uncertain/status and released/settled poll cases, foreign
  session/job pairing, no-token/no-store/Unicode, restart, fixed Store defect and
  healthy recovery. No raw payload, capability, arbitrary diagnostic or invented
  no-charge/fee/mining claim. Existing sessionless lineage/D/pipeline tests unchanged.

These are proposed genuine behavioral tests, not executed Reds/Greens. F8 source
ownership/release, exact pending poll contract and additional fee policies remain
parent-controlled. F1 approval is consumed; normal later live evidence is Task 12,
and the conditional Task 13 fallback is not automatically activated.
