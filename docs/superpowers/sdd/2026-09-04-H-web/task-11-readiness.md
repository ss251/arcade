> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H11 seller-page readiness — current-source correction

2026-09-06. Fully read Plan H Task 11, current 298-line H2 `summary.ts`, H4 seller
types/decoder/client path, hub production summary route, and H8's bounded data/Start
projection pattern. Read-only preparation: no H11 source release, test, gate, build,
browser, network, wallet, credential or Git action. Only this private note is new.
H10a authoring/review retains priority.

## Exact differences from literal Task 11

| Literal plan assumption | Actual contract and required page behavior |
| --- | --- |
| `summary.margin.startsWith("-")` and always-string costs | Inference cost, sub-spend, margin and per-listing margin-per-call are nullable display/atomic pairs. Null is unavailable, never zero. Test before string/sign use; preserve the decoded amount rather than redo accounting in JavaScript numbers. |
| Four unconditional totals | H2 also returns fees/net, knownInferenceCost/knownSubSpend, and two completeness flags. When incomplete, show the known subtotal explicitly as partial while the full cost/margin remains unavailable. A known subtotal of zero does not make the missing total zero. |
| Margin measures only successful calls | H2 includes reported failed-job inference overhead and attributes only supported direct sub-spend. Per-call margin divides total listing margin by settled calls; null when no denominator or incomplete costs. Label that denominator rather than imply typical profitability. |
| Counts imply paying customers | Ledger calls include canaries, and aggregation accepts test/Gateway/EIP3009 records without a public per-rail breakdown. Say hub-recorded calls/settlements, including pay-tests or simulated records where present, not organic demand, unique customers or independently verified cash flow. |
| Empty listings means no settled calls | Historical receipt totals survive a missing current listing. Separate no current listings from zero recorded settlements; neither means no charges or refund. The literal `listings.length === 0 || settled === 0` empty copy is wrong when old receipts remain. |
| `txLink(l.payTestTx)` can infer a chain | Current txLink requires explicit qualified rail/network/settled/kind. SellerListingRow contains none of those contexts for pay-test/registration hashes. Render optional references as unlinked text, or omit; do not invent a context, current-network default or registry/explorer URL. |
| ENS name proves liveness | H2 deliberately does not manufacture ensExpired. Missing expiry is unknown; a present flag is hub-reported only. Do not add an unrequested ENS RPC/read per row or conflate runner-live with name liveness. |
| Agent ID implies current verified ownership | Preserve absent ID, agent #0, unverified/unknown and hub-reported verified separately. Seller rows have no fresh D evidence counters/staleness snapshot; do not borrow H8's stronger count claims or say independently verified now. |
| `String(search.address)` and typed validator are validation | Accept an unknown, bounded own-data address field, no coercion/getter/toJSON, and use H4's nonzero address grammar. Missing selection, invalid address and failed summary are distinct fixed states. Invalid input performs zero reads. |
| Return `String(error.message)` through Start | Return only a closed scalar/array public summary projection and fixed error tags, before Start serialization. No raw errors, providers, extra fields or capability-shaped extensions reach the page. |
| Every figure is computable from public receipts | H2 explicitly uses private raw ledger context internally to validate direct funding attribution that the public feed omits. The resulting summary is public; do not claim the stripped public feed independently reconstructs every subtotal. |

The hub currently validates the requested seller, uses complete locally held
listings/receipts/runners, and maps Store/accounting failures to fixed 503
`seller_summary_unavailable`. H4 binds the response seller to the requested address,
checks arithmetic/display pairs and completeness, bounds listings to 1024 and rejects
duplicate listing IDs. Reuse these checks; do not rewrite H2 or weaken H4 for the UI.
Totals need not equal a sum over only currently published listing rows.

## Minimal proposed implementation boundary — not released

- Keep `/seller?address=...`, `SellerBoard`, existing Nav here=seller and the public
  unauthenticated summary read. Prefer the established H8 pattern: a tiny injectable
  pure load/projection function with unknown input, one H4 sellerSummary call, fixed
  nullable result/error states, and an observation time if relative dates are used.
  A separate seller-page-data module/test would need explicit parent path release;
  no new aggregation or transport is needed. Use actual serializable DTO types,
  not a partial fixture cast to SellerSummary or Start strictness suppression.
- Project known top-level and listing scalar fields without reading unknown
  getters, then revalidate using the existing seller decoder before serialization.
  No receipt/job/session IDs, tokens, raw Store rows or arbitrary objects are needed.
- Wallet connect is optional address selection on an explicit click only, never
  authentication, signing, chain switching or payment. Treat provider output as
  unknown bounded data; fixed failure on rejection/invalid account. Prevent a late
  wallet response from replacing a newer manual selection or unmounted owner.
  Public address in the URL is intentional; no capability belongs there.
- Route query selection changes must refresh the form/view consistently. Preserve
  H8's honest limit: cancelling the Start RPC is not proof of cancelling H4 upstream
  reads. One bounded summary request is sufficient; no poll or retry loop.
- Append only seller-scoped CSS and a scoped `.wrap` flow adjustment as needed.
  The literal 380px minimum input plus two buttons overflows a 390px viewport;
  allow wrapping/min-width:0, long-address/reference wrapping and visible native
  focus. Preserve H7/H8 styles, light/dark tokens and reduced-motion behavior.

## Focused acceptance once released

1. Use real H2 summary → H4 decode → page fixtures: complete positive/negative/zero,
   unknown cost, unknown sub-spend, known-zero partial subtotal, failed-job overhead,
   no-settlement null average, canary/test-inclusive count and historical-only totals.
   Assert zero is shown, null is unavailable, no inferred refund/demand/chain proof.
2. SSR/component tests cover fixed partial/error/empty states, absent identity versus
   #0 and unverified, unknown ENS expiry, no guessed pay-test/registration links,
   selectable escaped public references and no private fields in serialized markup.
3. Data tests cover closed request shape, zero IO for missing/invalid/zero address,
   exact seller binding, bounded arrays, wrong pairs/flags, unknown getters and raw
   error privacy. Wallet tests use injected synthetic accounts only and verify
   explicit-click-only access plus rejected/late account results.
4. Canonical installed focused Vitest and exact nested strict follow the established
   testing pattern; missing modules are setup, not behavioral Reds. Parent later owns
   actual 390px/desktop light-dark/focus checks and one complete gate/build. None ran here.

Inspected stable contract pins: H2 summary `b2d46c8e…`; H4 decoder `2b2d10c4…`;
format `279097cb…`; H8 loader `4496ffb1…`, route `1514db40…`. The H10a authors may
change adjacent quote/server code; this readiness is not an acceptance of those drafts.
