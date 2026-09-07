# Task5B3 — Guarded SDK runtime and actual fund CLI

Implements runtime/CLI wiring; live proof remains5C/NOT_RUN. No existing payment
validity constant, cap or replay guard is changed. F11 only exports its existing
bounded JSON IO; its identity/withdrawal policy remains intact.

- Anonymous testnet Gateway scope with body/deadline/redirect checks, exclusive
  owned-process install/restoration and one transfer claim before asynchronous
  validation. Pinned provider.spend requestConfig caps attempts at1 independently.
- Actual Viem owner adapter is watch-only; the delegate's RPC transport cannot
  invoke wallet signing/mutation methods. Final burn signing is lazy, one-shot,
  freshly rechecked, cryptographically recovered and matched to the exact
  transfer serialization. No SDK trace/signature logging.
- Destination checks precede owner signing, including pre-existing native gas.
  Mint calldata commits the signed spec, fees are bounded, signed transaction
  fields/sender/hash are verified, and its public hash is fsynced before one
  broadcast. One-receipt-per-tick callback replaces SDK default viem waiting.
- The new optional mint_prepared stage stays within the existing five-line
  Unified journal bound and ties SDK return to the prepared hash. F11 formats,
  account claims and replay refusal are unchanged.
- Actual arcade/buyer CLI routes, hard process fuse, offline dry-run, precise
  owner instructions and closed output projection are wired and tested.

The [funding guide](../../../unified-balance-funding.md) explicitly distinguishes
SDK return, observed code/state and independent deployment/effects evidence.
This runtime does not resolve historical F11 Minter build-identity concerns;
5C must inspect current deployment state and independently verify accounting.
Private evidence is retained, not permission to retry with another filename.

Testing retained genuine failures: a scalar-only codec rejected EIP712 type
arrays (8signing failures); a fractional timer could fire just before the next
clock check (1network failure); actual adapter action names use
isAuthorizedForBalance, not an on-chain isDelegate getter. The native fixture
also needed gatewayMint simulation, and actual viem parsing represents encoded
zero priority fee as undefined. Corrected without extending timeout/validity.
Initial missing network module was a setup failure, not behavioral Red.

Final focused run:94Bun/5files/434assertions/8.41s including F11 runtime/CLI
regressions;144Vitest/6files/1.06s;17-root strict0. Actual SDK tests use ephemeral
local cryptographic fixture keys and fake IO, never owner/Keychain material.
Cover keyless none/pending/ready, exact success, wrong chain, absent/high gas,
fee escalation, lost transfer/mint/receipt responses, one-tick receipt polling,
prepared journal ordering and actual CLI child-process cleanup.

Sole frozen31182 full gate PASS:4,825Vitest/214files/65.64s;
900Bun/60files/6,521assertions/170.50s; root/web strict; client361ms/SSR191ms.
17code/test pins unchanged;22-path/24-link scope/privacy audit before staging.
No full replay. No live key, grant, deposit, delegated spend, paid call, agent,
mainnet action or push.5C deployment/role/accounting preflight and owned live
proof remain next; runtime offline success does not consume those approvals.
