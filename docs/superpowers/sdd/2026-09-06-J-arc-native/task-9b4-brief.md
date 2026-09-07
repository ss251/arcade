# J9B4 — concrete buyer Arc ports

Continue the remaining concrete-port work in the [driver brief](task-9b3-brief.md)
after the [durable coordinator checkpoint](task-9b3-report.md). Root-only,
single-threaded, four workers, one sequential full gate and exact main FF.

Implement a buyer-specific port, never reuse evaluator spending authority.
Require the original locally pinned buyer intent and fixed action kind; one
instance may propose/sign/broadcast only that action once. Reuse the existing
Arc5042002 transport, bounded responses, per-IO5seconds,400observations and
one-send latch; no key lookup, activation or spending on import.

Use the full-pinned finalized reader for deployment/current/historical jobs.
Observe provider EOA, native-USDC balance and ERC20 allowance at the captured
canonical block, then close with block/chain checks. Historical allowance is
at the proven receipt block, fenced by a fresh finalized head; do not confuse
that historical timestamp with fresh signing authority. Reserve native
principal plus remaining total gas together. Bound gas/nonce proposals,
acquire only the exact buyer signer with cancellation, and independently
recover exact signed bytes. Read-only receipt backoff never retries a send.

Reconstruct mined EIP1559 raw bytes from independently fetched fields and
signature, require exact hash/recovered sender, then feed the existing buyer
and provider-authorized budget proof functions. HTTP data is never raw-wire
authority. Test actual viem ABI/JSON-RPC decoding over synthetic fixtures,
canonical pin/nonce/balance drift, wrong signer/wire/hash, late acquisition,
send uncertainty and historical readback. Add owned-loopback coordinator
composition with real private SQLite if it fits this checkpoint; otherwise
split that bounded verification step explicitly, without claiming live proof.

No owner keys, real RPC/payment calls, deployments, new spending, replay of
approvals, existing validity/cap changes or pushes. J4/J5 live and J6 treasury/
code-size pauses remain. J9C SDK/MCP/CLI and armed health metadata follow.
