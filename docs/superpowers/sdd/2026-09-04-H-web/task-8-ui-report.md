> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H8 listing evidence UI — author report

2026-09-06. Four released source/test paths only; this report is private.
Full current readiness, actual Task 8 and frontend-design, web-design and ts-testing
skills were read. The readiness corrections supersede the plan's unsafe tree
converter, blanket identity/count claims and inferred explorer URLs.

## Implemented contract

- `Evidence({ listing: ListingDetail })` and `SchemaBlock({ title: string, schema:
  unknown })` are pure exports from `components/evidence.tsx`.
- `SkillPage({ data: SkillPageData })` imports the separately owned loader type
  only. It renders the unchanged pure `Nav` inside `.wrap.skill-page` and consumes
  independent listing/receipt/name error states with fixed copy. A good receipt
  observation survives missing listing detail; receipt failure does not erase detail.
- Catalog navigation targets `/`. The detail CTA is ordinary `/chat` navigation
  only, with no prefill, key/token, quote or payment authority. Missing, expired,
  delisted or mismatched detail receives no detail CTA. Shared navigation remains
  available. The page explicitly disclaims purchase-availability guarantees.
- Seller identity, version, declared schemas/bounds, pay-test history and recent
  records use explicit fields. Pay-test job IDs and unknown private fields are not
  rendered. History ages use the supplied observation time, not a hydration clock;
  positional keys handle equal timestamps. History unavailable differs from empty.
- Identity absence is unavailable, not “not registered.” Announced ownership,
  stale evidence and unavailable counts remain distinct. Numeric D counters require
  a canonical agent ID, verified true, stale false, complete integer bounds
  (validation 0–20, feedback 0–4096) and passes no greater than reads. Explicit zero
  survives. Counts describe the configured validator/tag's latest 20 unique requests
  and response 100, plus configured attester/tag/value 1/decimals 0 unrevoked agent-wide
  feedback capped at 4096; they do not claim all jobs or this skill's payments.
- ENS is only a hub-reported expiry observation, never runner-liveness proof.
  Service name stays the page title; correlated resolved name is additional text.
  Seller/pay-test/registration references lack chain context and stay unlinked.
  Registration document metadata is an announced path, not a broken local anchor.
- Recent records and their **flat recorded descendants** are lists, not invented
  TreeViews, edges, parents or child latency. No H3 tree endpoint is called. A receipt
  explorer must equal the current context-qualified formatter result AND the exact
  H4-supplied explorer. A missing H4 link is never reconstructed. Gateway, Test and
  invalid kinds remain unlinked; compact children retain root reference context.
  Recorded settlement status and amounts are explicitly not a balance/refund proof.
  Root-only public session and independent canary markers are retained.
- Schema inspection uses native details/summary and a focusable local scrollable
  preformatted region. The scalar-only encoder bounds 8192 visited nodes, depth 16,
  65536 output UTF-8 bytes and individual string/key length before encoding. It rejects
  unsupported values, sparse arrays, symbols, non-enumerable/accessor data, cycles,
  custom object prototypes and reflective exceptions with fixed text. It never calls
  an input getter, coercion or toJSON. Text is escaped by React; no raw HTML rendering.
  This is not a hostile-Proxy sandbox or a proof that arbitrary reflection cannot run.

## Design and scope preservation

The design skills led to a restrained specification-page layout using the existing
paper/ink system, machine-reference mono and quantity sans, native disclosures,
visible focus and content-driven wrapping. No fonts, images, motion framework or
dependency were added. State text is ink; existing settlement colors remain borders.
The style changes are append-only `.skill-page` rules, including the local content
height override, shrinking grids and schema overflow. Every preceding CSS byte
reconstructs SHA-256 `503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad`.

No Nav, Chat, Confirm, H4, H7 component/layout, route, loader, hub, payment, public
document or dependency source was edited. No network, browser, build, full suite,
Git, credential lookup or spending occurred. Parent owns route integration and
actual desktop/mobile, light/dark and native keyboard/scroll verification.

## Executed chronology

All Vitest runs used the installed canonical Node-shebang CLI under empty environment:

`env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run <focused paths>`

1. **12:01:41 IST:** missing `evidence.tsx`; one failed suite, zero collected tests.
   This is setup/missing-module evidence, not an executed behavioral product Red.
2. **12:05:21:** first implementation run collected 33: 12 passed, 21 fixture errors
   because the test used nonexistent `decodeListingDetail` instead of actual
   `decodeListing`. Corrected the fixture only, preserving real H4 decoding.
   These errors are not product Reds. **12:06:12:** 33/33 passed.
3. Exact nested strict initially found one test-only exactOptionalPropertyTypes
   error for explicit optional undefined; fixed by genuinely omitting the field.
   Added supplementary malformed/escaped schema, prose and withheld-link controls.
   **12:08:01:** 110/5 passed; exact three-root strict zero diagnostics.
4. Parent found that an initial stale/unverified numeric fixture did not represent
   an actual H4 output. Replaced it with real H4 fresh, zero and stale/unverified
   cases, plus an explicit standalone component bypass regression. At **12:09:42**,
   evidence source `c681a7d34fc2fd7052ddd0f57515dd74f2a7964f01559afa1b0a977064411b00`
   produced **38 passed / 1 failed**: stale standalone props visibly retained 7/9
   validation and 3 feedback counts. This is a genuine exported-component Red, not
   a claim that H4 or the normal loader emitted that invalid mixture.
5. Applied only the evidence count-bundle guard. **12:10:22:** final **112/5 passed**,
   exit 0, 899 ms: new UI 39, unchanged Nav 8, Market 13, H7 component 24, formatter 28.
   Final scoped TypeScript program used the actual web config/cwd and exactly
   evidence.tsx, skill-page.tsx and skill-page.test.tsx as three roots: strict true,
   **zero diagnostics**. No replacement config, casts or skipped strictness.

Final focused paths: `apps/web/test/{skill-page.test.tsx,market.test.tsx,nav.test.tsx,tree-graph.test.tsx,format.test.ts}`.
The tests establish SSR/content/escaping/structure and CSS-prefix properties, not
actual pixels, focus behavior, touch, routed hydration privacy or endpoint counts.
Those route/loader and browser checks remain separately owned.

## Final freeze

| Owned path | SHA-256 |
| --- | --- |
| apps/web/src/components/evidence.tsx | `2d2fee785b6adec8b589789f0be6bbf9ba9f4f735a84338a251c3df0fc95ef88` |
| apps/web/src/components/skill-page.tsx | `cf4645fad8bd78ea6e8874fe3c30159f1b133e149287f0d0522b6914ec41a4f0` |
| apps/web/src/styles.css | `b986bc5df513af48e1ae8908a38c48773c7514ab15103689c6853f01667d1d7a` |
| apps/web/test/skill-page.test.tsx | `49bc1e0a48f1d5bf2a6e556bccca633caaf15d9310be445e1de1979bd338d569` |

B9 confirmed the separately owned final DTO source `skill-page-data.ts` quiescent at
`4496ffb12f2b988141a6b6c05ecfd53a374ae50b6a81f3a53663e881f8205f89`, matching final inspection.
It exports the serializable SkillPageListing subtype, assignable to ListingDetail.
The UI imports only its type; its runtime and tests are not claimed here.

Preserved source pins: Nav `6f09382f40a7eab337fafed655fefca415547ef2d71a7417f40de6fff96a0077`;
H7 component `f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc`;
layout `4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5`;
H4 decoder `2b2d10c48a363d7f5dc7379ebfdf7963de0e5c11b61e58791d691b575dc2f6af`;
formatter `279097cb9490e51559336d74dead3210dccfe926ec5b66a76c1c2949cc3e5855`;
Confirm `52d599d0d1208d1ae7be74298e15eb104c7204cbf7ade8e081336c0a28b4b52c`.
