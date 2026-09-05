> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D4 — durable seller identity configuration

Adds optional public identity and pending-registration disk records; old configurations hydrate to empty maps. Runner configuration remains keyless, drops derived socket and unknown fields on write, and preserves unrelated skills during serialized read-modify-write operations. Explicit ARCADE_CONFIG_PATH isolates harnesses without changing HOME. The C10 harness now constructs a typed RunnerConfig with agents:{}.

Cross-process exclusive directory locking, restrictive temporary-file permissions, file fsync, atomic rename and parent-directory fsync complete before successful checkpoint return. A failure refuses the caller; if replacement already happened, its pending journal remains to prevent automatic re-minting. Stale locks are not stolen. Known registration hashes may only upgrade the matching pre-broadcast intent. Confirmations cannot clear an unrelated or unknown-hash journal, and existing confirmed identity/provenance is immutable while approval metadata can be updated.

TDD: missing pending helper Red04:45 ->6 Green04:46; missing begin helper Red04:49 ->7 Green. Independent review found missing crash-durability and identity-provenance protections. Three actual behavioral regressions failed before the fixes (no fsync calls; mismatched pending accepted; existing identity overwritten), then11 Bun tests passed including real FileHandle sync observation, injected file/directory flush failures, concurrency and unchanged-file refusals. TypeScript and diff check passed. Fullgate and final independent review tracked in progress.md.

No owner configuration, HOME, Keychain or chain touched. Only uniquely created test directories are removed after tests.
