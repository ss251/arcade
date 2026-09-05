> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# B13 free-route implementation checkpoint (frozen, 2026-09-05)

Priority changed to ENS live before B13; this is an uncommitted, focused-green checkpoint, not live GLM evidence. No proxy call, external provider request, real key access, git mutation, or wallet operation was performed.

## Implemented slice

- `skills/diff-triage/arcade.json` and `skills/counterparty-brief/arcade.json`: exact `glm-5.3-flash` override, explicit `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` secrets, truthful loopback egress declaration. Public projections remain model/credential/private-route free. Existing prices, bounds, adapters, capabilities and schema are unchanged.
- `packages/runner/src/engines/claude-api.ts`: exact zero-token-rate alias only; unknown models still fail closed, known/unknown server tools remain separately priced. Final submit now undergoes cost/token/tool ceilings before completion.
- `packages/runner/src/engines/harness.ts`: explicit manifest model overrides module default; absent override preserves module model and every other setting.
- `packages/runner/src/exec.ts`: every Bun-launched child uses `--no-env-file`, preventing a skill-local `.env` from refilling the scrubbed environment.
- Focused tests in `claude-api.test.ts`, `harness.test.ts`, `exec.test.ts`, `demo-listings.test.ts`; new `free-route-api.bun.test.ts` uses the real Messages SDK with an owned loopback simulated provider and actual script child with a dummy `.env`.
- C1 separately changed `claude-agent.ts` and `claude-agent.test.ts`: per-job scratch config, no ambient settings/session persistence, default-deny tools and finite owned CLI cancellation/reaping, final reported-cost guard. See C1's report for its precise checkpoint; actual bundled SDK transport is still pending.

## Genuine Red / focused Green

- 04:50:21 UTC: 9 new failures / 57 passing. Demonstrated final-submit ceiling bypasses, unpriced free alias, stale manifest selection, and real harness subprocess ignoring the model override. The subprocess used an explicit fake SDK, not live model traffic.
- 04:52–04:53 UTC: actual child loaded both dummy undeclared `.env` values before the fix; real Messages tests made zero requests because the alias was rejected. Initial sandbox listener denial was infrastructure, then the owned-loopback run captured the genuine behavior.
- 04:53:08 UTC: server-tool free-alias cases and no-dotenv command regressions failed before implementation (10 failing / 39 passing in the two-file run).
- 04:53:47 UTC: 114 Vitest passed across claude-api, demo listings, harness, exec, engine-config and skill-engine.
- Real SDK Messages loopback tests: 4 Bun passed / 25 assertions, including submit, refusal, provider HTTP400 and actual dotenv isolation. Repeated after a type-only callback-capture correction; final run green.
- C1 reports 6 SDK-safety genuine Reds at 04:52:25 → 24 claude-agent Vitest green at 04:53:46.
- Global `bun --no-env-file run tsc --noEmit`: exit 0 after the final test capture typing correction.

## Remaining before live/review

1. Independent review of the frozen SDK lifecycle changes, plus actual bundled Agent SDK loopback Messages/SSE/StructuredOutput proof for the free alias. No such new test file has been created yet; no descendant-request cessation proof has been claimed.
2. Full repository gates and root's ordered review/commit.
3. Only after explicit release: root-owned isolated no-wallet/no-hub B13 live run against the existing proxy8317 using the Keychain proxy key. Do not restart the proxy, use a subscription credential or send Claude aliases to it.
4. Native Agent SDK cost remains SDK-reported and is not independently verified free-provider billing. The exact local zero table only applies to the direct Messages engine.
5. `counterparty-brief` server-side web-search support remains unproven. The actual B13 evidence case uses `diff-triage`; do not remove capabilities or reinterpret failures as success.
6. The shell wrapper itself remains unchanged; root should launch the evidence with explicit `--no-env-file` and purpose-specific env. The child correction does not claim OS filesystem/network isolation.

All source and tests are now frozen pending root release. E14 work in the separate E worktree remains untouched.
