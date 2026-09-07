# J11A — staged escrow event/schema contracts

First offline checkpoint of the [Task11 brief](task-11-brief.md). Task10 live
proof remains blocked by J6 deployment prerequisites; no live step attempted.

## Implemented

- Event-only ERC8183 subset: fourteen lifecycle, funding, payout/fee/refund,
  provider/payout-receiver and partial-settlement events; both ArcadeJobHook
  events. Exact names, order, widths and indexed flags match local pinned
  Solidity declarations and parse through the installed Graph ABI parser.
  This is not deployed-bytecode compatibility evidence or all administrative
  events. No escrow ABI is referenced by the active manifest yet.
- EscrowJob is chain/proxy/job scoped, with required observed-creation facts.
  Unknown budget/funding/deliverable stay nullable; full integer widths remain.
  Immutable EscrowEvent stores separate public occurrences and nullable job
  attribution, not fabricated missing creation history. No fields are added for
  seller code, input/output, credentials, private capability or descriptions.
- Settlement gains required handler-classified rail plus nullable escrowJob.
  Splitter and EIP-3009 nonce become nullable for future escrow settlements;
  existing exact mappings still populate both and rail=eip3009. No fake splitter
  or nonce is inserted, and no EscrowJob/Event is currently created.
- Active source selection, start blocks, templates and generator remain
  unchanged. No metadata discovery, activation, Studio upload or redeploy.

## Verification

176 focused Bun checks /399 assertions finalPASS845ms: ABI parsing/local declarations,
schema contracts and nullability/range mutations, actual G7 query selections,
unchanged source inventory and legacy scaffold. Local Graph codegen and WASM
build PASS. Exact previously provisioned Matchstick0.6.0 bytes rechecked by
SHA256; actual fee-splitter mapping suite passed all27 tests in2.251s with new
rail and stored-null escrowJob assertions, one bounded owned/reaped process.
This is actual legacy mapping runtime evidence, not escrow mapping or live
graph-node indexing. New escrow mapping runtime remains J11B.

Targeted two-root strict0 after fixing the test-only local YAML result type.
Fourteen-path scope/privacy freeze:141 local links, no matches, empty index.
Sole full gate28507 PASS:5,258Vitest240/71.21s;1,350Bun92/11,674assert192.53s;
root/web strict and client/SSR build. All stages sequential and bounded to
four workers/concurrency. Eight frozen source/test pins rechecked before the
atomic commit and exact-one main fast-forward; no gate replay on main.

## Remaining

J11B inactive escrow/hook mappings and tests, then J11C existing-design web
labels/filter/receipt evidence. Live proxy/hook source pins and Studio v0.0.2
remain deployment-blocked. J4/J5 live stay paused. No owner key, real RPC,
send, spend, grant, deposit, replayed approval, deployment, payment validity/
cap/replay change or push occurred.
