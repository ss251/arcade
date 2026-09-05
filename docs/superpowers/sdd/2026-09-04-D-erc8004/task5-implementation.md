> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D5 implementation handoff — frozen

## Scope

- Added `apps/hub/src/agent-registration.ts` and `apps/hub/test/agent-registration.test.ts`.
- Added focused actual HTTP tests in `apps/hub/test/agent-registration-http.test.ts` with `fixtures/agent-registration-http-preload.ts`.
- Changed `apps/hub/src/store.ts` only to add ListingRecord's four optional fields: `agentId`, `registrationTx`, `agentVerified`, `ensName`.
- Changed `apps/hub/src/server.ts` only for the always-provided ERC-8004 layer/runtime tag and the two D5 GET routes/imports.
- No runner/config, core, payment-path, CLI, protocol, commits, staging, keys, or live chain changes.

## TDD and verification

- 2026-09-05 05:06:08: genuine missing-module Red for the helper. HTTP initially could not bind loopback under the sandbox; that was not counted as product Red.
- 05:06:32: approved offline loopback run reached actual server and showed missing discovery route failures.
- 05:07:04: separately verified BOTH actual registration and discovery routes returned 404 rather than expected 200 before implementation.
- 05:08:23: focused Green, 15/15 tests (12 helper, 3 actual HTTP). `bunx tsc --noEmit` and `git diff --check` passed.
- Command: `bunx vitest run apps/hub/test/agent-registration.test.ts apps/hub/test/agent-registration-http.test.ts`.
- No full suite run by this agent. Root owns full gate and ordered commit.

## Behavior and deliberate compatibility corrections

- `agentRegistrationFor` lives in the separate pure module requested by root, not the plan's service module. It has no environment/key reads or HTTP imports.
- Current ERC registration-v1 fields plus prior aliases come from the D1 builder. Only existing x402, OpenAPI, and web routes are advertised; no phantom HTTP MCP route or image URL.
- Known `agentId` passes through without inventing one before mint. Optional ENS passes through. Internal record fields and provider/private extras are not serialized.
- `active` requires this exact runner ID, same seller (case-insensitive), the listing in that runner's skill IDs, safe nonnegative timestamps, non-future/fresh heartbeat with strict expiry, and no canary delisting. It is derived per response rather than stored.
- `GET /erc8004` manually projects public registry and role addresses when armed; unarmed response is `{armed:false,chainId,caip2}`. Keys and service/provider objects never leave the process.
- `GET /listings/:id/agent-registration.json` precedes the existing listing-detail matcher, uses `docBytes` and `cache-control: public, max-age=30`, and returns JSON 404 for unknown listings or absent chain registry. Unarmed signing feature does not suppress available registry metadata.
- Runtime always gets `Erc8004Tag`; missing keys disable only the feature. Existing chain boot checks, canary runtime, routes, and paid path are unchanged.
- HTTP fixture uses real Bun routing, an Effect in-memory store, synthetic public role metadata, explicit child environment, loopback port 0, and process cleanup. Child outbound fetch is blocked. No real private keys or model/network/chain calls were used.
- ts-testing guided real public behavior assertions, exact document bytes/hash checks, current liveness/privacy cases, and existing Vitest conventions. The unavailable Context7 routing did not cause a fabricated lookup; runtime wiring follows the installed Effect patterns already in this server.

Root commit subject: `feat(hub): serve agent-registration.json and publish the ERC-8004 key addresses`.
