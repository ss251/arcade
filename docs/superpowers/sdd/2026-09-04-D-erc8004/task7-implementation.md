> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D7 implementation handoff — frozen

## Scope

- `packages/core/src/protocol.ts`: exported `AgentAnnouncement`, shared `MAX_AGENT_ANNOUNCEMENTS = 64`, optional bounded `Hello.agents`.
- `packages/runner/src/daemon.ts`: explicit public projection of agent identities for currently served listings, plus small tested `agentAnnouncementsFor` helper. Older configurations without `agents` remain valid.
- `apps/hub/src/erc8004.ts`: added `verifyAgentClaims` only; existing service behavior remains unchanged.
- `apps/hub/src/server.ts`: Hello claim integration and connection-generation/current-socket registration/teardown guards only. No paid branch, broker implementation, digest, D6 identity CLI/config, or D8 attestation edits.
- Added `packages/core/test/protocol-agents.test.ts`, `packages/runner/test/daemon-agents.test.ts`, `apps/hub/test/erc8004-claims.test.ts`, `apps/hub/test/erc8004-hello.test.ts`, and its test-only preload fixture.

## TDD evidence

- 2026-09-05 05:21:27: 32 failures before protocol/helper implementation (missing exports and previously ignored invalid announcements); 2 pre-existing compatibility checks passed.
- 05:22:28: protocol + claim helper 34/34 Green; tsc Green.
- 05:25:35: daemon missing helper and actual server missing identity integration failed. Existing old-Hello compatibility passed. Also reproduced old authenticated close deleting the new runner.
- 05:26:17: after minimal claim wiring, three actual WebSocket race regressions failed for the intended reason: closed delayed Hello resurrected its listing, slower earlier Hello published after a newer connection, and old close removed replacement state.
- 05:29:23: 42/42 new D7 checks Green after connection guards; tsc/diff Green.
- 05:31:57: additional genuine Red for an authenticated socket switching runnerId, which otherwise orphaned its previous runner on close.
- 05:32:44 final Green: 70/70 tests across eight files (43 new D7 + existing registration, broker, and secrecy suites). `bunx tsc --noEmit` and `git diff --check` passed.
- Final command: `bunx vitest run packages/core/test/protocol-agents.test.ts apps/hub/test/erc8004-claims.test.ts packages/runner/test/daemon-agents.test.ts apps/hub/test/erc8004-hello.test.ts apps/hub/test/agent-registration.test.ts apps/hub/test/agent-registration-http.test.ts apps/hub/test/broker.test.ts packages/core/test/secrecy.property.test.ts`.
- Root owns full suite and ordered commits. This agent did not stage, commit, access keys, send chain transactions, or call external models/providers. WebSocket tests use an ephemeral unfunded signing fixture, actual Bun loopback routing, real signed v2 Hello messages, and offline injected ownership reads.

## Contract and correctness details

- `helloDigest` is unchanged at v2. Old Hello messages still handshake against the real server.
- Announcements require current core `SkillId`, canonical decimal uint256 agentId, and exact 32-byte hex transaction hash. Maximum 64 claims. Extra private fields do not cross the wire.
- The helper revalidates injected plain objects using own property descriptors and the same schema before any IO. Accessors/inherited fields are refused without invoking them. A malformed batch causes no ownership read.
- Ambiguous duplicate skill claims are all dropped. Server filters to actually announced listing IDs BEFORE calling the verifier; unannounced claims cannot amplify reads.
- Ownership is checked sequentially, cached once per unique agent within a Hello, capped at 16 unique reads, 1 second per read and 5 seconds overall. Excess/deadline/unavailable claims remain explicitly unverified. A valid different owner is dropped; malformed/unreadable responses never count as proof. Provider causes, sync throws, and defects do not leak. External interruption is preserved.
- IMPORTANT: `registrationTx` is announced metadata; `ownerOf` verifies ownership only, not that transaction. Future UI/evidence must not claim the mint hash was independently checked.
- `latestHellos` is reserved only after signature and existing listing/runner ownership checks. Sequence/current-socket checks run after asynchronous verification and again inside registration's critical section. Existing listing ownership is rechecked before mutation. Old close callbacks act only on the socket that still owns that runner ID.
- Closed sockets are marked closed before cleanup awaits, preventing delayed verification from resurrecting them. Registration and teardown serialize broker/store mutations. A socket cannot change its already-authenticated runner ID; same-ID refresh remains compatible.
- D5 registration metadata is unchanged and receives the recorded agentId through existing ListingRecord fields.
- ts-testing guided behavioral protocol, privacy, daemon projection, deadline, and real WebSocket race regressions. Existing installed Effect semaphore patterns/types were inspected; unavailable Context7 was not represented as a successful lookup.

Root commit subject: `feat: announce ERC-8004 agent ids in Hello and verify them with ownerOf`.
