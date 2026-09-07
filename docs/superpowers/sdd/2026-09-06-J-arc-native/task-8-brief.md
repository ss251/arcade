# J8 — hub admission, runner signing and escrow pipeline

Continue from the [guarded rail](task-7b4b-report.md) and approved
[plan](../../plans/2026-09-06-J-arc-native.md). All implementation/tests remain
offline while J6 deployment size and treasury checkpoints are unresolved.
No existing authorization window, cap or replay rule changes. No new keys,
spending, subagents, parallel gates or push; four-worker sequential gates once
per atomic commit, then exact fast-forward to main.

## Atomic implementation order

1.8A: closed core socket contracts and lossless context conversion. Explicit
request IDs, full capability-derived public action context, budget/submit
requests, signed responses and fixed refusal. No capability or private keys
on this wire. Existing Hello v2 and exact/session behavior remain unchanged.
2.8B: runner sign-only policy and socket-bound request correlation. Independently
check configured deployment/current listing/price/provider/agent/state; submit
must match this runner's actual completed job/output, not a hub-claimed hash.
Fresh bounded checks, fixed existing provider600-second deadline, one-shot
signing reservations, no broadcast. Disconnect/replacement invalidates pending
authorization authority. Broker.complete currently deletes job ownership at
JobResult; submit cannot rely on that deleted assignment or a new skill route.
3.8C: durable atomic hub admission and budget HTTP route. Bind one(chain,escrow,
jobId) to one current request/payer and hub job in ONE SQLite transaction before
inference. Retried same binding returns the existing job; conflict refuses.
No capability stored. Exclude escrow-owned jobs from legacy boot reaping and
stale in-memory writes/reads; uncertainty survives restart. Action journal alone
does not prevent duplicate inference. Rate/size/capacity bounds precede work.
4.8D: typed registry/root dispatch and pipeline. Enrich only escrow challenges
with actual input/listing context; strip that extra for closed legacy Gateway.
Children/sessions retain exact rails and the default RailTag. Submit only after
shouldSettle/output validation, then complete with actual job/output/tree. On
ordinary failed execution request a proven reject/refund; never send an opposite
action after uncertainty. Persist explicit refund/uncertainty status; settled:false
alone does not mean an already-funded buyer has paid nothing. Use actual floor
fee/proof, omit synthetic exact nonce, and attest only after durable receipt.

Task9 follows with journaled buyer create/budget/approve/fund/retry lifecycle.
Any subdivisions must retain concrete production composition and honest WIP
status; type contracts alone do not complete Task8.

8B's first checkpoint is [local completion binding](task-8b1-report.md): share
the hub's existing validator verbatim and commit only the runner's actual
successful output under its current local listing/input. This data helper does
not grant signing authority; durable claims, fresh chain identity checks and
original-socket correlation remain required in the subsequent8B checkpoint(s).
The [8B2 preflight](task-8b2-report.md) supplies a concrete bounded read-only
Arc provider/job/nonce check and shares state predicates with relay preparation.
The next8B checkpoint still must supply durable provider signing claims and
the sign-only runtime; socket ownership/daemon integration remain required.

## Verification

TDD for strict unknown-field/overflow/correlation tests, unchanged legacy decode,
getter-free canonical capture and large integer roundtrips. Runner tests cover
wrong deployment/current listing/output, stale socket, duplicate concurrent sign,
deadline/cancellation and private error redaction. Real SQLite tests cover
two-handle atomic admission, restart, conflicting context, terminal/uncertain
ownership and legacy reaper exclusion. Pipeline tests prove settle/refund/error
branches and unchanged exact rails; actual owned loopback fake-chain coverage
must not be described as live evidence. Gate and privacy/link audits per commit.
