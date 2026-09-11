# ARCADE product overhaul

## Routes and features

- `/`: searchable catalog; intersecting tag filters; exact micro-USDC price bounds; price, recorded settlement-rate, median-latency, and evidence-volume sorting; explicit result reset; public receipt feed with independent failure handling and manual refresh. Measurements name their sample; missing measurements sort last.
- `/skill/:name`: purpose and price first; readable input guide and recorded evidence; editable local JSON preparation; honest seller examples or labeled generated format templates; output-format preview; copyable JavaScript for the existing unsigned quote endpoint. A bounded one-shot session draft reaches `/chat?skill=…` without being put in the URL or sent automatically.
- `/chat`: editable first requests, listing context, multiline composer, IME-safe keyboard behavior, accessible history chrome, designed working/error states, and clearer result output. The payment card leads with exact USDC, service, complete recipient, network, and success-only settlement. Pointer/keyboard approval still requires the complete 900ms hold; release, identity change, or cancellation cannot authorize payment.
- `/buyer`: result-oriented saved jobs, readable escaped output, settlement links, and diagram/list receipt exploration. Original calls precede hires in the list; each hop keeps its actual recorded relationship and guarded Arc URL. Explicit wallet balance reads use the USDC ERC-20 six-decimal interface, verify account/network before and after, expire through a deadline, and clear on wallet changes. No automatic wallet reads or signatures.
- `/seller`: earnings after platform fees, settled calls, runner health, actionable listing states, and payment-test history/references. Cost completeness and accounting provenance remain accessible without dominating the overview.
- `/publish`: local input preview, public/private listing review, copyable repository commands, first-time identity/payout setup instructions, and explicit next actions. Hosted deployments honestly direct users to the local publisher.
- Shared route states: loading, missing-page, and error recovery retain product navigation. Retry links preserve seller/skill query context and remain same-origin.

## Deliberate test updates

| Tests | What was deliberately updated |
| --- | --- |
| `nav.test.tsx`, `nav-route.test.ts` | Four product sections, publishing grouped under Seller studio, reviewed chat-route prefix/suffix hashes, and the new toolbar text. History and draft behavior are separately verified. |
| `listing-rails.test.tsx`, `skill-page.test.tsx` | Reviewed stylesheet-prefix hashes and scoped CSS boundaries for the new system; updated local-input preparation and concise result-count assertions. Payment rails still only filter declarations. |
| `market.test.tsx` | Human service names, compact evidence, and intrinsic card tracks verified after 390px/200% rendering instead of the old fixed price-column percentage. |
| `market-route.test.ts`, `buyer-route.test.ts` | The market now independently reads public receipts. Buyer SSR still reads none; its zero-read fixture assertion includes the new receipt counter. Updated page/count copy. |
| `buyer.test.tsx`, `purchase-view.test.tsx` | Action-oriented result/tree labels and the shared complete-result JSON disclosure. Private recovery capability and unsafe-output protections remain intact. |
| `publish.test.tsx` | Commands now use the actual repository entry point, `bun run arcade`, instead of an assumed global binary. |
| `thread.test.tsx`, `schema-example.test.tsx` | Shorter first-run instructions and the truthful local-preparation wording after rendered review. Assertions still reject autosending and fabricated completed output. |
| Other web presentation tests | US English wording, updated semantic presentation, and explicit neutral non-settlement states. |

New tests cover discovery ordering and exact money, activity qualification, input generation and private one-shot handoff, executable unsigned quote snippets, wallet ABI/units/deadlines/account changes, readable untrusted results, receipt order, safe contextual retry, keyboard composition, and adaptive text contrast. Four approval-reveal policy tests cover one reveal per live decision, passive historical records, readers already looking back, and scrolling back while terms load; the browser capture checks first-show amount visibility before moving the viewport.

## Evidence boundaries

The headless Chrome review runs the actual TanStack Start app against an isolated synthetic hub and model stream, with a well-known offline fixture account. It verifies the real approval and recovery code, including a canceled hold and exactly one complete synthetic purchase. It makes no live chain transaction and does not prove the availability of an external model provider. All screenshots are labeled as fixture evidence in the capture manifest and index.

See [the capture index](README.md), [reference study and render corrections](REFERENCE-STUDY.md), and [accessibility proof](README-accessibility.md). No commit or deployment was performed; implementation changes are confined to `apps/web`.
