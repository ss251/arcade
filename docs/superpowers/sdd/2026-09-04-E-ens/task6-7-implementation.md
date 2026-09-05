> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E6/E7 implementation — frozen for independent review

Owned: `packages/runner/src/ens.ts`, `src/ens-journal.ts`, `src/daemon.ts`, `test/ens.test.ts`, `test/ens-journal.test.ts`, `test/ens-daemon.test.ts`. No git staging/commits. Core/state helpers and Vitest alias were root-owned. No live RPC, external services, real keys, provisioning or payments. A fixed public unit-test signer is used only with in-memory fetch/socket fixtures; environment/Keychain never supplies it.

## TDD evidence

- 07:13:26 journal absent-module Red → 6 Green 07:14:42.
- 07:17:10 liveness/writer absent-module Red → combined 20 Green 07:19:43.
- 07:22:08 actual viem streamed-body cancellation Red (signal stayed un-aborted) → 21 Green 07:23:06.
- Short collection freeze permitted root E4 full gate and commit.
- 07:27:12 two real Reds: an overprivileged root-RENEW key and a connection lost during preflight both incorrectly broadcast. Both now refuse before sending.
- 07:28:38 three real Reds: altered transaction sender, destination, or calldata were accepted despite an apparently successful receipt/current state. Receipt plus transaction fields must now agree with journaled operation provenance.
- 07:31:15 six E7 Reds, including actual startDaemon reconnect/cancellation behavior, not merely extracted helpers → 35 combined Green 07:32:34.
- 07:34:58 genuine delayed-intent-checkpoint Red: an outer tick timeout was followed by a late broadcast when the checkpoint eventually resumed. The ticker now stops its writer on uncertainty; its next prebroadcast guard blocks the delayed send.
- Final 07:35:11: **101/101 focused tests**, then global `bunx tsc --noEmit` and `git diff --check` exit 0. Breakdown: 21 ENS writer/liveness + 6 journal + 6 daemon + existing 52 identity + 13 publishable + 3 agent announcement tests.

The ts-testing skill guided behavioral tests, TDD and isolated seams. Earlier global typecheck errors belonged to active E5 missing-module/Headers work; final global check is clean.

## E6 behavior

- Required EnsWriter/makeEnsLiveness/viemEnsWriter/RENEW_FRACTION interfaces are retained. Optional stop/connection guard and injected boundaries are additive. Real viem writer requires validated public state in its optional third argument: a private key alone is not authority to target arbitrary contracts.
- Single-flight ticks retain quarter-TTL state. Missing/invalid manifest prices never renew names; only currently gated skills are eligible. Only a valid confirmed result updates in-memory renewal/price metadata. Raw errors and logging failures cannot escape as public diagnostics/unhandled tick rejections.
- Scoped keys can keep **unexpired** names alive, but cannot revive expired names. Actual Sepolia timestamp and registry expiry are checked before writes. Expired names return `ens_owner_revival_needed` with no broadcast; no root role is granted and no register call exists. Existing root-RENEW authority is itself refused, even if an old state omitted owner provenance.
- 6-hour TTL / 4 means a 1.5-hour interval: **16 renewals/day/skill**, not the plan's four. Renewal stops for a skill removed from the gated manifest.
- State pins registry/resolver/name hierarchy and (when supplied) daemon identity. Daemon cannot equal seller or owner. Factory implementation provenance, current seller ownership, scoped RENEW grant, actual chain, simulation and uint bounds precede intent/send. setText is restricted to arcade.priceAtomic and known nodes.
- Real wallet and public clients have `ccipRead:false`: these are fixed contract operations, not universal ENS resolution. HTTP redirects and credentials are refused; full response bodies are capped at 128 KiB; JSON-RPC ID/version/result-error exclusivity are verified. Async-local cancellation scopes cover full wallet preparation and body reading, so a timed-out nonce/fee read cannot later progress to broadcasting. Closing stops active request scopes.
- No broadcast retries. Receipt polling is bounded. Success requires exact receipt hash/from/to/status, exact transaction hash/from/to/calldata for the journaled operation, and matching expiry/text readback. Known pending hashes can be reconciled by a new writer without re-sending; a confirmed older value is not silently accepted for a changed request.

## Durable restart boundary

- Default journal: `ens-pending.json` beside the configured ENS state, or explicit ARCADE_ENS_JOURNAL. Journal carries only public signer, chain, operation, target, resource, value, stage and hash—never a key or signed raw transaction.
- Exclusive cross-process directory lease spans the whole send/confirmation operation. Intent is fsynced before sending; known hash before confirming; confirmation/readback before completion. Files are private 0600, written to exclusive temporary files, fsynced, renamed and followed by parent-directory fsync. Memory follows successful durability. Existing files are bounded, regular, non-symlink, single-link and private; malformed/foreign data is refused.
- A crash-owned lock is not stolen or deleted automatically. Unknown no-hash intents and submitted transactions remain recoverable evidence, requiring explicit reconciliation rather than blind resend. The ticker pauses on uncertainty and stops its writer; restart can reconcile a known hash. No recovery CLI or automatic lock repair is introduced by this task.

## E7 lifecycle

- Runtime state is imported only through `@arcade/core/ens-state`; browser-safe core root stays free of IO exports.
- Absent state or no matching served skills is inert before even reading the daemon-key environment field. Malformed/unreadable state is diagnosed separately without guessing expiry. Missing/wrong key, seller mismatch and optional public provenance mismatch are fixed best-effort warnings.
- One ticker lasts for the daemon lifetime, preserving throttle across websocket reconnects. Disconnect disables its write guard and clears the timer; reconnect re-enables that same ticker. Guard checks run again after pending preflight and in the real transport. Ordinary jobs never await ENS initialization or ticks.
- Shutdown clears the reconnect timeout, heartbeat and ENS timers; stops the ticker; closes the owned websocket and hire broker. A late initializer is stopped without a first tick. Stale/closed socket events cannot re-enable ENS or start new assignments. Tests exercise actual startDaemon with an offline WebSocket boundary and real Effect cancellation, retaining ordinary signed Hello behavior.

## Remaining work outside this task

Independent review and ordered E5→E6→E7→E8 integration/commits belong to root. Live expiry/owner revival proof remains owner-gated and was not attempted. Tests demonstrate policy, durability, sequencing and lifecycle—not live Sepolia availability or funded-wallet operation.

## Narrow journal follow-up

07:56:12: two genuine Reds proved that a confirmed entry could downgrade to submitted with the same hash/value, and an explicit journal path could equal the default `$HOME/.arcade/ens.json` state path. Both guards are fixed. Tests inject a private environment object; they never mutate HOME. At 07:56:27, all 35 ENS journal/writer/daemon tests passed; global typecheck and diff check exited 0. The source is frozen again for independent review.

## Cross-operation restart follow-up

Independent review by B9 found that a pending price update or a later skill's renewal was never read when a restarted ticker requested its first renewal. The writer incorrectly required the retained operation/resource to match that immediate request.

- 08:05:52: two genuine Reds used real `makeEnsLiveness` + `makeEnsWriter` and actual private temporary journals. Both had zero reads of the retained transaction hash; 21 existing tests remained Green.
- The writer now validates every unconfirmed entry against the configured signer, Sepolia chain, exact operation target and any state-listed skill. It verifies factory provenance, exact receipt/transaction calldata and current readback before marking retained hashes confirmed. Unknown/no-hash or foreign-state entries remain manual-safe and are never resent.
- A later ticker request for the same confirmed operation/value re-proves its retained transaction instead of duplicating that price or renewal. A different requested value is handled as a fresh operation only after reconciliation and normal guarded preflight.
- 08:08:51: an additional genuine Red showed that confirmed-operation reuse must not bypass current ownership. Reuse now follows fresh proxy, ownership, expiry and scoped-role checks; transfer cannot turn a historical receipt into current liveness.
- Added negative checks for foreign pending signer/target/resource and forged cross-operation transaction sender/destination/calldata despite matching public text.
- Final 08:09:11: **40/40 ENS tests Green** (26 writer/liveness, 8 journal, 6 daemon); global `bunx tsc --noEmit` and `git diff --check` exit 0. Only runner `ens.ts`, its test and this report changed in this follow-up. No live network, keys, payments, configuration changes or git mutations. Frozen for B9/root review.
