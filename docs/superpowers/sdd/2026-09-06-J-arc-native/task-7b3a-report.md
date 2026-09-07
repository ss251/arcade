# J7B3a — guarded action coordinator and durable journal

The coordinator now implements the [J7B3 execution contract](task-7b3-brief.md)
over injected bounded chain/signing ports and a concrete Bun-only private SQLite
journal. Actual RPC transport, provider/transaction signer wiring, active Effect
rail and hub admission remain unimplemented. This is offline implementation and
verification, not a live send or escrow-settlement claim.

## Guarded execution

One invocation captures context/operation without getters and obtains a durable
claim before requesting a provider signature. It validates fresh job/provider
code and unused provider nonce, checks the evaluator has no pending nonce gap,
and persists the exact prepared calldata and completion projection before
transaction signing. The recovered EIP1559 transaction must match every term;
its hash and raw bytes are journaled before a durable send-attempt marker.

After slow signing/storage, current job, provider code/authorization nonce and
sender nonce are read again. Snapshot freshness, provider authorization expiry
and action lifetime are checked after the final nonce read. Only one broadcast
is allowed. A returned hash is insufficient: separately fetched transaction,
receipt/log proof and canonical finalized receipt-block state must agree before
confirmation. Receipt proof now retains block time and source submittedAt;
completion must match the confirmed Submit output and timestamp.

Cancellation/deadline or any ambiguity after reservation preserves an uncertain
fence. Neither a retry nor an opposite reject gets a new claim. A late callback
cannot resume a timed-out executor or advance an uncertain durable record.
Already-aborted calls refuse before claiming. Errors expose only stable codes,
never raw upstream errors or signed payloads. There is no automatic read/send
recovery API in this checkpoint. Five-minute action coordination is a new
operation deadline, not a change to any existing payment validity or cap.

## Durable storage boundary

The journal requires a canonical, owned0700 directory and a regular owned0600
single-link file. Memory/alias/broad-permission paths refuse. Every operation
rechecks the file identity and directory; replacement/unlink refuses. SQLite
uses DELETE journaling, synchronous=EXTRA and fullfsync=ON, and verifies those
settings. EXTRA adds the directory sync after rollback-journal removal;
fullfsync uses the stronger macOS sync where supported. See the official
[SQLite synchronization reference](https://www.sqlite.org/pragma.html#pragma_synchronous)
and [fullfsync setting](https://www.sqlite.org/pragma.html#pragma_fullfsync).

Immediate transactions reserve the job/action and evaluator sender across
cooperating handles using this same journal. Context cannot change for a job;
actions progress budget→submit→complete, or reject from a supported funded
path. A verified already-funded job may start at submit/reject. Complete always
requires this journal's confirmed Submit. Pending/uncertain ownership survives
reopening; confirmed terminal actions never reopen. Only confirmed actions
release the sender reservation. A compare-and-swap state/digest guard rejects
late writes; late uncertainty cannot overwrite a durable confirmation.

Stored envelopes are size-bounded, checksummed and recaptured on read. Signed
transactions are independently recovered before preparation is committed.
The database keeps at most10,000 action records and at most3 per job, without
automatic pruning. Raw provider signatures/transactions stay in private
calldata/journal records, never public evidence. This assumes a cooperating
local OS/filesystem honors synchronization; it is not a physical power-loss
test, hostile-same-user tamper-proof storage, or a lock on unrelated programs
using the same evaluator account. All cooperating hub workers must share one
journal. Hub execution/inference admission remains separate Task8 work.

## Verification

Executor TDD started with a missing-module refusal. Real SQLite tests then
exposed a noncanonical macOS test-temp alias and an INSERT placeholder-count
defect; the fixture now uses its canonical path and the SQL was corrected.
Strict checking caught contextual parameter typing. All fixes precede the
sole full gate. Original J7B2 evidence assertions were mechanically retained
while extracting their fixture; a new closed gas-policy capture test was added.

Focused26Vitest/2files/192ms and7Bun/38assertions/813ms passed. Real private
database reopen/cross-handle tests cover each crash stage, duplicate/opposite
actions, evaluator reservation across jobs, confirmed Submit binding, corrupted
rows, path replacement, late writes, and the actual coordinator using a real
journal with fake chain ports. Success and an unknown single send both retain
restart fences. Tests generate ephemeral local accounts; no owner keys or
real RPC/payment/deployment are used. Six-root strict checks passed with zero
diagnostics. The sole full gate64377 passed:4,925Vitest/221files/69.01s,
971Bun/70files/7,357assertions/173.77s, root/web strict, client345ms and SSR182ms
builds. No full-suite replay or concurrent gate occurred. The earlier relay
cleanup concern did not recur on this checkpoint. Eight code/test pins remain
frozen for the final14-path/64-local-link privacy and scope audit.

Next: concrete bounded transport and active rail (7B3b), then Task8
hub/runner/admission/pipeline, then Task9 buyer lifecycle. J4 and J5 live stay
paused; J6 treasury and the reproduced contract-size refusal stay unresolved.
No existing validity/cap/replay change, spending, subagent or push.
