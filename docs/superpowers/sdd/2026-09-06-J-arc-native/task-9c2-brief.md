# J9C2 — private CLI/MCP purchase ownership

Continue [actual SDK integration](task-9c1-report.md). Split coherent CLI and
MCP checkpoints if needed; Task9 stays incomplete until both are verified.

1. Explicit owner environment selects one config and one private purchase file:
   `ARCADE_BUYER_ESCROW_CONFIG` and `ARCADE_BUYER_ESCROW_JOURNAL`. Config has
   exact public identity, expected buyer, positive gas budget, expiry and bounded
   operation timeout. No discovery response or model tool argument selects keys,
   local pins or a journal. Read-only validation is keyless and creates nothing.
2. Require canonical owned0700 parents and0600 single-link regular files; reject
   symlinks, sidecars, collisions, oversized/non-UTF8/changed config. Use a
   nonblocking no-follow file descriptor to avoid FIFO blocking. Recheck original
   captured config before opening private SQLite. A used file refuses before
   key acquisition; no automatic new file, capability, deletion, repair or replay.
3. Strict opt-in CLI uses `--rail erc8183`, ID with explicit seller/hub or ENS
   name, canonical JSON and explicit principal `--max-amount`. The separately
   owner-configured gas budget is additional bounded exposure, reported clearly.
   Unknown/duplicate flags, invalid config, help and used journals never read a
   key. Existing commands/defaults remain unchanged. Signals join SDK cleanup
   before journal close, with a bounded owning-process fuse and fixed diagnostics.
4. Export only a closed JSON-safe funding projection verified against the actual
   owned journal, not a remote result or arbitrary SDK-shaped object. Match the
   private accepted hub job, all four proofs, local identity, payer roles, amount
   and gas. Never export bearer capabilities, signed bytes or config paths.
   Funding is not verified terminal settlement/refund; raw seller results remain
   fenced data. Round native gas upward to USDC micro-units when comparing caps.
5. MCP requires explicit `rail: erc8183` plus owner config. Its current serialized
   purchase lease reserves principal plus configured gas against both existing
   per-call and cumulative budgets; tool caps may only narrow. Genuine unsigned
   refusals can release their reservation. Unknown outcomes retain the full
   reservation. Confirmed funding consumes principal plus actual buyer gas even
   if the remote hub later claims refund; only proven unused gas may be released.
   Exact and fixed session-rail behavior remains unchanged.

Use real owned SQLite/loopback, ephemeral keys and synthetic chain data only.
Test actual dispatch, file safety, import/help/refusal before keys, gas-inclusive
caps, durable output verification and cancellation. Single-threaded, four workers,
one sequential full gate per commit, exact-one main FF, no push. No live RPC,
owner-key reads, spending, deployment or changes to existing validity/cap/replay
policy. J4/J5/J6 live pauses remain; this does not authorize any live retry.
