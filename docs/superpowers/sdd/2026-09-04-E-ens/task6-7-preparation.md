> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E6/E7 preparation — source collection held pending E5 types

Scope authorized by root: runner `src/ens.ts`, `test/ens.test.ts`, `src/ens-journal.ts` plus journal tests, then `src/daemon.ts` and `test/ens-daemon.test.ts`. Do not create the core state/IO implementation. No active source or collected E6/E7 tests written yet.

Read: full E6/E7 plan and E5 state interfaces; current daemon lifecycle and D3 identity broadcast/receipt patterns. E3 full gate owns collection until release. No keys, live calls, state/config writes, or git mutations.

## Corrections that must be preserved

- The pinned PermissionedRegistry only permits **unexpired** renewal with a per-name RENEW grant. An expired name requires root RENEW for revival. Do not broaden the daemon grant; refuse expired names with owner-revival-needed diagnostics and no broadcast. The owner may explicitly revive later. Never automatically re-register.
- A 6-hour TTL with quarter-TTL cadence is one renewal every 1.5 hours: **16 renewals/day/skill**, not the plan's four.
- A skill absent from the currently gated dispatch set must not be renewed or receive a price update. Otherwise ENS liveness outlasts actual service.
- Arbitrary send errors and receipt timeouts are uncertain, not permission to send again next heartbeat. Durable intent/submitted state must survive restart; confirmed failure or a pre-broadcast-only read failure is distinguishable.
- A successful broadcast/hash alone is not confirmation. Require successful receipt, exact requested transaction hash, and matching on-chain expiry or text readback before marking publication/renewal complete.
- Closing the daemon must prevent later writes after a pending read or receipt wait resumes. A transaction already handed to the network cannot be cancelled; preserve its checkpoint and allow only bounded reconciliation.

## Proposed implementation boundaries

`makeEnsLiveness`: retain required interfaces and RENEW_FRACTION=4. Add a `stop()`/closed state without changing `tick()` or `lastRenewAtMs()`. Coalesce concurrent ticks into one in-flight promise. Copy and validate bounded state before use; handle invalid clocks/prices and throwing callbacks as fixed best-effort diagnostics. Check currently serving price before either write. Only a confirmed writer result updates memory. A failed operation cannot cause an unhandled rejection or leak a provider message.

`viemEnsWriter`: preserve `(privateKey, rpcUrl?)`, with optional injected public-client/wallet/journal seams for deterministic offline tests. Validate private key and RPC configuration without ever reflecting them. Use only Sepolia; actual `eth_chainId` before signing/broadcast, exact known state registry/resolver, chain-time expiry check, per-name grant check where available, uint bounds, only arcade.priceAtomic for text. No transport/broadcast retries. Receipt polling is bounded and resumable by hash. A known submitted entry is reconciled before any new intent; an unknown no-hash intent refuses automatic retries.

`ens-journal.ts`: explicit ARCADE_ENS_JOURNAL override; otherwise sibling of ARCADE_ENS_STATE. Versioned bounded entries carry only public chain/signer/operation/target/resource/value/hash provenance. Intent persists before send, hash before confirmation, confirmation/readback before completion. Exclusive directory lock, private 0600 temporary file, file sync then rename then parent sync; reject symlink/nonregular existing journal and malformed foreign JSON. Never overwrite the ENS state path. No automatic lock deletion/recovery after uncertain process failure.

`ensTickerFor`: optional environment/state-reader/writer seams; absent state/root/key is inert and does not derive or fetch with a key. State exists but key absent produces one fixed warning without claiming exact expiry. Expected seller must agree with state. Gated skills are the only price/renewal source. ENS initialization and ticks remain outside job settlement, and invalid optional ENS configuration cannot stop normal serving.

`startDaemon`: own a ticker lifecycle alongside socket heartbeat. Startup/close races must check closed state before starting and after async initialization. Clear timers and close ticker on disconnect/finalization; use a tracked reconnect timeout and socket reference so finalization cannot later reconnect or trigger another renewal. Preserve job protocol, public projection, identity announcements and existing auth behavior.

## High-value offline TDD matrix

1. First valid renewal, quarter-TTL throttle, canonical price change only, no payee/chain setter.
2. Missing gated skill is entirely inactive; malformed bigint/clock/state cannot write.
3. Two overlapping ticks share one write; one stuck writer is deadline-bounded; log callback throw cannot crash tick.
4. Stop during preflight or after first skill prevents every subsequent write/price update.
5. Wrong actual chain, expired state, unreadable expiry/grants, invalid target/value and wrong key provenance fail before send.
6. Receipt hash/status/readback mismatch does not mark renewal successful; raw error text is redacted.
7. Journal failure before intent prevents broadcast; failure after send retains recovery hash/intent and never resends.
8. Restart with known pending hash polls only that hash; restart with no-hash intent refuses; old pending value cannot be silently accepted as the new requested value.
9. Concurrent journal handles, malformed/oversize/symlink paths, fsync/rename failures and privacy modes.
10. Missing state/key remains keyless, startup failure is best-effort, and actual daemon close/reconnect lifecycle has no lingering timer or post-close write.
