# H10a — passive ordinary browser protocol support

Starts after H9 `7cc4409`. Current producer contracts require a correction to
[Task 10](../../plans/2026-09-04-H-web.md): the old settlement relay receives the
job capability on the web server, while the literal proposed tree server function
would receive it again. This slice adds passive protocol support only. H10b will
bind fresh human approval to direct one-shot browser submission and retire the
relay; H10c will add the buyer page. None of those later steps is accepted here.

## Hub-owned contract

- New `ARCADE_WEB_ORIGIN` is one exact canonical HTTPS origin, or HTTP literal
  `127.0.0.1`/`[::1]` for isolated development. Absent means closed to cross-origin
  browser support; malformed configuration refuses with fixed text. When armed,
  also require, validate and capture exact canonical `ARCADE_PUBLIC_URL`. The old
  helper returns an unvalidated environment string and cannot be called validated.
  No origin is inferred from Host, forwarded headers, Referer, ENS or a listing.
- Allow only ordinary POST `/x/<seller-address>/<skill-id>` with JSON and the two
  existing identical payment headers, GET `/jobs/<job-id>/result`, and GET
  `/trees/<job-id>` with `x-job-token`. Preflight permits only the exact configured
  origin. A paid request may carry either payment header alone; if both are present,
  they must be nonempty and identical. Present-empty is not an unpaid probe.
  Preflight permits only the fixed route/method and bounded closed header-name set.
  No wildcard,
  credentials, arbitrary reflection or private-network permission. Preserve Vary.
  Reject unauthorized browser requests before body, Store, rail or admission IO;
  decorate all allowed statuses, including failures, without rewriting bodies.
- No F session/hire/lineage CORS or ordinary fallback for their present headers.
  No-Origin existing CLI/runner traffic retains its protocol/auth behavior. This
  browser policy is not capability or payment authentication.
- Ordinary challenge gains additive top-level `rail` from the actual selected
  `Rail.name`; original accepted requirements are unchanged. USDC signing metadata
  alone does not distinguish Test from EIP3009. Ordinary acceptance advertises the
  captured public origin when browser support is armed, preserving the legacy
  query-token compatibility field for old clients; new browser code never follows it.
- Make ordinary acceptance/result responses private/no-store and ordinary result
  reads abort-aware, including Store awaits and timer cleanup. Cancellation stops
  retrieval only, never admitted execution or settlement. Bound ordinary POST body
  reads before JSON parsing; preserve actual-input quote/admission semantics and
  F's stricter existing readers/guards. Fixed failures never echo payment data.

## Web-owned contract

- Keep existing H4 public transport and non-quote functions unchanged. Capture the
  optional reported rail from the ordinary challenge; invalid present rail refuses,
  missing rail is unavailable context, never inferred EIP3009. Existing quote
  behavior need not fail solely because an old hub lacks the new context.
- Quote captures its hub origin and selected chain configuration once at entry.
  Its listing, actual-input probe and ENS reads keep that issuer across awaits,
  retaining their existing 25s/10s/10s bounds. Do not re-read a changing deployment
  origin between those reads. Non-quote H4 operations remain untouched.
- Add a bounded, browser-safe pure quote-context decoder with canonical captured
  hub origin, skill/seller/resource, network/asset/payee/amount, reported rail,
  original requirements and optional verified ENS name. The keyless quote API can
  expose this public context under `browser` when complete. It contains no job or
  session capability, signer, authorization or private error. Preserve actual-input,
  chain, canonical requirements and ENS checks; a context is not live approval.
  Browser context accepts only known canonical requirement fields and the actual
  EIP3009/Gateway extra fields, including EIP splitter/version metadata. Unsupported
  extras make that context unavailable, not a silently stripped requirements echo.
  Existing `Quote.requirements` remains exact for legacy consumers.
- Expose H9's existing pure row capture under `captureStoredJob` for transport reuse;
  do not change its storage semantics or add a second independent store decoder.
  New ordinary HTTP helpers validate/capture context, send capabilities only in
  headers to fixed captured-origin paths, and never touch storage or server env.
  Use no cookies, redirects, cache or Referer; bound declared/actual UTF-8 JSON bytes,
  headers plus complete body, caller abort and late response cleanup. Use fixed
  diagnostics; no token URLs, console, retries or raw exception propagation.
- Result/tree reads are one in-flight request each, with finite deadlines (at most
  90 seconds for result, 10 seconds for tree) and the existing H4 tree decoder.
  Use a clear bounded relative `timeoutMs` option; H10b owns any total monotonic
  budget across multiple reads. A raw result response is still untrusted until
  H10b/H10c correlates terminal evidence to its captured purchase; do not call
  successful HTTP settled spend. H10a exposes retrieval only, not a paid-submit
  helper, live approval, signer or active UI integration.
- Operational Test, missing or unknown rail cannot become an enabled browser
signing path. Later synthetic offline wallet fixtures prove composition only,
  not a real rail, funded authorization or mined settlement.

## Ownership and acceptance

Hub author owns `apps/hub/src/browser-cors.ts`, any small ordinary-only HTTP helper,
the necessary scoped `server.ts` wiring, and new browser-CORS pure/actual-router
tests. Web author owns pure `purchase-context.ts`, `ordinary-job-http.ts`, the
pure H9 capture export, quote-only H4/API additions and their focused tests. Parent
owns brief/runbook/publication and cross-slice integration. No Chat, Confirm,
wallet signing, active settle relay, buyer route, F capabilities, dependencies,
production configuration or live spending is released in this slice.

Use prewritten behavioral tests and the installed strict TypeScript/Vitest/Bun
toolchain. Missing modules are setup, not Reds. Actual owned production-router
tests must establish preflight zero-IO, allowed/error response headers, forbidden
origin/header refusal, byte preservation, proxy/public-origin binding and retrieval
abort cleanup. Pure mocked fetch tests cannot establish native browser CORS; actual
two-origin native browser acceptance remains required before H10b/H10c completion.
Freeze and independently review both slices before the single full H10a gate and
atomic commit. Never push or read a real key. Session status/recovery is a separate
explicit completeness gap, not something an ordinary H9 record can manufacture.

## Independent-review scope correction

The first web review reproduced an eager server-environment dependency through
`hub-decode.ts` → core barrel → `chain.ts`; direct `money.ts` also reached that
eager module. Parent additionally owns a narrow import-only decoder correction
and an environment-inert USDC money scale in `packages/core/src/money.ts`. Six
decimals is already enforced by `ChainConfig`'s literal schema; parsing/formatting
and selected-chain compatibility exports must not change. A separate collected
browser-import regression and the existing money/decoder suites verify this
integration. Original author freezes/reports remain unchanged; the correction
is not retroactively attributed to them or called native browser evidence.
