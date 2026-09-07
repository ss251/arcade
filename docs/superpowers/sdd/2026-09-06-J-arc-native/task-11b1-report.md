# J11B1 — inactive escrow event/lifecycle mappings

Implements the [bounded event-observation brief](task-11b1-brief.md), after
[J11A](task-11a-report.md). Terminal payout correlation remains J11B2.

## Implemented

- Two real inactive templates, ERC8183 and ArcadeJobHook, with the exact staged
  event ABIs and sixteen handlers. Existing two active splitter sources and
  four inactive templates remain exact. No address/start block/context is
  invented, and no mapping instantiates either template. Manifest mutations
  that add activation, change handlers or substitute mappings are refused.
- Explicit local Arc-testnet proxy/hook/evaluator source context is required.
  Absent, wrongly typed, zero, overlapping or non-Arc context creates nothing.
  Actual data source/emitter must match the independently supplied local role.
  This is deployment configuration, not metadata discovery or runtime bytecode
  verification; live activation still requires the blocked approved deployment.
- Immutable transaction/log observations include bounded canonical fixed-tuple
  payload hashes. Exact old replay is a no-op; changed payload or coordinates
  at the same occurrence aborts before summary mutation. Full uint256 values,
  uint48 expiry and uint32 hook counts are checked without narrowing.
- Observed creation with the bound evaluator/hook and nonzero parties owns a
  chain/proxy/job summary. Other/missing creation leaves an unlinked observation,
  never a fabricated job or later rewritten immutable orphan. Missing budget,
  token, funding and deliverable remain null. Later exact event facts update
  last-observed status only in canonical block/log/time order.
- Payment, platform/evaluator fee, partial settlement, payout receiver, refund
  and hook events remain separate public records. Amounts are raw token units;
  this slice does not establish every event is USDC or prove a terminal payout.
  Completion/refusal/hook hashes do not create Settlement/Tree/Listing rows,
  validate execution or imply zero fees/refunds. Administrative upgrades and
  hook detachment are not tracked; the summary hook is the creation observation.

## Verification

The initial pinned AssemblyScript build crashed on overloaded nullable Bytes
comparisons. Explicit strict null checks removed the crash; using the required
ethereum.Tuple and strict nullable-string narrowing fixed the ensuing two
ordinary type errors. No compiler/toolchain replacement or weakened bounds.
The actual new mappings then compiled to WASM and executed in Matchstick.

Final mapping runtime:27 escrow tests1.775s;27 splitter1.555s;16 identity1.784s;
11 reputation1.763s;7 validation1.707s. All88 passed in sequential owned/reaped
processes using the SHA256-pinned Matchstick0.6.0 binary, each capped60seconds.
Cases cover every handler, exact creation/nulls, unknown history, binding
refusals, proxy namespace, replay conflicts, ordering, widths, payment/refund
separation, and full-width hook metadata. No escrow Settlement is manufactured.

Final186focusedBun5/431assertPASS634ms. These include source/ABI/schema checks
and real manifest generation, separate from mapping runtime. Final five-root
strict0 and final codegen/WASM PASS. Seventeen-path scope freeze:147 local
links, no privacy matches, empty index. Sole full gate73911 PASS:
5,258Vitest240/71.88s;1,360Bun92/11,706assert193.13s; root/web strict and
client/SSR builds. All stages sequential and four-worker/concurrency bounded.
Eleven frozen source/test pins rechecked before the atomic commit/main
fast-forward, with no gate replay or squash.

## Remaining

J11B2 terminal payment/fee/completion/hook correlation, then J11C web labels,
filter and bounded read-only evidence. No live source activation, Studio
redeploy, indexing or escrow payment proof is claimed. J4/J5 live and J6/Task10
deployment pauses remain. No owner keys, real RPC, sends, spending, grants,
deposits, replayed approvals, payment-validity/cap/replay changes or push.
