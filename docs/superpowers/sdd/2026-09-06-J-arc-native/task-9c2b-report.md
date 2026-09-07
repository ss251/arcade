# J9C2B — MCP escrow ownership and gas-inclusive accounting

Final offline composition checkpoint of the [private command brief](task-9c2-brief.md),
using the [owner config/journal](task-9c2a-report.md) and [actual SDK](task-9c1-report.md).

## Implemented

- Escrow requires explicit `rail: erc8183` and independent owner configuration.
  Config alone does not enable default fallback or a new key path. No tool
  argument chooses a credential, local identity or private journal. Invalid
  explicit-escrow arguments use fixed errors rather than reflecting private data.
- Unsigned quote selection enables only closed escrow requirements. Exact domain
  validation remains on exact rails; escrow never reaches the exact signer.
  Existing asset/network/resource/ENS checks apply. Fixed session rails stay fixed.
- The existing serial purchase lease now reserves escrow principal plus the
  configured gas ceiling against both per-call and cumulative budgets. Tool caps
  only narrow the owner cap. Check these before journal opening or key acquisition;
  the used-file check precedes the exact expected-buyer key. SDK principal cap
  remains the captured quote, not the total exposure. Round native gas upward to
  six-decimal USDC; principal and gas draw the same underlying Arc balance.
- Genuine unsigned refusal releases its reservation only if the owned journal
  remains empty. Wrongly categorized errors after claim retain the full exposure.
  Unknown outcomes and cancellation also retain it. Effect cleanup is joined
  before SQLite closes and the serial purchase lease releases.
- Successful funding accounting is reconstructed from owned journal evidence,
  including all four transaction proofs and the accepted hub job. Count principal
  plus actual buyer gas and release only unused exposure, even if remote JSON
  claims a zero price, failure or refund. Never infer a refund from that claim.
  A fabricated SDK-shaped result without journal proof cannot release exposure.
- Public output is JSON-safe local funding proof, explicitly hub-reported status
  and fenced seller content; raw output is structured data only. Terminal
  settlement/refund remain explicitly unverified. Bearer tokens, signed raw
  transactions, local paths and credentials are not exported.

## Verification

Actual MCP handler/lease + real private SQLite + codec-verified synthetic
transaction records. The existing SDK test seam supplies synthetic execution
for these accounting tests; this is not a claim that their chain calls are live.
Actual SDK/Arc-port/loopback composition is proved separately in J9C1, and the
strict CLI consumes that complete composition in J9C2A. No owner keys or real RPC.

Eleven MCP cases cover missing owner config, private tool argument refusal,
per-call/cumulative gas ceilings, tool caps that cannot widen owner limits,
default opt-out, unsigned empty versus claimed journal, uncertainty, confirmed
funding despite refund lies, fabricated success, used-file refusal and joined
cancellation. An initial output assertion expected trimmed decimals instead of
the existing six-decimal formatter; corrected the fixture, not production.
Targeted TypeScript found one optional-signal test argument; fixed explicitly.
Final focused101Vitest4PASS1.59s;42Bun3/156assertPASS3.00s;3-root strict0.
Eight-path scope freeze: 148 local links, no privacy matches and empty index.
Sole full gate8030 PASS (exit0): four-worker Vitest, four-concurrency Bun,
root/web TypeScript and client/SSR build, sequentially. Its final captured
output was truncated; aggregate counts/durations are not asserted or rerun.
The three frozen source/test hashes are rechecked before the atomic commit.

## Remaining

Task9 offline buyer integration is implemented and its gate passed.
Task10 live escrow proof still needs the blocked deployment, treasury checkpoint
and reviewed usable contract build. J4/J5 live stay paused. No authorization
validity/cap/replay protection changed, no owner key read, real RPC, send, spend,
grant, deposit, deployment, replayed approval or push occurred.
