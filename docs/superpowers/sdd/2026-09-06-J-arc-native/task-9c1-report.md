# J9C1 — actual SDK selection and armed health

SDK/health checkpoint of the [J9C brief](task-9c-brief.md), following
[concrete buyer ports](task-9b4-report.md). CLI/MCP remain J9C2; no live proof.

## Behavior and boundaries

- No default activation: a rail preference alone cannot enable escrow. Only an
  explicit local full identity, principal/gas/expiry/operation bounds and durable
  one-purchase journal enable closed escrow accept selection. Malformed known
  accepts fail closed; escrow never reaches the exact typed-data signer.
- Capture canonical input and local authority before asynchronous discovery.
  Read current listing price/version/timeout, opt-in, seller and positive verified
  ERC8004 agent metadata independently of the402 echo. Check local registry and
  Arc chain. Listing ownership remains a hub assertion, not an independent buyer
  chain proof. Full deployment and transaction proofs use the actual Arc ports.
- Existing ENS endpoint, payee, asset and chain checks run before driver entry,
  then remain the driver's authority check before signatures/sends. Root JSON
  requests require an explicit principal cap, no lineage or inherited payment
  headers. Local pins are never learned from health or challenge responses.
- Unsigned listing discovery has a30second total bound for the existing detail
  endpoint's5second owner and16second reputation readers. Escrow probe headers
  and body share one5second scope; body size131072 and4096read limits apply.
  This is not a change to a payment validity window or RPC retry policy.
- Actual driver/Arc ports own create/budget/approve/fund/root. Generic paid-fetch
  does not issue another POST. Effect interruption joins bounded durable cleanup
  before callers may close the journal. A used file is rejected before generating
  another capability. Possible-spend failures use `RpcFailure.method=escrow`,
  never an unsigned402 category that would release an MCP reservation.
- Actual armed hub health exposes only the ten public identity fields. Disabled
  health and ordinary boot behavior remain unchanged. SDK output drops any
  remote authorization/funding fields and adds local funding/queued proof,
  all four transaction proofs and buyer gas. This is not terminal settlement
  or refund proof. Private journal/token/raw transaction data stays private;
  exported bigint evidence needs deliberate JSON projection.

## Verification

Generated ephemeral accounts, real owned SQLite/loopback, synthetic Arc RPC,
and existing viem codecs only. No owner keys, real RPC, writes or payments.
Tests exercise actual SDK current listing/probe/health/budget/root/poll flow;
forged remote accounting, default opt-out, malformed/duplicate accepts, local
listing/config changes, bounded delayed response bodies, ENS refusal before
gas, health pin mismatch, interruption cleanup ordering and used-file refusal
before RNG/network. Existing ordinary SDK/ENS and armed/unarmed startup tests
remain part of the focused and full gates.

Initial targeted strict checking found Headers iterable-lib and fixture callback
types; fixed without changing policy. A synthetic terminal-result fixture needed
an explicit bigint projection. Final focused36Bun4/1,216assertPASS10.23s;
9-rootstrict diagnostics0. Legacy/ENS/selection focused107Vitest4PASS1.12s.
Sole sequential fullgate81562PASS:5,258Vitest240/73.86s;
1,292Bun88/11,128assert194.14s; root/web TypeScript and client/SSR builds.
Fifteen-path scope/privacy audit and141 local links pass; nine frozen code/test
pins checked before atomic commit/exact-one main fast-forward. No gate replay.

## Remaining

J9C2 private CLI/MCP owner configuration, gas-inclusive serialized spending limits
and safe command cancellation. Do not infer a refund from a remote receipt.
J4/J5 live and J6 treasury/code-size pauses remain. No existing validity/cap/
replay protection changed, no approval replay, no deployment activation or push.
