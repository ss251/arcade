> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E14 implementation checkpoint — frozen for priority change

Scope: `scripts/ens-demo.ts`, `scripts/ens-demo.bun.test.ts`, additive buyer Promise exports in `packages/buyer/src/index.ts`, and `packages/buyer/test/promise-api.test.ts`. Parent separately authorized C1's `scripts/ens-demo-cli.bun.test.ts`. Root owns docs and all staging/commits. No git mutations, real key retrieval, live RPC, wallet broadcasts, owner configuration writes, or ENS service changes were performed by this task.

The complete E14/15 plan and approved preparation note were read. `ts-testing` drove behavioral Reds and real SDK/viem codec tests. Pinned official contracts-v2 source was read through agent-reach during preparation. No hidden direct Effect dependency was added to scripts: approved Promise wrappers preserve the original typed Left and success data inside the buyer package.

## Implemented behavior

- Import-safe main and key-free help; explicit beat and exact name. `price-lock`/`all` require separate matching `--confirm-name`. No default `all`, no automatic runner stop, recovery, regrant, or resend.
- Price-lock binds one state-listed name and deterministic +1000 atomic price change. Invalid/zero/overflow prices and colliding roles refuse early. Current Sepolia registry hierarchy/proxy implementation, live leaf owner/expiry, exact resolver, alias absence, and all seven known record scopes are independently read. Raw roles match setup's narrow policy, including admin bits. Only the six known non-price routing/context records are snapshotted; no guessed dynamic agent-registration key.
- Existing durable daemon writer performs one price write; separate owner setup journal performs one exact scoped revocation. Both transaction hashes are independently correlated with successful receipts, exact signer/to/calldata/value/chain, matching block/index coordinates, and strict nonremoved log provenance. Retained uncertain outcomes are never resent.
- Permission-denial proof accepts only real viem `ContractFunctionRevertedError` decoded against the pinned ABI, then exact error bytes for the name-level resource, SET_TEXT16 and daemon. A provider's prose or arbitrary nested data is not evidence.
- Tampered-402 uses the actual buyer SDK and synthetic injected wrong-payee/wrong-chain challenges. Sentinel signing calls remain zero, as do paid retries. Output explicitly labels the challenges synthetic; this is not settlement proof.
- Expiry uses an initially live chain/name/matching-catalogue baseline and actual successful Sepolia block timestamps. Passive expiry must retain token/latestOwner and increment the low32 resource version exactly; nondecreasing expiry rejects premature unregister. Same-height block/hash changes are refused. Parent mounts must remain live. Only successful hardened absence plus seller-matched catalogue absence passes; detail404 reports cause unproven, exact detail200/ensExpired supports the stronger observation.
- A safe `expiry-baseline` progress event is emitted to CLI stderr only after the live baseline, before polling, so the owner can intentionally stop only their own renewal process. The script never does so.
- Four-wide readonly batches, 30s snapshot/inspection bound, <=25min overall deadline, bounded RPC/body readers and explicit abort propagation. Abort-aware waits include state IO. Late-opened sessions close before writer construction. Cancellation and finally share the exact close promise; bounded cleanup retains failures for manual reconciliation.

## Runtime interface / environment

`runEnsDemo(args, env, options)` has offline state/reader/chain/transport/driver/clock/signal seams; production defaults use the already-hardened real clients and durable drivers.

CLI: `bun --no-env-file scripts/ens-demo.ts <price-lock|tampered-402|expiry|all> --name <name> [--confirm-name <same>] [--timeout-ms 1000..1500000] [--poll-ms 1000..30000]`.

State: `ARCADE_ENS_STATE`, default runner state path. Public optional `ARCADE_ENS_RPC`, `ARCADE_HUB` (must exactly equal resolved endpoint origin), `ARCADE_ENS_CCIP_ORIGINS`. Only consented price beats read `ARCADE_ENS_OWNER_KEY` and `ARCADE_ENS_DAEMON_KEY`, after public checks and collision checks. Owner journal `ARCADE_ENS_DEMO_JOURNAL`, default `${statePath}.demo.json`; daemon journal `ARCADE_ENS_DEMO_DAEMON_JOURNAL`, default `${statePath}.demo-daemon.json`. Protect state/setup/default daemon journal plus explicit/default owner config paths from collisions.

## TDD and checks

- Initial true Red: missing Promise functions and demo module, 09:34:41 IST; initial 3 Vitest +4 Bun Green, 09:36:22 IST.
- 2026-09-05 04:17:38 UTC: missing production proof exports Red.
- 04:18:43 UTC: genuine same-height mixed-block expiry Red, fixed.
- 04:20:25 UTC: genuine malformed removed-log marker Red, fixed alongside exact indexes and log shapes.
- 04:21:11 UTC: missing runtime/observation export Red.
- 04:24:53 UTC: actual root RENEW bitmap regression Red; fixed to core constant.
- 04:28:56 UTC: zero/overflow price reaching RPC Red; fixed before public/key/journal work.
- 04:30:58 UTC: raw admin authority and missing owner-baseline cue Reds; fixed.
- C1 04:32:44 UTC: two genuine actual-child deadline/abort Reds for pending state read; fixed with abort-aware orchestration.
- 04:35:37 UTC: genuine overlapping cancel/finally close Red; fixed with shared close promise and bounded late-open cleanup.
- Final focused command started 04:36:23 UTC: 28 helper/runtime Bun +6 actual CLI Bun, 4 buyer Promise Vitest; global `tsc --noEmit` and `git diff --check`. See parent handoff for final command completion.

Coverage added after already-correct code (for example actual Promise success shape and some key-free/refusal cases) is explicitly coverage, not represented as a genuine Red. Fake finite expiry and write-driver fixtures are offline simulations; real SDK/signature and viem error codecs use fixed unfunded test keys or a non-signing sentinel, never a funded account.

## Freeze / remaining authority

User priority changed to A9 → C10 → D13 live evidence → B13 proxy. This E14 source is frozen for root review/staging later; no further collection or source expansion by this agent. ENS keys being present does not authorize use: Sepolia funding and exact parent-label selection remain OWNER-pending. No ENS writes were attempted or claimed. Root/C1 may still report read-only findings. Full repository gates and an eventual E14 commit remain root-owned and have not been claimed complete here.
