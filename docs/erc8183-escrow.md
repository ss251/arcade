# ERC-8183 escrow build status

**Not deployed. Not yet a built/advertised payment rail.** Task 6A adds the
receipt hook and tests against the unchanged approved upstream source. J6
deployment has two outstanding prerequisites: a deployable artifact and explicit
owner confirmation of the treasury. No key, transaction or testnet gas has been
used for this deployment.

## Reproduce

`git submodule update --init --recursive --jobs 1 --depth 1` materializes the
committed ERC-8183 gitlink and its pinned dependencies. Compile with Solidity
0.8.28, Cancun and optimizer 200; do not use an unpinned global compiler.

```sh
FOUNDRY_PROFILE=erc8183 forge test --offline -j 4
FOUNDRY_PROFILE=erc8183 forge build --offline -j 4 --sizes
```

The profile uses via-IR and isolated `contracts/out/erc8183` output. On the
approved [upstream pin](https://github.com/erc-8183/base-contracts/tree/142e669c1fd318486a4628395b629f033654dd06),
the first command's hook tests pass but the second **fails EIP-170**:

| Local compiler setting | Authorization runtime bytes | Limit |
| --- | ---: | ---: |
| Default legacy, optimizer 200 | 27,574 | 24,576 |
| Candidate via-IR, optimizer 200 | 26,167 | 24,576 |
| Command-only via-IR, optimizer 1 | 25,776 | 24,576 |
| Command-only Solidity0.8.36, via-IR, optimizer 200 | 26,363 | 24,576 |

The optimizer-1 experiment is not the saved profile. No code-size limit was
raised, no upstream code was removed, and no alternate source pin was chosen.
Local Foundry test deployment is not evidence that a normal chain deployment
will accept oversized runtime code. The deployer must refuse this before keys.

The read-only deployment entrypoint now makes that refusal concrete:

```sh
bun --no-env-file scripts/deploy-erc8183.ts --dry-run
bun --no-env-file scripts/deploy-erc8183.ts --check-build
```

Check-build exits2 with `artifact_oversized` for the current implementation.
It reads the already-built candidate artifacts and verifies source metadata;
it does not build, access RPC/Keychain, write a journal/config or broadcast.
An unsigned seven-step plan additionally requires explicit treasury and public
deployer-nonce arguments; that mode also refuses the current oversized artifact.
There is deliberately no live executor in this checkpoint. The later executor
must enforce bounded gas, durable hash-before-send journaling and independent
receipt/code/getter verification before writing deployment evidence/config.
Do not treat a command-line treasury argument as a substitute for owner approval.
See [Task6B status](superpowers/sdd/2026-09-06-J-arc-native/task-6b-report.md).

## Hook and refund semantics

`ArcadeJobHook` accepts callbacks only from its immutable escrow address.
Funding is gated on the immutable evaluator. Completion decodes the pinned
escrow's `(actor, reason, optParams)` wrapper and commits the four receipt-tree
fields in `ArcadeSettled`; rejection emits `ArcadeRefused` with the reason.
Malformed completion data rolls back all token transfers and status changes.
The event commits evaluator-supplied metadata, not independent off-chain truth.

The evaluator can reject Funded and Submitted jobs. A Funded job with no pending
claim can be refunded by anyone at expiry; Submitted jobs wait the existing
one-hour evaluation grace period. These are upstream rules, unchanged here.
Claims and alternate payout receivers remain upstream features, not supported
ARCADE rail promises. Rail verification must reject unsupported partial/payout
states before accepting a job.

The UUPS proxy is admin-upgradeable. Admin can pause, change fees, detach hooks
and emergency-withdraw while paused. A blocked token transfer (including the
treasury's fee) can revert completion. This differs from FeeSplitterV2's accrued
fee withdrawal; do not describe escrow as having that failure isolation.

Initialization already permits jobs without a hook. The plan's zero-address
whitelist setter is impossible on this pin (`ZeroAddress`); deployment must
verify `whitelistedHooks(0)`, then whitelist the actual hook.

See the [Task6 brief](superpowers/sdd/2026-09-06-J-arc-native/task-6a-brief.md)
and [verification record](superpowers/sdd/2026-09-06-J-arc-native/task-6a-report.md).
