> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10a passive web protocol — author checkpoint

2026-09-06, HROOT. Full `task-10a-brief.md` and relevant current H4/F/H9 contracts read before implementation. The ts-testing skill guided prewritten behavioral tests and focused installed Vitest checks. This slice is frozen for independent review, not complete H10 acceptance. Parent owns the hub integration, actual browser CORS proof, full gate and publication.

## Exact scope and API

Eight released source/test paths changed; only this ignored report additionally created. No Chat/Confirm/sign/wallet/active settle relay/buyer route/F source, dependencies, operational configuration, Git or public documentation was changed. No keys, signer, network, native server/browser fixture, payment, session mutation, full suite or build was run.

- `purchase-context.ts`: `capturePurchaseContext(input: unknown): BrowserPurchaseContext | undefined`. A closed own-data decoder produces a separate deeply frozen public context containing canonical issuer, exact relative ordinary resource, seller/skill, amount/payee/asset/network, reported `eip3009|gateway|test`, original requirements and optional syntactically valid ENS name. It reads committed ready chain profiles, not server environment or IO. The producer separately establishes selected-chain and ENS provenance; the pure decoder does not prove an ENS resolution or human approval.
- Context requirements retain **every admitted original field and spelling**, with no schema defaults, case-normalization or unknown-key stripping. Top-level canonical fields and optional description/mimeType/extra only; EIP/Test extras are name/version/feeSplitter/feeSplitterVersion, Gateway extras name/version/verifyingContract. Unknown fields, malformed domain/routing, foreign coordinates and incomplete domain metadata withhold context. Text is scalar/byte bounded before encoding, including a 2048-byte description ceiling; fixed finite field sets bound total data. Test remains explicitly Test, never an enabled signing claim.
- `job-store.ts`: exported/renamed the existing pure row decoder as `captureStoredJob`. There is no storage semantic change. Exact in-memory reversal of that rename/export produces H9 source SHA `70fc863885e7c4e1ba0166ad27390a8c4f743395bb16bdeecd3d6afb557b98c5`; the original H9 report remains `c378e9d5b22a6d80cc56742965a2394377034ddc15e43943cc52583d7a07c4b7`.
- Quote-only H4 change: capture issuer and selected `loadChainConfig()` at entry, then use existing `jsonFetch` for detail/probe/ENS at that exact issuer, preserving original 25s/10s/10s bounds and actual-input checks. All non-quote functions and `hub-http.ts` stay unchanged. An invalid present reported rail refuses the quote; absent rail preserves old quote behavior with no browser context. Unsupported safe requirements or legacy localhost also omit only browser context. Original `Quote.requirements` remain exact. `Quote.browser?` and `/api/quote.browser?` expose the complete safe context only after successful existing ENS checks; private unknown requirement fields do not pass through the API via this addition.
- `ordinary-job-http.ts`: `readOrdinaryResult(row: unknown, options?: OrdinaryReadOptions, fetchFn?: typeof fetch): Promise<OrdinaryRawResult>` and `readOrdinaryTree(...): Promise<TreeView>`. Options are only optional `signal` and positive integer relative `timeoutMs`, bounded/defaulted to 90,000ms result and 10,000ms tree. One invocation performs one request, never a polling/retry loop. Parent explicitly chose **retrieval only**, so no paid-submit helper exists here.
- HTTP reuses the exact H9 capture and derives `/jobs/<id>/result` or `/trees/<id>` at its captured origin. Only `accept`/`x-job-token` headers are sent; request init/headers are immutable. No cookies, redirects, cache, Referer, storage, server-env read or arbitrary URL/init API. A replacement global fetch after dispatch cannot redirect a captured request.
- HTTP headers plus complete body share one monotonic deadline. Declared/actual body ceiling is 131,072 UTF-8 bytes, headers bounded at 16,384 scalar header characters, JSON UTF-8 MIME required, compressed content refused, length grammar/equality enforced and ambiguous length-plus-transfer-encoding refused. Fatal streaming decoding includes final flush. Each pending fetch/read has a removable abort waiter; 1024 consecutive empty chunks is a local work ceiling. Late fetch completion may only cancel its body. Reader cancellation is awaited for at most 50ms and lock release attempted; no provider error or abort reason escapes the fixed `OrdinaryJobHttpFailure` code/message.
- A result HTTP body's contents remain deliberately `unknown`, including any claimed receipt, URL or error prose: **not settled spend or safe display text**. Later H10b/H10c must correlate and project it. No returned URL is followed. Tree HTTP must be 200 and pass the actual H4 `decodeTree` with the captured root; its output is that existing public projection, not an invented tree decoder.

## Test-first chronology and honest failures

1. Wrote quote regressions before source changes. At **13:04:11 IST**, focused selection collected 9 of 40 cases: **8 failed, 1 passed, 31 skipped**. Genuine failures: absent API/browser context; environment change after listing causes later quote request issuer drift/refusal; five invalid present reported rails incorrectly resolve; Test context absent. The missing-rail compatibility case was already Green. This is request-consistency evidence, not a demonstrated money leak or paid request.
2. Wrote the new context suite before its module; did not execute a manufactured missing-module Red. After implementing the context and quote changes, **13:07:51**: context44 + quote40 + unchanged H9 storage80 = **164/164 in 3 files**, all Green.
3. Wrote the HTTP suite before its module. First complete implementation run at **13:11:32** collected **45 cases: 44 passed, 1 failed**. That one failure was an incorrect expectation of raw `runner_lost`; the required existing H4 decoder emits `not settled`. Corrected the expected decoded projection, not production behavior. It is **not** claimed as a product Red. No missing-module run was claimed.
4. **13:12:24**: HTTP45/context44/quote40/H9storage80/quote-routes24/purchase8 = **241/241 in 6 files**. Additional compatibility/cleanup guards were then added: unsupported extras withheld while legacy requirements survive, rail/domain mismatch, captured selected config, legacy localhost, timed-out headers/late body, caller body abort, UTF-8 byte count and excessive headers. These passed on the implementation; no new behavioral Red is claimed for them.
5. Final **13:14:45** focused run: **332/332 in 7 files**, all Green. Exact breakdown: context44, HTTP49, quote-ENS44, unchanged H9 storage80, existing quote/relay routes24, purchase8, public H4 client83. Root's separate real challenge-producer composition test was not included in these counts or authored here.

## Commands and exact strict check

All commands used HROOT as working directory, `login:false`, and this clean installed launcher (not Bun executing `vitest.mjs`):

```text
env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/web/test/ordinary-job-http.test.ts apps/web/test/purchase-context.test.ts apps/web/test/quote-ens.test.ts apps/web/test/job-store.test.ts apps/web/test/quote-routes.test.ts apps/web/test/purchase.test.ts apps/web/test/hub-client.test.ts
```

First exact eight-owned-root strict check found only two `api.quote` TanStack path/server augmentation diagnostics: the generated route support root was missing from that explicit compiler program. No source workaround/cast was introduced. Repeated using the existing generated file as support; **eight owned roots + one existing generated support root, zero diagnostics**:

```ts
const configPath = process.cwd() + "/apps/web/tsconfig.json"
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys,
  process.cwd() + "/apps/web", undefined, configPath)
const roots = [
  "apps/web/src/lib/purchase-context.ts", "apps/web/src/lib/ordinary-job-http.ts",
  "apps/web/src/lib/job-store.ts", "apps/web/src/lib/hub.ts",
  "apps/web/src/routes/api.quote.ts", "apps/web/test/purchase-context.test.ts",
  "apps/web/test/ordinary-job-http.test.ts", "apps/web/test/quote-ens.test.ts",
  "apps/web/src/routeTree.gen.ts"
]
const program = ts.createProgram(roots, {
  ...parsed.options, noEmit: true, incremental: false, composite: false
})
const diagnostics = [ ...(config.error ? [config.error] : []),
  ...parsed.errors, ...ts.getPreEmitDiagnostics(program) ]
```

This used installed TypeScript via the same clean `bun --no-env-file -e` environment. Generated route-tree bytes remain `672bc8d089517dd4faf97863053844116a5b9fcd677e6afdea6b4ad771b94248`; no codegen/build was run. All author commands had exited before freeze.

## Frozen eight-path SHA-256 inventory

```text
9499f8afe79a4276a322cb0af207a73ccbd8695438ddc86bfa5def8f15c5ce3b  apps/web/src/lib/purchase-context.ts
156482395d8942e02bfafc12eb29d8fdac937539230a04e298aa963de58ce957  apps/web/src/lib/ordinary-job-http.ts
795f18e689f9df6b7fabe56bb690d826a7e5b1d28d8fa9fa5a69d73899d6d5e4  apps/web/src/lib/job-store.ts
009f4e6b573656e8fa71d051ce711c78aa921025b837dee444953072e1c24731  apps/web/src/lib/hub.ts
b6cb45b59d4d2d7354a891dbc107a172da527a2d7dfccdbe7fa731d1054f6e13  apps/web/src/routes/api.quote.ts
947799951ec9942be44c8356f3d521ed6a7e50a27148afb14bade628179e8779  apps/web/test/purchase-context.test.ts
08324fbb457ce62d221bd7ce85e294afb78b334e2a6926651cf57bbcf2c9ec69  apps/web/test/ordinary-job-http.test.ts
01102ca75c13159ec23d896f569e3a5400b127e22fd743e4fb18ab2d28cbfc73  apps/web/test/quote-ens.test.ts
```

## Remaining limits

The tests use injected fetch with native Response/ReadableStream in the installed Node-hosted runner; they do not establish real browser CORS, forbidden-header visibility, compression behavior, two-origin delivery or native deployment routing. Empty `Response.url` is accepted for these injected responses; actual nonempty URL drift is refused. The helper is not a hostile global/Proxy sandbox, and H9 storage is not an XSS/cross-tab atomicity boundary. No current UI uses the new retrieval functions. Browser approval/payment binding, acceptance persistence, fresh terminal validation, active relay retirement and the dashboard remain H10b/H10c. F session capability export/status recovery remains separately unreleased. No live rail, funded authorization, mined transaction or completed H10 claim is made.
