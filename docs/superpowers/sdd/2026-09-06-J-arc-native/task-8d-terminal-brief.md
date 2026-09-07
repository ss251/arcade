# J8 terminal evidence prerequisite for C2/D activation

Continue from [atomic admission](task-8c1-report.md) within Task8. Finish the
terminal evidence/store boundary before enabling budget or paid-root routes:
creating an escrow funding route without a safe completion/refund path would
strand buyers. Then compose C2 budget HTTP and D root pipeline/boot together,
followed by Task9. Existing live pauses remain; all work here is offline.

## Evidence and durable completion

Add closed escrow terminal metadata to receipts: explicit settled/refunded/
uncertain state, on-chain job/contract/request identity and exact principal.
Confirmed outcomes require the existing independently checked action proof;
uncertainty must not invent confirmed transaction, payout or refund values.
Quoted listing price/allocation remain compatible with existing Receipt fields;
actual terminal movement is explicit. Never infer refund from settled:false.

Persist terminal Job+Receipt+proof and state atomically in the same current-disk
Store. Preserve exact input/output ordering, root context, actual completed
output/tree and submit-before-complete binding. Validate recorded proof kind,
amounts/floor500bps fee, time and unique transaction ownership. Identical terminal
retries must be idempotent; conflicting/partial/uncertain evidence must refuse
opposite actions. The database is not an RPC verifier: only the guarded rail's
actual independently checked result can enter the pipeline terminal call.

No terminal output leaves the token-gated route unless settlement is confirmed.
Refund and uncertainty need fixed honest wording instead of the legacy
"not settled — you were not charged" fallback. Attestation follows the durable
receipt, using the actual complete transaction only. No synthetic exact nonce.

## Compatibility before activation

The current summary and tree readers accept only legacy rails. Add explicit
escrow receipt compatibility without broadening session/browser purchase rails.
Root escrow jobs can hire children on existing rails: validate actual child
reference provenance rather than assuming all children use the parent's rail.
Only hub-derived root hire capabilities may be forwarded; child escrow work
remains unsupported. Public projections must keep buyer/hub-job/session
capabilities, raw input/output and signatures private. On-chain job metadata
must be deliberately whitelisted, not spread from private receipts.

Verify with real SQLite two-handle/restart/rollback/corruption cases, actual
guarded proof fixtures, mixed-rail tree and reader tests, then actual owned
loopback root/budget/pipeline flows. No mocked send is live evidence. Use the
existing bounded caller/IO deadlines, private journals and explicit full identity;
no legacy window/cap/replay changes, wallet reads, spending, deployment or push.
Single-threaded, four workers, one sequential full gate per atomic commit.
