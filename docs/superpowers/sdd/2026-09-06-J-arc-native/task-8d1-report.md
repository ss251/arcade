# J8D1 — atomic terminal escrow evidence

Implements the durable terminal checkpoint in the [terminal brief](task-8d-terminal-brief.md),
following [J8C1 admission](task-8c1-report.md). HTTP, result wording, receipt
readers, attestation and actual pipeline/boot activation remain subsequent work.
No escrow route or deployment is enabled by this checkpoint.

## Evidence, not new sending authority

Receipts now optionally carry closed `arcade:erc8183:terminal:v1` metadata:
on-chain job/contract/request/principal plus explicit settled/refunded/uncertain
state. Confirmed evidence contains the checked action transaction/block/time,
gas and actual seller/fee/refund movement. Uncertainty contains none of those
confirmed facts. Existing outer price/allocation fields remain quoted values;
`settled:false` alone is not a refund. The escrow fee uses the existing upstream
floor500bps calculation, including its multiplication bound, not the legacy
splitter's rounding. Legacy receipts need not acquire new fields.

Metadata is bounded flat JSON, with canonical nonzero addresses/hashes,
uint256 decimal strings and integer timestamps. Closed shape checks reject
accessors, prototypes, hidden/symbol fields and unknown properties. An exact
optional field avoids Effect's undefined-union error formatter inspecting a
refused object's getters. Input/output retain their original JSON property
order; only declared metadata fields receive bigint conversion. Literal
`__bigint` buyer fields remain literal JSON.

The terminal codec binds full context to the same root job, quoted allocation,
outcome and receipt. Success requires non-refusal/nonempty bounded output,
the actual output hash, the supplied completion projection, and preceding
submission evidence for that output. It recomputes the pre-settlement receipt
projection and tree commitment. Unknown schema validity, child authenticity and
chain provenance cannot be established by this codec: the subsequent pipeline
must supply its own validated listing/output/tree and the guarded rail's actual
independently checked result. Test fixtures are not live evidence. Final mined
timestamps are not treated as a new authorization window; existing executor
deadlines and replay protection are unchanged.

## One current-disk transaction

The existing durable Store facade gains `finish(context, terminal)`. Additive
nullable terminal JSON/digest columns retain J8C1 rows. A dedicated unique
transaction-reference table binds complete/reject and submit transactions to
one hub job. Terminal receipt, job/outcome, references and state are committed
together, then read back exactly inside the transaction. Ignored writes and
deferred commit failures cannot publish successful completion. Existing
WAL/FULL settings remain; this is cooperating-process durability, not proof
against coordinated malicious database rewriting or hardware power failure.

Only executing work can become settled. A confirmed refund can close admitted
work that never dispatched. Uncertain work can receive only an honest uncertain
receipt, never a subsequent settlement/refund or automatic replay. Identical
terminal retries are idempotent; changed bytes refuse. The legacy job/receipt
writers remain blocked. Current receipt enumeration reads and validates disk
evidence across already-open handles. Restart does not reap escrow work.
Existing10,000 admissions are retained; at most two terminal references/job,
bounded1MiB evidence, no repair/eviction/reconciliation/sending API.

## Verification

Initial receipt tests genuinely reproduced dropped valid metadata and ignored
malformed metadata. A getter regression exposed error formatting of the optional
undefined union; exact optional metadata fixed it. The initial Store terminal
test could not load the not-yet-created codec. New success/refund/uncertainty
fixtures use ephemeral signed transactions plus the existing log/historical
proof validator. Deliberately forged second-job references are negative tests,
not claims of chain verification.

Final focused results:36new terminal SQLite cases plus21existing admission cases
passed (57tests,315assertions,2.47s). Coverage includes actual two-handle/reopen,
all-write rollback including ignored writes/deferred-COMMIT failure, missing or
corrupt receipt/job/digest/state/references, retry conflicts, uncertainty,
cross-job complete/submit reuse, ordered payloads, output/projection/submission
mismatch, quoted fee and outer identity mismatch, legacy nonce rejection,
refusal and getter/copy isolation. Twelve new core cases plus ten unchanged
action-evidence cases passed (22Vitest/2files,0.879s). Eight-root strict checking
reported zero diagnostics. The15-file audit found102valid local links and no
added-content privacy matches; nine code/test files were frozen before testing.

The sole full gate35269 was NOT clean:5,069Vitest/233files passed in71.31s;
Bun reported1,071pass/1fail across78files,8,148assertions in185.68s. The failure
was an unchanged Agent SDK relay test's beforeEach/afterEach hook timeout
(5,125.23ms), after its100ms pending-upstream assertion path. The fixture leaves
an upstream handler promise unresolved forever and awaits server shutdown in
cleanup. The isolated unchanged test passed once in108.38ms (2assertions,
21filtered); that does not erase the full-gate failure. No full suite is rerun
for this checkpoint. Skipped root/web strict and client/SSR build checks passed
separately as62413 (no test suite repeated); a distinct
fixture-cleanup commit must pass its own gate before the combined main merge.
See the [separate fixture lifecycle follow-up](task-8d1-relay-cleanup-report.md).
That distinct follow-up's sole66986 gate passed5,069Vitest/233files and
1,072Bun/78files, plus root/web strict and client/SSR builds. J8D1 source stayed
unchanged throughout; its own earlier full-gate failure remains recorded above.

No owner keys, real RPC, sends, spending, deployment, consumed-approval replay,
production changes or push. J4/J5 live pauses and J6 owner/size blockers remain.

## Next

Add explicit summary/tree/public receipt and token-gated result compatibility:
no generic "you were not charged" wording for escrow, no output before confirmed
settlement, deliberate mixed-rail child provenance. Then compose C2 budget HTTP,
D root pipeline/explicit durable boot and post-durable attestation together;
forward only a hub-derived root hire capability. Then Task9 buyer escrow path.
