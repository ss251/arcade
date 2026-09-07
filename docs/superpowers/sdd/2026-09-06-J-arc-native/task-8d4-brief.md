# J8D4 — actual typed escrow execution pipeline

Compose the durable Store, broker and guarded `Erc8183Rail` without casting an
escrow payment to the legacy EIP-3009 payload. Validate current explicit listing
and actual admitted input, claim inference once and prepare the child ceiling
before dispatch. Only the hub mints a root hire capability; no child escrow.

Close child admission after the actual runner outcome. A stable complete tree
requires no pending holds and matching full legacy child evidence. Validate
the actual output before submit, then complete with its output/tree commitment.
An ordinary execution failure can request one proven reject/refund. An action
error, interruption or uncertain hold must never cause a blind opposite action.

Persist the actual outcome, confirmed proof or explicit uncertainty atomically.
Enqueue optional attestation only after a newly durable confirmed terminal,
using the actual completion transaction, never a synthetic exact nonce. Storage
failure cannot trigger a refund or registry write. Interruption cleanup closes
admission and preserves uncertainty without replaying inference or payment.

Use real SQLite and actual broker checks with explicitly synthetic rail/proof
fixtures. These are not live proof. Budget/root HTTP and pinned durable boot
remain next, followed by Task9. No existing validity/cap/replay changes, owner
keys, real RPC, spending, deployments or push; one sequential full gate.
