> Sanitized execution/review checkpoint, September 5, 2026. This is local fixture evidence, not live provider or payment evidence. Original private source retained unchanged; later dated records can supersede pending statements.

# B13 free-route API review — 2026-09-05 UTC

Private implementation/review addendum only; no historical report or public snapshot was changed. Product files are frozen for the parent's independent review and combined gates.

## Scope and proof

Reviewed the existing manifest model override, harness, exec environment/launch boundary, two model manifests, and their tests. This review changed only `packages/runner/src/engines/claude-api.ts`, `packages/runner/test/claude-api.test.ts`, and `packages/runner/test/free-route-api.bun.test.ts` after parent authorization. The earlier harness/exec/manifest changes were preserved. C1 owns the separate Agent SDK lane.

Genuine failing regressions preceded the corresponding source changes:

- 07:52:23: 25 failures among 57 API tests: malformed/missing usage; inherited model/tool pricing entries; synchronous and iterator provider diagnostic disclosure; arbitrary refusal category disclosure. Existing partial usage fixtures were corrected to include required input/output counters, not made permissive.
- Approximately 07:53:34: four failures among seven real Messages SDK loopback tests: a redirect reached a second owned origin, a retryable 500 caused three POSTs, a 400 exposed its provider diagnostic, and negative server-tool usage accepted a successful submit. Only dummy keys and owned loopback servers were used.
- 07:55:47: unknown provider stop reason plus a parsed submit was incorrectly accepted.
- 08:02:34: five failures proved a parsed, schema-shaped submit incorrectly succeeded under `max_tokens`, `model_context_window_exceeded`, `stop_sequence`, `pause_turn`, or `compaction`.

Final focused results:

- 08:03:14: 118/118 Vitest tests across API (63), harness (22), exec (18), and demo listings (15); global `tsc --noEmit` and `git diff --check` exited zero.
- 08:08:19: 7/7 real Messages SDK Bun cases, 41 assertions. All original four cases remain, alongside redirect/no-repeat/invalid-accounting regressions.
- Independent parent-owned shell review: 32/32 evidence tests and `bash -n` passed around 08:03:59. The final direct CLI invocations avoid nested package-script dotenv loading; the real mirrored-shell fixture proves the boundary, and pipeline exit 23, arguments, and cwd remain intact.

## Accounting, privacy, and completion decisions

The exact free alias `glm-5.3-flash` has zero token pricing, not a generic free fallback. Server-tool costs remain accounted. Model and tool rate lookup uses own entries. Required input/output counts must be nonnegative safe integers; malformed or absent mandatory accounting rejects the result. Optional cache and server-tool null/absence means zero, matching installed `BetaUsage`; each reported counter and summed token total is checked before accepting output.

External provider errors never become public diagnostics. Fixed internal accounting/bound messages remain useful. Only the installed refusal categories are echoed; unknown stop reasons fail closed. A submit completes only with `tool_use` or `end_turn`. This engine never requests custom stop sequences, so `stop_sequence` is not completion evidence. A paused response without submit retains the existing continuation behavior.

Installed SDK source anchors (local package, no online assumptions):

- `@anthropic-ai/sdk/src/lib/tools/BetaToolRunner.ts:635`: setter's narrow public `Pick` type.
- Same file, lines 320–329: setter spreads the supplied request object unchanged; line 215 forwards it into `messages.create`.
- `src/internal/request-options.ts:82` and `:98`: full typed `maxRetries` and `fetchOptions`. A separately typed `Anthropic.RequestOptions` value is passed structurally, with no casts, global fetch replacement, or client-injection removal.
- `src/resources/beta/messages/messages.ts:2263–2284`: precise stop semantics; `:4032–4093`: required counters and nullable optional accounting.

Actual loopback tests prove request-level `maxRetries: 0`, `redirect: "error"`, and `credentials: "omit"` override even an injected client's permissive defaults: zero second-origin requests, one POST on retryable error, no accepted malformed accounting.

## Explicit limitations

No real API key, proxy call, model request, Keychain access, external network, wallet, purchase, deployment, full suite, or git mutation occurred in this review. Loopback provider responses are simulated and are not live GLM capability evidence. No claim is made that all declared first-party tools work with the free alias. Parent retains combined gates, live execution, documentation, and commits; C1's native SDK isolation/transport review remains separate.

## Per-job native transport addendum — frozen 08:34:35 UTC

C1 independently reproduced a dummy-key redirect leak in the real bundled native SDK. Parent explicitly authorized this agent to own only the new `packages/runner/src/engines/agent-relay.ts` and `packages/runner/test/agent-relay.bun.test.ts`; C1 retained the engine integration and native fixture. The API source above stayed frozen.

`openAgentRelay` is import-safe and environment-free. Only its factory opens an ephemeral loopback listener. It accepts one explicit upstream credential, exact model/tool set, abort signal, finite job timeout/request count, and an optional caller-only test port. Native receives a fresh random local capability, not the upstream secret. Only Messages/count-token POST paths and the observed `?beta=true` are forwardable; the harmless HEAD warmup is answered locally. Explicit provider prefixes follow the installed Messages client's append semantics, with no invented `/v1` normalization.

The relay constructs fixed headers, refuses redirects, performs no retries, and latches every upstream-started failure so native retries cannot cause another provider request. Request bodies are bounded to 1 MiB; response bodies to 4 MiB; active operations to four; total requests to at most 256; request lifetime to at most 60 seconds and the owning job's lifetime. Close aborts active operations, stops its own listener, and is idempotent/bounded.

TDD evidence:

- A genuine missing-module Red preceded all helper implementation.
- Initial helper run was 16/17. A stronger follow-up remained 18/19: Bun could turn an outgoing stream error into a clean partial HTTP 200, so merely calling `ReadableStream.error` was not safe.
- Two further genuine Reds proved that a valid-looking JSON prefix from an HTTP response with a truncated declared body was forwarded as 200, and that a fifth active request reached upstream.
- Parent approved complete bounded buffering before any 200/native bytes. The final helper preserves exact SSE/JSON bytes and content type but delays delivery until the whole response is read and the upstream credential literal is absent. No event rewriting or permissive truncation fallback was introduced. These cases reached 21/21, 79 assertions.
- At 08:33:34, a genuine gzip regression observed automatic `gzip, deflate, br, zstd` negotiation. Fixed `Accept-Encoding: identity` plus explicit nonidentity response refusal keeps framing/byte checks meaningful.
- At 08:34:35, final helper tests were **22/22, 84 assertions**, with global `tsc --noEmit` and `git diff --check` zero. Native seven-case rerun on this last header-only delta was delegated to C1; do not substitute earlier native results for that final confirmation.

Independent read-only review of C1's frozen engine, 66 unit cases, and native fixture was CLEAN: API-only scratch/simple mode, removal of upstream authentication/proxy/binary overrides from native environment, observed StructuredOutput requirement for `tool_use` terminal success, own-field accounting validation, fixed diagnostics, private stderr draining, and cleanup even when query close fails. Native test assertions honestly describe loopback-only OS egress, deny personal-home/config/Keychain access, check exact owned upstream requests, and verify observed native descendants stop. This reviewer did not edit C1's files or run competing native tests.

All helper tests used dummy credentials and owned loopback fixtures. There was still no real proxy/key/model/purchase/deployment or live capability proof, and no git mutation. Full-suite gates and live execution remain the parent's responsibility.

### Final cross-review confirmation

C1 subsequently reported the final identity-encoding-policy native fixture **7/7, 93 assertions, 18.04 seconds**, plus 66 unit tests and typecheck/diff zero. This is C1's execution, independently source-reviewed here, not a second native run by this reviewer. C1 also independently read the final relay and its 22 tests and returned CLEAN.

The parent's combined focused run exposed three pre-existing incomplete fake-provider result shapes in `packages/runner/test/harness.test.ts` at 08:35:10 UTC. This reviewer independently accepted the two-field fixture correction: `is_error: false` and `usage: { input_tokens: 1, output_tokens: 1 }` supply the now-required native success/accounting fields. Model-override and skill-isolation assertions and all production code stayed unchanged. The correction does not weaken an assertion or permit missing real provider accounting. No competing test run was started during the parent's combined gate.
