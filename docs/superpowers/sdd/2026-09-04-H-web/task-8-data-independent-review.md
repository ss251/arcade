> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H8 data loader and route — independent review

2026-09-06. **CLEAN in the bounded reviewed scope.** No source changes requested.
This reviews B9's loader, not the reviewer's own UI implementation. No actual HTTP,
browser, build, whole-suite, credentials, payment or Git operation was performed.

## Read and pinned scope

Read the complete current readiness and Task 8 contract, all 166 lines of the loader,
205 lines of its tests, 22-line root route, full frozen author report, and relevant
H4 decoder/client/formatter and existing catalog route. The current ts-testing
skill was applied to focused behavior checks, without introducing a test framework.

| Artifact | SHA-256 |
| --- | --- |
| apps/web/src/lib/skill-page-data.ts | `4496ffb12f2b988141a6b6c05ecfd53a374ae50b6a81f3a53663e881f8205f89` |
| apps/web/test/skill-data.test.ts | `87776e404b5c1cf5d4aebf8374b8c2904c0923e24f3458156437b71860788ce9` |
| apps/web/src/routes/skill.$name.tsx | `1514db40caddeb0d077e1058a7361b4fbe93a4917f08fd4f7adc6d4bacae9f71` |
| apps/web/src/routeTree.gen.ts | `672bc8d089517dd4faf97863053844116a5b9fcd677e6afdea6b4ad771b94248` |
| internal/h8-data-report.md | `5116e0462b11703cac1283b847e89e724860dac178a1c7bee408ebfb0431a452` |

Generated registration was only consumed, never generated or edited by this review.

## Accepted source properties

- A closed own-data `{name}` wrapper is validated before read dispatch. Invalid
  scalar, extra-key, accessor, non-enumerable and inherited-name inputs cannot reach
  a hub read. No input coercion or provider text is returned.
- Direct IDs issue exactly the two intended reads, independently contained and
  parallel. ENS resolution runs once first, requires exact name/skill identity and
  a valid seller, then binds returned detail's skill exactly and seller semantically.
  Typed expiry is distinct from outage; mismatch suppresses detail/resolvedName
  without discarding independent valid receipt observations. Empty differs from
  unavailable. No retry, polling, tree capability or paid endpoint is introduced.
- Output is an explicit server-serialization projection, not a spread of the raw
  provider object. Pay-test job IDs become empty compatibility strings. Known
  children, bounds, statistics and pay-test fields are reconstructed; unknown
  fields/getters/toJSON are not retained. Schemas are copied as bounded plain JSON,
  with the stated depth/node/string/key/byte guards and no caller aliases.
- Count bundles preserve H4's agent ID + verified true + stale false + complete
  bounded integers + passes <= reads invariant; metadata can remain without counts.
  No raw registry context is fabricated to re-decode already flattened evidence.
- Receipt projection explicitly consults original reference-kind presence before
  passing the public projection through the real H4 decoder. Invalid or inherited
  kind cannot become legacy onchain eligibility. Unknown/private receipt/descendant
  fields are omitted; the existing public session/canary fields are re-decoded.
- The display clock is sampled once at the return boundary, including refusal,
  and a bad clock gives a fixed error rather than fabricated time. The route passes
  router cancellation to the server-function call without asserting that H4's
  separately bounded upstream reads are synchronously canceled.
- The actual GET server-function delegates validation/projection to loadSkillPage
  before Start serialization and renders the pure page from loader data. Its route
  registration exists. It imports no key-holding buyer API or capability store.

## Independent execution

All commands used empty environment, verified Node PATH, installed Bun with
`--no-env-file`, and no dependency installation.

1. Canonical Node-hosted Vitest:
   `bun --no-env-file x --no-install vitest run apps/web/test/skill-data.test.ts`.
   At **12:15:39 IST: 42/42 passed**, one file, exit 0, 1.39 seconds.
2. Installed TypeScript with actual nested web config/cwd, strict true, and four
   explicit roots: loader, test, route and generated route registration.
   **Zero diagnostics.** The first three-root invocation omitted the generated
   registration and reported two route typing errors; that was an incomplete
   checking context, not a source defect. The four-root repeat passed unchanged.
3. Fileless, injected-only Bun supplement: **40 assertions passed**, getter calls
   zero, actual requests zero. Nine absent/recognized/invalid/accessor/hidden-kind
   cases checked exact two-read dispatch, preserved detail and non-restored links.
   Other controls checked inaccessible private pay-test jobId getters, ignored root
   toJSON getter, serializable private-field removal, three malformed wrapper forms
   with no IO, and canonical agent #0 / explicit-zero counters / legacy link retention.
   Its first attempt used an invalid `$0` fixture instead of actual formatPrice's
   `$0.00`, failing H4 decode before assertions; using actual formatPrice corrected
   that setup error. No product Red is claimed for either supplement or strict setup.

The original author report's separate missing-module, fixture-label, observed ENS
binding, post-read clock and projection Red chronology is preserved unchanged.
This review does not retroactively count passing supplements as Reds.

## Limits

No material finding from this bounded pass. Native Start request counts, hydrated
page privacy, user-visible route errors, pixels and browser cleanup remain parent
integration evidence, not established by this review. The loader's input dependencies
are finite H4 reads; no claim is made that an arbitrary injected never-settling
promise is bounded here. Public seller prose/schema text is not a secret classifier,
and reflective checks are not a hostile-Proxy sandbox. No new trust or payment
authority follows from a rendered observation or this acceptance.
