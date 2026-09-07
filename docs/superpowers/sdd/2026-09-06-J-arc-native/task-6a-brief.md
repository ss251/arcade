# Task 6A — pinned escrow and receipt hook

Scope: vendor ERC-8183 unchanged, build against its exact dependencies, and test
ARCADE's hook through the real authorization implementation behind ERC1967Proxy.
No RPC, keys, deployment, funding or treasury selection in this checkpoint.
Task 6B adds the guarded deployment script; actual deployment remains at the
explicit OWNER treasury checkpoint. J4 and J5 live stay paused.

## Source contract, not shorthand

Pinned [base-contracts](https://github.com/erc-8183/base-contracts/tree/142e669c1fd318486a4628395b629f033654dd06):
`142e669c1fd318486a4628395b629f033654dd06`. Nested gitlinks pin forge-std
`620536fa5277db4e3fd46772d5cbc1ea0696fb43`, OpenZeppelin
`5fd1781b1454fd1ef8e722282f86f9293cacf256`, and upgradeable OpenZeppelin
`7bf4727aacdbfaa0f36cbd664654d0c9e1dc52bf`. Recursive checkout preserves
their own nested gitlinks. Build: Solidity 0.8.28, Cancun, optimizer 200.
No re-pin, upstream edits or replacement dependency sources.

Size preflight found a real build constraint: the legacy compiler produces
27,574 runtime bytes for the authorization implementation, exceeding EIP-170's
24,576 bytes (`forge build --sizes` exits 1). Do not raise the code-size limit
or deploy that artifact. The dedicated `erc8183` Foundry profile enables via-IR
with the same pinned compiler, optimizer and source, and separates its output
and cache. Existing default-profile artifacts retain the legacy pipeline.
The candidate via-IR profile still produces 26,167 runtime bytes. A command-local
optimizer-runs 1 experiment produced 25,776 bytes, also too large; it is not a
saved setting. The pin is already upstream main in the observed public history;
no speculative re-pin or source removal is justified. **Deployment is blocked.**
The deploy script must check size/settings before any key read and refuse these
artifacts. The final contract test gate uses the saved candidate profile; it
must not be reported as a passing deployment-size gate.

The executor read the full base contract, authorization contract and hook
interface. The concrete `ERC8183.Job`/`getJob` API exists; there is no separate
`IERC8183` source in this pin. Hook selectors are the base action selectors,
including relayed authorization entrypoints. Fund callback data is
`abi.encode(actor, optParams)`; complete/reject data is
`abi.encode(actor, reason, optParams)`. Decode that wrapper before decoding
the four-field ARCADE receipt tuple.

Initialization already whitelists the zero hook. Contrary to the plan shorthand,
`setHookWhitelist(address(0), true)` reverts `ZeroAddress`. The future deployer
must **verify** the initialized zero-hook getter, not send that setter call.
This corrects an impossible call without modifying the vendored contract.

## Behavior and trust boundary

Only the configured escrow may invoke either callback. Funding requires the
job's evaluator to match the hook's immutable evaluator. Completion emits the
evaluator-supplied tree/receipt commitment; rejection emits the actual reason.
Malformed completion data must roll back the entire settlement, including fees.
These events commit metadata, not independent proof that off-chain work or a
receipt tree was correct.

Pinned `_reject` accepts evaluator rejection from **Funded or Submitted**;
Open rejection belongs to client/provider. A lost runner can therefore be
refunded while Funded. With no pending claim, a Funded job permits permissionless
`claimRefund` at expiry. Submitted jobs wait expiry plus the existing one-hour
grace period. Pending milestone claims can block the Funded expiry route.
No upstream expiry, authorization nonce or replay behavior is changed.

The upstream proxy is admin-upgradeable. Admins can pause, change fees/allowed
tokens/hooks, detach hooks and emergency-withdraw while paused. The hook does
not disable upstream milestone claims or alternate payout receivers. Later
ARCADE rail verification must enforce its supported full-job/payout policy;
do not present the base deployment as trustless, immutable or exclusively
ARCADE-controlled by this hook.

## Verification

Targeted Foundry TDD first; real proxy, ERC20 mock and genuine local EIP-712
signature/replay tests. One complete sequential gate for this atomic commit:
root Foundry tests (four threads), then bounded Vitest, bounded Bun, strict
typecheck and web build. No concurrent gates or subagents. Record exact results
in the Task 6A report before the local commit/fast-forward; never push.
