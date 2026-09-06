> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H8 UI and route independent source review

2026-09-06. **CLEAN for the bounded source review; no actionable finding.**
This is not browser acceptance, a fresh test run, or an independent review of the
loader I authored. The parent separately owns integration, visual QA and full gates.

## Scope and method

Fully read the current H8 readiness, the complete UI author report, Evidence and
SchemaBlock, SkillPage, all 39 collected UI cases, the root skill route and generated
route tree. Read the complete web-design skill, relevant existing shell/navigation
CSS, all appended H8 CSS, and the actual H4 decoder/formatter contracts consumed
by the UI. The skill focused this review on semantic structure, qualified states,
local overflow and keyboard affordances; it caused no product changes.

Only file reads, bounded searches and SHA-256 checks were executed. No tests,
TypeScript program, build, Git, browser, server, network, wallet or provider action
was run for this independent slice. The only authored file is this private report.

## Findings and preserved boundaries

- The route passes unknown input to the bounded loader rather than asserting a
  client-provided shape. Start serializes that loader's explicit public DTO. The UI
  has a type-only loader import and contains no token store, signing, paid request,
  tree request, provider request or automatic purchase action. Its normal `/chat`
  link has no prefilled authority and is suppressed for unavailable, mismatched,
  delisted or observed-expired detail. Shared Nav is intentionally unchanged.
- Independent listing/receipt/name states survive. Missing listing is unavailable,
  not an asserted nonexistent listing. Missing history differs from an empty returned
  history; all displayed ages use the serialized observation time. Correlated ENS
  name remains additional hub-observation text, not a payment target or liveness proof.
- ERC-8004 identity, ownership and freshness remain distinct. D counts require the
  entire fresh verified bounded bundle, valid agent ID and passes <= reads. Explicit
  zero survives. Count disclosures accurately qualify their configured validator,
  tag, attester, bounded request set and agent-wide scope. Announced registration
  metadata and contextless seller/pay-test references stay unlinked.
- Receipt records are an explicitly recent sample. Descendants remain a flat list,
  not a fabricated tree. Explorer links require both a current context-qualified
  formatter result and exact agreement with the H4-supplied explorer; withheld links
  are not reconstructed. The normal projected data retains canonical reference-kind
  decisions. Gateway/Test/invalid-kind references do not acquire mining links.
- Authorized amounts, recorded seller/fee shares and settlement observations are
  not presented as proven balances or refunds. Session and canary are independent
  public markers, with no private ID rendering or graph-wide finality assertion.
- SchemaBlock emits escaped scalar JSON text, with bounded nodes, depth, strings
  and UTF-8 output. It rejects accessors, toJSON functions, cycles and unsupported
  values with fixed text. Reflection-exception handling is not a hostile-Proxy
  sandbox. Native details/summary and focusable pre regions preserve inspectable
  text. No raw HTML rendering or arbitrary URL construction is introduced.
- H8 styles are scoped to `.skill-page`; the prior CSS prefix hashes exactly to
  `503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad`.
  The local content-height override, shrinking grid and full-text wrapping avoid
  a source-level fixed-width overflow trap. State text uses ink, not semantic
  border colors; links, summaries and schema scroll regions have visible focus rules.
  Actual pixels, contrast, native scrolling and focus behavior require parent QA.

## Evidence honesty and limitations

The fully read author report distinguishes missing-module setup, its initial
nonexistent-decoder fixture error and test-only strict error from the genuine
38-pass/1-fail stale standalone-count Red. Its reported final 112/5 focused result
contains 39 new UI cases and 73 adjacent cases, with exact three-root strict zero.
Those are author results, not rerun by this reviewer. Source and assertions support
SSR/content/escaping claims, not actual routed hydration privacy or endpoint counts.
The route signal cancels the server-function request; it does not newly cancel H4's
independently bounded upstream reads. No new overall 25-second bound is claimed.

## Frozen inventory

| Reviewed path | SHA-256 |
| --- | --- |
| apps/web/src/components/evidence.tsx | `2d2fee785b6adec8b589789f0be6bbf9ba9f4f735a84338a251c3df0fc95ef88` |
| apps/web/src/components/skill-page.tsx | `cf4645fad8bd78ea6e8874fe3c30159f1b133e149287f0d0522b6914ec41a4f0` |
| apps/web/src/styles.css | `b986bc5df513af48e1ae8908a38c48773c7514ab15103689c6853f01667d1d7a` |
| apps/web/test/skill-page.test.tsx | `49bc1e0a48f1d5bf2a6e556bccca633caaf15d9310be445e1de1979bd338d569` |
| apps/web/src/routes/skill.$name.tsx | `1514db40caddeb0d077e1058a7361b4fbe93a4917f08fd4f7adc6d4bacae9f71` |
| apps/web/src/routeTree.gen.ts | `672bc8d089517dd4faf97863053844116a5b9fcd677e6afdea6b4ad771b94248` |
| internal/h8-ui-report.md | `b6845021aa03f6e4fc1341158fe44ba2c017084fd6deb77f257034c39d3c6788` |

Separately confirmed unchanged consumed/preservation pins: Nav `6f09382f…`;
TreeGraph `f71e9702…`; layout `4edac462…`; H4 decoder `2b2d10c4…`;
formatter `279097cb…`; Confirm `52d599d0…`. The full values match the author report.
My frozen loader `4496ffb1…`, loader tests `87776e40…` and historical data report
`5116e046…` were unchanged. This report does not self-certify that authored slice.
