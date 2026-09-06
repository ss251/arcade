> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10a hub transport author report

2026-09-06. Parent release after H9 `7cc4409`; only the six hub paths inventoried below were changed. **Author focused acceptance passed; independent review and the sole integrated full gate remain pending.** This adds passive ordinary browser protocol support, not H10b approval/signing, a buyer page, active relay retirement, deployment or live payment authority.

Fully read the accepted H10a brief before coding, then reread its final 98-line clarification checkpoint (SHA256 `8e544946e100216c7db11ea53e9b22b2a7ed3186b8a8b72d542a20f707e20b71`). Read repository instructions, the complete `ts-testing` skill, relevant current router/F/helper/fixture contracts and installed Effect 3.22.0 `Runtime.runPromise` declarations (per-call `signal`). No dependency installation or external documentation request occurred. The testing skill led to an actual-router baseline first and explicit separation of genuine Reds from supplemental coverage.

## Implemented boundary

- Import-safe `makeBrowserCors(webValue, publicValue)` captures exact canonical origins. Web origin absent preserves no-Origin clients but refuses Origin-present requests; invalid/empty/null or noncanonical configured values throw fixed text. Armed browser support requires a separately valid captured public hub origin before application layers, signer construction or listener startup. HTTPS or literal `127.0.0.1` / `[::1]` HTTP only; maximum 2048 characters; no inferred Host/forwarded/Referer authority.
- Browser methods/routes are ordinary canonical seller-address + 2–64-character skill POST, canonical result GET and tree GET. Browser query strings are refused: legacy query-token URLs remain no-Origin compatibility only. There is no same-origin bypass that quietly opens other routes.
- Preflight validates the exact configured origin, method, bounded 1024-character requested-header field, closed case-insensitive header names and duplicate/empty-name refusal. Fixed allow lists are POST `accept, content-type, payment-signature, x-payment` and GET `accept, x-job-token`. No wildcard, credentials or private-network permission; no business handler runs for OPTIONS.
- Actual requests independently refuse present-empty F/session/hire/auth/cookie authority headers before F dispatch, body reading, Store/rail/admission IO. The hire literal exactly matches core `HIRE_CAPABILITY_HEADER`: `x-arcade-hire-capability`. Native browser/proxy-managed headers do not become requested custom-header grants. POST requires JSON media type and accepts either payment header alone or identical nonempty dual fields, maximum 16384 characters each. Headerless JSON probes remain allowed. GET refuses payment and content-type fields; existing job authentication remains authoritative.
- Allowed response statuses retain the original body stream, status/status text and existing Vary entries. CORS appends Origin and private/no-store without parsing, cloning or re-encoding bodies. Fixed 403 policy and fixed 503 unexpected-handler errors never reflect payment data. No-Origin dispatch is unchanged by the CORS wrapper.
- Ordinary 402 challenge adds only top-level `rail: rail.name`; original accepted requirements are unchanged. Test signing metadata is not relabelled EIP3009. Armed acceptance uses the captured public origin while retaining the existing legacy query-token `poll_url` and separate `job_token`. No-Origin unarmed acceptance keeps its prior socket-origin compatibility.
- Ordinary acceptance and result responses are private/no-store. Result Store reads and 300ms sleeps share a 120-second maximum retrieval lifetime, accept caller cancellation, interrupt Effects and check again after each await. Tree reads similarly use a 10-second scope. Cancellation stops retrieval, never the independently admitted `runJob`/settlement. Fixed unavailable responses replace unexpected retrieval exceptions; existing result release/receipt semantics remain unchanged.
- Ordinary body reads enforce declared and actual 131072-byte bounds, fixed five-second whole-body deadline, strict UTF-8, exact declared-length agreement and cancellation before JSON parsing. Legacy no-Origin content types and empty-body-to-object behavior remain intact. F's separate stricter readers/exports are untouched. Completed read waiters are removed; more than 32 consecutive empty chunks refuses before arbitrary stream processing. No money uses floating-point arithmetic.

## Genuine chronology and scope of evidence

1. Added seven self-preloaded production-router tests against unchanged server SHA256 `5362e18f456cb843f2d9452cabc9385e897d84de77b1f1e4f08d63421a50b519`. Baseline: **0 pass / 7 fail / 45 assertions**, 3.25s. They actually observed: OPTIONS404 instead of204; foreign Origin reaching402 instead of403; missing rail; oversized JSON reaching402 instead of400; missing private acceptance cache header; native client abort leaving an actual Store Effect active; and default-unarmed Origin request reaching402 instead of403. Later assertions in those tests were not claimed as separately observed Reds. Every owned child was cleaned up on those failures.
2. Pure helper tests were prewritten but not run against missing modules. There was no missing-module/compile failure claimed as behavioral evidence. Initial implementation acceptance at 13:10:02 IST: **68 Vitest / 2 files**, then **7 actual Bun / 85 assertions**; exact six-root strict zero diagnostics.
3. Added bounded supplemental router cases (already-correct coverage): forbidden preflight grants/methods and token URLs; real auth/input/Store failures and successful tree response; primary/legacy/dual payment compatibility; fixed configuration refusal before listening. Added polling timer cleanup coverage. Checkpoint at 13:13:18 IST: **169 Vitest / 4 files** and **40 Bun / 704 assertions / 4 files**, 23.18s; exact six-root strict zero.
4. Parent source review correctly identified repeated `Promise.race` reactions retained on a shared pending stop promise, despite the existing monotonic deadline and skipping stored empty chunks. A prewritten finite 64-empty-chunk stream regression at **13:15:16 IST** failed: result resolved `{}` instead of rejecting (**1 fail / 13 skipped**). This is an executed bounded stream-behavior Red, not an OOM or measured heap-growth experiment.
5. Narrow correction replaces shared stop-promise races with per-read removable abort listeners (body and retrieval) and refuses more than 32 consecutive empty chunks. Added a separate already-correct listener-removal check over 21 completed reads; no extra Red claim. Final canonical focused checkpoint at **13:16:12 IST: 171 Vitest / 4 files**, zero failures. Final actual router regression: **40 Bun / 704 assertions / 4 files**, zero failures, 23.28s. Final exact six-root TypeScript strict check: **0 diagnostics**. All six final files were then hashed and frozen; no process remained active.

The final Vitest total is 56 CORS + 15 ordinary HTTP + 56 existing session endpoint + 44 existing session-call tests. The Bun total is 11 new H10a + 8 unchanged ordinary-tree + 11 unchanged F endpoint + 10 unchanged F paid-router tests. Their aggregate assertion count is reported as printed, not invented per-suite counts.

## Commands and ownership

All shell calls used `login:false`. Canonical Vitest ran through the installed Node-shebang CLI, not Bun-hosted Vitest JavaScript:

```sh
env -i PATH=<owner-home>/.bun/bin:<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/hub/test/browser-cors.test.ts apps/hub/test/ordinary-http.test.ts apps/hub/test/session-endpoints.test.ts apps/hub/test/session-call.test.ts
env -i PATH=<owner-home>/.bun/bin:<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file test apps/hub/test/browser-cors.bun.test.ts apps/hub/test/receipt-tree.bun.test.ts apps/hub/test/session-call.bun.test.ts apps/hub/test/session-endpoints.bun.test.ts
```

Versions printed: Vitest3.2.7 and Bun1.3.14. Exact typing used fileless installed TypeScript `readConfigFile` + `parseJsonConfigFileContent` for the actual root config, `createProgram` with exactly the six owned roots and inherited strict options, `noEmit:true`, `incremental:false`, `composite:false`, then `getPreEmitDiagnostics`. No diagnostic filtering or source shims. No full-repository suite or build was run.

New Bun fixture is confined to its owned test file: real production server, real in-memory Store, actual TestRail implementation wrapped only for counters, real Broker completion, fake signature data accepted only by TestRail, synthetic origins and no live signer. `ARCADE_DB` is only a synthetic preflight placeholder while the fixture explicitly replaces StoreFromEnv with its owned memory layer; no production database is opened. External fetch/preconnect are denied. No keychain or real account state is accessed.

Owned child output is capped; startup waits have early-exit and deadline checks; fixture has a 30-second hard fuse. Finally paths terminate then force-kill only an unresponsive owned child, await reaping/drains, check sentinel secrecy and verify closed listeners by a refused request. Startup-refusal children are also reaped. These tests establish actual server HTTP/cancellation behavior and controlled integration, **not native browser CORS**, reverse-proxy forwarding, real signing, Gateway funding, mined settlement or UI purchase authority. Native two-origin browser acceptance remains a later parent-owned prerequisite. No Git operation, source outside this six-path scope, dependency, public documentation or F source was changed.

## Frozen inventory

| Path | Lines | SHA256 |
|---|---:|---|
| `apps/hub/src/browser-cors.ts` | 80 | `bcbafad14474edfb3cce27256882d67d3349d34709b30afd1e508df37c6b63fc` |
| `apps/hub/src/ordinary-http.ts` | 85 | `a306b4e0dc79d102eee70af6585c768ed4eb90093817450e11ce68d84ace1405` |
| `apps/hub/src/server.ts` | 1445 | `2784838936d9638e590758534929fc755162e1900f63d7bf51dc27609202b0a4` |
| `apps/hub/test/browser-cors.test.ts` | 82 | `c50d857aeda83a8f28021866f4e638fcf958e5ba918d3dfd0fe6f1061caacb63` |
| `apps/hub/test/ordinary-http.test.ts` | 93 | `3cb27bbb946f6154785d1e0a7fce15ba34497133b4b48ec13200ba0ad166ae60` |
| `apps/hub/test/browser-cors.bun.test.ts` | 247 | `84f626d674ea410a98ff067fcf2b502bfa7674912a7324e6b2516dc86a8c34be` |

Unchanged F dependency pins: `server-sessions.ts` = `af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968`; `server-session-calls.ts` = `10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c`. Parent owns independent verification, final full gate, public sanitized reports and atomic commit.
