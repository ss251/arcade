# ERC-8183 escrow build status

**Not deployed or live-enabled. Explicit hub/runner composition is implemented.** Task 6A adds the
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

## Root request ownership (offline implementation, not yet an active rail)

A public jobId is not payer authority. The buyer generates a fresh32-byte
capability and calls escrowRequestDescription with the trusted challenge,
listing/request context, its client address and absolute job expiry. The
on-chain description is a versioned hash commitment, not the raw secret.
The private budget request and funded retry carry payload:

```json
{"jobId":"123","capability":"<private 32-byte hex capability>"}
```

The hub reconstructs the description using the current listing and actual
input. It must not trust caller-provided payer, price, input hash or other
echoed metadata. The commitment binds chain/deployment, token/provider/agent,
client/amount, resource/method, listing/version, input hash, timeout and expiry.
Existing hashJson commits JSON property order; the buyer must preserve its
input across commitment and retry. Keep the capability out of public logs,
receipts/evidence and chain records. A contract-wallet client can use this
proof without a new EOA signature; live Circle escrow proof is still pending.

The new reader checks pinned code, implementation slot, domain, hook/fees and
job facts at one finalized height and independently rechecks that block hash.
The configured identities must come from verified deployment evidence, which
does not yet exist. A fresh snapshot or correct capability does not replace
durable once-only admission or guarded hash-before-send journaling. No escrow
rail is advertised until those pieces and deployment prerequisites are ready.
See the [J7B1 record](superpowers/sdd/2026-09-06-J-arc-native/task-7b1-report.md).

## Settlement commitment and proof (offline contracts)

The hook receiptHash commits the versioned pre-settlement projection produced
by escrowCompletionProjection. Persist its exact bytes before complete. It
includes the request identity, output hash, price, floor-rounded fee and tree,
but excludes settleTx and later terminal/attestation fields to avoid a circular
hash. It is not the hash of the final Receipt document. Confirmed Submit output
must match this projection before completion is allowed.

The action evidence checks require a recovered exact transaction intent,
separately fetched mined transaction, successful receipt, exact token/escrow/
hook logs and an identity-checked job snapshot at that canonical finalized
receipt block. readJobAt can obtain historical facts, but cannot replace
fresh readJob authority before a send. The full-job source keeps settledAmount
zero on complete/reject; it is partial-claim accounting, not a terminal flag.
Fee flooring can legitimately produce no PlatformFeePaid event at tiny prices.

The guarded action coordinator, private SQLite journal and concrete bounded
Arc RPC/signing ports are implemented and tested offline. The subsequent J8
admission and explicit boot are described below. The journal retains uncertain action
and evaluator ownership across restarts and does not automatically replay sends
or reverse them with reject. All cooperating workers must share one private
journal; this does not control other programs using the evaluator key.
No hash-only settlement or live rail activation is supplied by these helpers.
See the [J7B2 proof record](superpowers/sdd/2026-09-06-J-arc-native/task-7b2-report.md)
and [J7B3a coordinator/storage record](superpowers/sdd/2026-09-06-J-arc-native/task-7b3a-report.md),
plus the [J7B3b transport verification](superpowers/sdd/2026-09-06-J-arc-native/task-7b3b-report.md).

Separate closed escrow payload/requirements codecs and generic rail contracts
now represent the capability and explicit request/receipt context without
altering exact-payment schemas. The explicit Effect factory and dedicated
Erc8183Tag now compose the guarded executor with the shared durable journal.
Verification discards capabilities, brands results privately and checks EOA
provider code at the canonical job snapshot. Settlement requires actual hub
job/output/tree context and retains full monetary proof. J8 adds explicit hub
activation and atomic admission below; buyer lifecycle/live proof remain pending.
See [J7B4a wire decisions](superpowers/sdd/2026-09-06-J-arc-native/task-7b4a-report.md)
and [J7B4b rail verification](superpowers/sdd/2026-09-06-J-arc-native/task-7b4b-report.md).

Task8 begins with closed socket contracts for budget/submit requests, signed
replies and fixed refusals, plus lossless decimal-string context conversion.
No capability is sent to the runner. Messages are data, not authorization:
runner-side checks, socket-bound correlation and hub admission are still
required before these contracts can trigger work. See the
[J8A record](superpowers/sdd/2026-09-06-J-arc-native/task-8a-report.md).

## Explicit hub/runner configuration (offline implementation, no deployment yet)

The [J8 boot record](superpowers/sdd/2026-09-06-J-arc-native/task-8d5-report.md)
composes durable admission/terminal receipts, closed trees, authenticated provider
messages and the actual escrow pipeline. Do not arm it with Circle's reference
contract or guessed addresses. J6 must first produce a deployable, owner-approved,
independently verified ARCADE deployment. No such configuration was installed.

Hub opt-in requires both `ARCADE_ESCROW_CONFIG` and `ARCADE_ESCROW_JOURNAL`,
with explicit absolute canonical paths. Also supply `ARCADE_DB`, a bare
`ARCADE_PUBLIC_URL` origin, a stable `ARCADE_HUB_SECRET` of at least32characters
and at most4096UTF8bytes, and the approved evaluator key as
`ARCADE_FACILITATOR_KEY` inside the consuming process. Never put keys in the
public JSON, logs, source or command arguments. There is no ephemeral evaluator
or escrow RPC/address/treasury fallback. Escrow is Arc-only and cannot arm with
the offline test default; existing exact/session/provider validity limits remain.

Public JSON has exactly four fields: `identity`, `gasCapWei` (positive canonical
decimal string, explicitly owner-budgeted per action), `expiresInSeconds` and
`operationTimeoutMs`. Identity has exactly `chainId`, `escrow`, `implementation`,
`hook`, `evaluator`, `treasury`, `token`, `proxyCodeHash`, `implementationCodeHash`,
`hookCodeHash`, all from independently verified deployment evidence. Job expiry
must cover the listing timeout plus the existing600seconds; operation IO uses
the existing1–300000ms range and separate bounded per-request cleanup. These
settings are not permission to widen any payment authorization window.

Config must be an owned single-link regular file, not group/world writable,
≤32768bytes. DB/journal parents must be owned0700; the action file is owned0600.
All paths, including SQLite sidecar names, must be distinct and nonsymlinked.
Retained action sidecars cause refusal: investigate, do not delete/recover them
as a retry strategy. Journal ownership must be shared by cooperating workers;
it does not control unrelated software spending from the same evaluator key.

Runner opts in separately with `--escrow-config` and `--escrow-journal`. Its
public JSON contains exactly the same full `identity` plus `operationTimeoutMs`;
its private provider signature journal is distinct from the hub action journal.
Runner signs only for its original hub socket/current listing/completed output,
using the existing fixed600-second provider authorization deadline. It does not
broadcast. Hub signal shutdown awaits request/action/job cleanup before journal
release; ordinary restarts never replay uncertain actions or inference.

The budget endpoint accepts exactly `{input,payment}` with the closed J7
capability envelope, not a bare jobId. It returns budget/token/escrow/budgetTx
and `fundBy = expiredAt - timeoutSeconds - 600`; the buyer must independently
check facts before funding. Root retries require still-funded verification;
retain the issued result token for terminal retrieval. See the
[HTTP contract and limits](superpowers/sdd/2026-09-06-J-arc-native/task-8c2-report.md).
Generic discovery exposes listing opt-in but cannot invent a signable input
commitment. Task9 buyer lifecycle and Task10 live proof remain pending.

The [J9A buyer checkpoint](superpowers/sdd/2026-09-06-J-arc-native/task-9a-report.md)
adds offline pre-create identity reads and locally pinned request/price/expiry/
gas intent. It prepares exact create/approve/fund calldata but cannot sign/send.
Arc's native gas and ERC-20 USDC share one balance: reserve six-decimal principal
converted to18decimals plus the remaining total gas budget together. Exact-price
approval from zero allowance is required; no implicit unlimited grant or reset.
The private durable executor and actual SDK integration are still pending.
