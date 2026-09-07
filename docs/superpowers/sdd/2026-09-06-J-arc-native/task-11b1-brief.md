# J11B1 — inactive event observations and job lifecycle

Continue the [J11 brief](task-11-brief.md) after [J11A](task-11a-report.md).
Keep this atomic slice separate from J11B2 terminal settlement correlation and
J11C web display. Recording a completion event is not proving its payout.

- Add two inactive real mapping templates, without addresses, start blocks or
  instantiation. Preserve both active splitter sources and existing registries.
  No metadata discovery or caller-provided activation profile is accepted.
- Handlers require explicit local source context binding proxy/hook/evaluator
  on Arc testnet, matching the actual data source/emitter. Unconfigured handlers
  cannot create evidence. Synthetic fixtures supply that local context only.
- Immutable transaction/log occurrences own deduplication. Preserve a bounded
  canonical payload digest and reject conflicting replay; preserve exact money,
  widths, event timestamps and public hashes. Do not index inputs or outputs.
- Observed matching creation owns a chain/proxy/job summary. Unknown creation
  remains an unlinked event; missing budget/funding stays null. Require canonical
  order before changing a summary; exact older replay remains a no-op. Keep
  last-observed status distinct from verified current chain state.
- Persist payment/fee/refund and hook observations individually. Never create
  an escrow Settlement, infer a zero fee/refund, recompute a fee percentage or
  infer tree validity in B1. B2 must correlate actual same-job/transaction facts.
- Execute actual new AssemblyScript mappings in the hash-pinned Matchstick
  runtime, plus legacy regression, codegen/WASM, source/schema checks and strict.
  One sequential four-worker full gate precedes the atomic commit/main FF.

No live source, Studio deploy, owner key, RPC, payment, changed authorization
policy or push. Existing J4/J5/J6/Task10 pauses remain unchanged.
