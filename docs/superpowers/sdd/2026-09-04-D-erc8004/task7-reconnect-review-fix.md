> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D7 reconnect review follow-up

## Scope and independent finding

Read-only review found that the new old-socket teardown guard left withdrawn skills in both the public listing store and the broker's additive routing map. A replacement could receive work for skills it did not announce. Root identified the adjacent runner-ID-only JobResult/Heartbeat authorization, which let the superseded socket still affect successor jobs and liveness.

Owned follow-up files only: `apps/hub/src/server.ts` Hello/WebSocket handlers, `apps/hub/src/broker.ts`, their focused broker/Hello tests, and the existing Hello preload fixture. No paid pipeline, identity, registry service, config, or attestation edits.

## Genuine TDD evidence

- 2026-09-05 05:41:05: broker route-refresh regression failed. Actual socket tests could not start because the default sandbox disallowed loopback listeners; an isolated owned Bun port-0 probe reproduced the same listen failure. This was an environment refusal, not application Red evidence.
- 05:42:22: approved offline loopback run produced **5 genuine failures / 13 pass**. Withdrawn listing returned 200 instead of 404; old pending job remained after replacement; superseded socket completed successor job with `source: old`; same-socket refresh retained its withdrawn route; broker route replacement regression failed independently.
- 05:43:48: after the bounded fix, **55/55 focused tests passed** (21 protocol, 13 claim, 3 daemon, 9 broker, 9 actual Hello). `bunx tsc --noEmit` and `git diff --check` passed.
- 05:45:05 final focused compatibility run: **74/74 passed** across eight D7/registration/broker/secrecy files. A concurrent new D13 test then made the repeated workspace typecheck fail only in `scripts/e2e-erc8004.bun.test.ts`: missing not-yet-created `./e2e-erc8004.ts` and an `AgentRegistrationInput.listing` fixture mismatch. No D7 diagnostics. The earlier 05:43:48 full workspace typecheck was green; root must rerun the complete gate after D13 is green.

## Fix and safety

- Broker registration replaces that runner's route set instead of adding indefinitely; routes belonging to other runners and current in-flight assignments remain untouched.
- The Hello registration lock removes that runner's prior listing snapshot before publishing the new one. A true socket replacement first unregisters its old broker connection, failing old pending jobs with `RunnerDisconnected`, then registers the successor. Same-socket refresh does not unregister and retains its active-job count and pending jobs.
- JobResult and Heartbeat now check current socket identity, open membership, and runner ownership inside the same registration/teardown lock. A reused runner ID is not enough to authorize a stale socket.
- The fixture uses the real broker and server WebSocket handlers; stdin-controlled dispatch/state reads are test-only and do not touch the paid pipeline. Handler-completion markers provide deterministic message barriers. Only complete stdout lines are parsed.
- Tests use owned loopback processes, an ephemeral unfunded signing fixture, cleared child environment, no Keychain, no external network, and no chain transactions. All owned child processes are stopped during cleanup.
- Existing v2 signatures and ownership checks remain unchanged. No staging or commits performed. Root owns the final full gate and ordered D7 commit.

The ts-testing skill guided behavioral regression-first coverage and reuse of the existing Vitest/real-socket fixture stack.
