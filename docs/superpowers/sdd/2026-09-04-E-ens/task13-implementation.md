> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E13 — verified ENS confirmation card

Status: source frozen, 2026-09-05 09:16:03 Asia/Kolkata. No git operations, live services, keys, RPC, signatures, purchases, or funding. Independent review and browser visual verification remain with root.

Review follow-up 09:19:25: genuine render Red proved the remaining Confirm policy sentence still promised that refusal/timeout leaves the balance untouched. Changed only that copy to explain ARCADE hub policy and reconciliation for an unconfirmed signed authorization. Focused 60 tests, web tsc, web build and diff check Green; source refrozen. No unrelated JSX/style changes.

Independent-review follow-up 09:25:53: three genuine Reds captured (15-second real-shaped long-poll returned502; stalled result request ended at11s instead of overall90s; progress renderer claimed paid/runner dispatch immediately after signing). The read-only result GET now uses its remaining overall90s deadline, retaining complete-body abort/cancellation and one paid submission. The existing progress render was extracted and its post-signing copy corrected to `authorization signed; awaiting hub outcome`. All **151 web tests**, web tsc, web build and diff check Green at09:26:16; source refrozen. No live calls or git mutations.

## TDD evidence

- 09:00:40: 28 genuine Reds, 2 passing. Existing quote ignored input and ENS, accepted mismatched/malformed challenges, had unbounded streamed reads; card had no name display.
- 09:04:38: first 30 tests Green. An interim implementation mistake used `cfg.usdc` instead of `cfg.usdc.address`; web tsc caught it and it was corrected.
- 09:06:32: 20 genuine Reds, 26 passing. Actual exported route handlers and browser transport proved GET-only quote, ignored approved input, invalid input silently becoming `{}`, mismatched signed payee forwarding, redirects/ambient credentials, and arbitrary polling.
- 09:12:50: 8 genuine Reds, 19 passing. Three canonical terminal states were missing from a temporary relay list, malformed/contradictory receipt responses were accepted, and an uncertain signed outcome rendered a no-charge claim.
- 09:16:02: genuine remote-failed receipt UI Red (`nothing charged — you were not charged`). The preceding test attempt omitted `result:null` and hit the old Purchase renderer's undefined-result defect instead; it is not claimed as the intended Red.
- 09:16:03: all **147 web tests / 13 files Green**, including **59 new tests**; `bunx tsc --noEmit -p apps/web/tsconfig.json`, `bun run web:build`, `git diff --check` all exit 0.

Commands: `bunx vitest run apps/web --reporter=dot`; web tsc; production web build; diff check. These are offline fixtures/static markup, not live-payment or browser-interaction evidence.

## Implementation

- Confirm displays the complete ENS name below the skill identifier and labels payout `from ENS`. The address remains complete and copyable. Existing mono/slate tokens, hierarchy and hold interaction are preserved; name wraps without truncation. Unset name leaves the existing card unchanged.
- An advertised listing name is never directly promoted to a verified name. Shared `hub.quote(skillId,input?)` validates the complete canonical x402 requirements, ready selected chain/USDC, positive canonical uint256 amount, timeout, exact resource and nonzero payee; `/names/name` must match name, exact endpoint, seller, skill, chain, payee and `expired:false`. Resolver errors or disagreement fail closed, with no inferred expiry. ENS price remains advisory.
- Actual approved input flows through Thread → PendingPurchase → POST `/api/quote`, tool parsing → deriveSigningRequest → quote, and `/api/settle` → quote → paid body. Invalid/non-object/oversized input no longer silently becomes an empty object. Legacy GET quote and absent optional input retain `{}` behavior.
- Requests use redirect:error, credentials:omit, fixed-origin/path validation, 128 KiB JSON bounds, whole-request deadlines with body cancellation, fixed diagnostics and no retries. Incoming quote/relay bodies are bounded too.
- The relay compares the signed payee and amount before forwarding any signature, rechecks ENS using the shared quote, and sends the authorization once. Polls must be exactly the configured origin's correlated `/jobs/<id>/result`, with only an optional canonical 32-hex token. Results must correlate job/receipt job, skill, buyer, seller, network and amount. Settled reports require succeeded status and a transaction-shaped hash. Terminal refusals derive from core NON_SETTLING; valid output with failed rail remains a nonsettled report.
- Signed errors and remote nonsettlement display outcome-unconfirmed. A remote failure report does not invalidate an EIP-3009 authorization and is not proof of no charge. No automatic retry/refund/reset was added.

## Scope / files

Modified `apps/web/src/components/{confirm,chat}.tsx`, `src/lib/{hub,purchase,tools}.ts`, `src/routes/api.{quote,settle}.ts`, `src/styles.css`.

New web-only helpers: `src/lib/hub-http.ts` (bounded HTTP transport / incoming JSON), `src/lib/purchase-input.ts` (one browser-safe interpretation of approved JSON input).

New tests: `test/confirm-ens.test.tsx`, `test/quote-ens.test.ts`, `test/quote-routes.test.ts`. Existing `test/{figures,purchase,tool-calls}.test.ts` fixtures changed only to HTTPS and canonical realistic addresses/complete402 requirements; previous invalid fixture shortcuts failed the stricter boundary. Their original assertions remain.

## Necessary literal-plan adaptations and limits

- The plan only copied ListingDetail.ensName and incorrectly described browser signing as using the ENS-aware buyer SDK. The web has its own EIP1193 signing path; verification therefore belongs in shared server-side quoting and is repeated before signing derivation/relay.
- The card is a verified snapshot, not a cryptographic pin of its displayed payee. Existing AI approval HMAC binds skill/input/ceiling; wallet confirmation binds the later freshly derived payee and amount. If ENS and402 both legitimately change together after display, the fresh quote can change. No immutable-payee consent claim is made in the quote route.
- No wallet or key ever enters the server; signatures are carried only through the existing courier. Receipt correlation is validation of the hub response, not independent on-chain settlement verification.
- The plan simultaneously suggested Testing Library and copying the existing static-markup setup. No DOM library is installed. Followed existing Vitest/renderToStaticMarkup, actual route handlers, real schema decoders, and injected fetch; no new dependency. Hook lifecycle/hold/touch/keyboard/visual checks still need root's browser pass.
- Applied ts-testing for deny-first behavioral tests and actual route fixtures; frontend-design/web-design kept the existing measured, neutral, full-identifier design and persistent uncertainty text. Repository-specific design/payment skills and Context7 were unavailable in this environment; installed core/payment schemas and current code were used, without network research or substitutes.
