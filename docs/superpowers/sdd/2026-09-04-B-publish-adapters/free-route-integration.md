# B13 free-route integration — September 5, 2026

This dated follow-up supersedes the earlier frozen implementation checkpoint only
where explicitly stated. The original reports remain unchanged. The full live
three-adapter run has now passed; the separate local fixtures are still not live
model, schema-validation or payment proof.

## Task brief and decisions

Use the owner-selected API-key route at loopback port 8317 with exact model alias
`glm-5.3-flash`. Do not restart or reconfigure the shared proxy, send Claude model
aliases to it, use a subscription credential, or remove capabilities/change adapters
to force a successful demonstration. Load the proxy key only inside the finite live
command. No wallet or hub is needed for local adapter execution.

The manifest model override must reach both module-backed and SKILL.md engines.
Only explicitly declared environment names reach the harness, and Bun children
must not repopulate that environment from dotenv. Exact zero-token pricing applies
only to the direct Messages engine's explicit alias; server-tool costs and unknown
model refusal remain. Native SDK accounting is SDK-reported, not independent
provider billing. Failed envelopes reporting zero do not establish zero spend.

The real native CLI forwarded a dummy credential across an HTTP redirect during
testing. Its installed SDK offered no request-transport override, so the custom
API-key lane now uses a bounded per-job loopback guard. Native receives only a
random local capability. The guard binds the exact model/tools/upstream, refuses
redirects/retries and uncertain resends, and closes with the owned job. It buffers
at most 4 MiB before delivering unchanged SSE/JSON bytes: actual Bun tests proved
that an outgoing stream error could otherwise become a successful partial 200.
Delivery is delayed; this is not a new shared proxy or a claim of universal OS
network isolation. Default vendor and subscription routes are not silently rerouted.

## Review and integration evidence

- [Messages API and relay review](free-route-api-review.md): actual installed SDK
  with simulated loopback providers; 7 wire tests / 41 assertions, 22 relay tests /
  84 assertions, strict accounting and completion checks, independent source review.
- [Native SDK follow-up](free-route-agent-followup.md): 66 unit tests and 7 actual
  `execSkill → harness → SDK → bundled CLI` cases / 93 assertions. The final
  identity-encoding relay passed in 18.04 seconds. Fixtures explicitly constrain
  outbound networking to loopback and deny personal-home/Keychain access on macOS;
  other platforms skip this OS-specific proof rather than claim it.
- [Shell boundary follow-up](free-route-shell-followup.md): 32 tests, including a
  real nested-Bun dotenv regression and independent review. Preview calls use the
  direct CLI source; package-script nesting would reload dotenv.
- 14:05:10 IST: the combined focused suite exposed three stale fake-provider
  results missing mandatory usage counters and `is_error: false`. The fixture now
  emits those protocol fields; all assertions and production checks are unchanged.
  At 14:06:07, all 216 combined focused tests passed, followed by strict TypeScript.
- The first whole-suite attempt ran inside the restrictive host sandbox: local TCP
  and Unix socket creation returned EPERM. It exited 1 after 174.50 seconds (15
  failed files, 84 failed tests, 50 reported errors). This was not a green gate.
  Separately, two OpenAPI roundtrip shims genuinely expected the previous Bun argv.
  Their exact guards/preload insertion now retain `--no-env-file`; all three
  roundtrip tests passed at 14:11:52 with unchanged assertions.

- 14:12:48 IST: the first elevated whole-suite run found one stale private-preview
  assertion (2,144 tests passed). Its exact secret-name array now includes the
  intentionally declared `ANTHROPIC_BASE_URL`; the public projection still must omit
  engine and secrets. All 13 actual CLI tests passed at 14:14:22.
- The repeated elevated gate starting 14:15:21 passed **2,145 Vitest tests**, then
  **249 Bun tests / 1,346 assertions**, followed by strict TypeScript. Local sockets
  were permitted; command-local supported Vitest four-worker limits were used.
  No repository timeout, assertion or test selection was weakened.
- `2ea0f56`: first atomic follow-up, dotenv-boundary source and regression tests.
- `c682ae6`: manifest overrides and direct Messages route/accounting/transport.
- `c6f6676`: native API isolation, per-job guard and actual bundled-CLI regressions.

All three commits passed a separate repeated full test/TypeScript gate before
commit. They were promptly fast-forwarded into main without squash. The main gate
starting 14:21:54 IST passed 2,145 Vitest tests, 249 Bun tests / 1,346 assertions,
strict TypeScript, the web build and all 16 Forge tests. No push occurred.

## Full live execution — PASS

Observed execution window: **2026-09-05 08:56:14–08:57:28 UTC** on main `c6f6676`.
The actual `scripts/e2e-publish-adapters.sh` ran with no `--only` selection and exited
0 after its full three-row summary. The caller used an empty environment plus an
explicit PATH/locale, disabled shell tracing, private umask, main path/branch/commit
checks and a 360-second GNU timeout with a ten-second kill grace. The approved
proxy key was read inline only, not printed or stored. The existing proxy was not
restarted or reconfigured. No subscription, wallet, hub or payment was used.

| Listing | Adapter | Actual status / stop | Serialized output |
| --- | --- | --- | --- |
| diff-triage | skill | succeeded / end_turn | 1,173 bytes |
| search-arc-docs | mcp | succeeded / end_turn | 42,790 bytes |
| fx-rate | openapi | succeeded / end_turn | 69 bytes |

The result was **3 succeeded, 0 failed (full evidence)**. The model request used
the tiny fixed diff through exact `glm-5.3-flash` on the owner's loopback API route.
The other two calls were the fixed public Arc Docs query and USD/EUR GET. Preview
steps wrote nothing; discovery found three MCP tools and excluded the write tool.
Output bodies and provider diagnostics are not published here.

At **08:57:35 UTC**, a separate read-only observer confirmed the consuming process
was gone and had no direct children under its former PID. Its first permitted
sample arrived after exit, so it did **not** independently observe/reap the former
native process tree. Do not expand that observation into a whole-tree live proof.
The runtime's successful-result cleanup gate and the seven actual native fixture
tests are separate evidence for owned-child cleanup.

This proves local adapter execution only: the hub's output-schema/payment gates
were not run. The earlier paid FX transaction remains a separate proof. The
counterparty-brief route is configured, but its web-search/hiring capabilities were
not exercised in this run. No independent provider-billing or universal tool-support
claim is made, and no earlier financial or ENS approval was replayed.
