# Reference study and design decisions

Reviewed the actual screen images returned by Mobbin, not only search labels. References informed layout grammar; ARCADE's typography, geometry, semantic colors, copy, and interactions are its own. No reference screenshots were copied into the app.

| Shipped reference | What the screen demonstrates | ARCADE application |
| --- | --- | --- |
| [Vercel marketplace](https://mobbin.com/screens/7919ab35-9297-4062-ad5e-d8100878ee66) and [template discovery](https://mobbin.com/screens/5eb6c93d-035b-43ec-bad9-be89a3daa387) | Search and categories sit beside compact, comparable offerings. Each item gets a name and short purpose. | Search, tag intersections, exact price ranges, and measured sorting work together. Listing cards align price and recorded evidence; absent metrics remain absent. |
| [Vercel integration detail](https://mobbin.com/screens/f9ebd5a4-c177-4ad4-badd-c686bd3304cb) and [installed product detail](https://mobbin.com/screens/9325bfbd-2dce-4ed4-834b-83ca28dc6ad3) | Clear title/action relationship; readable overview beside secondary factual context. | Listing purpose, price, input guide, and evidence accompany an input preparation workspace. Exact schema and API details are disclosed on demand. |
| [Stripe first-run dashboard](https://mobbin.com/screens/4c519c10-e838-4c74-9d04-9af674338446) | Orientation leads directly to a useful first action. | Empty buyer state leads to an actual assistant request. Publishing guides a real local preview and runnable repository commands. |
| [Stripe revenue dashboard](https://mobbin.com/screens/a35ca351-394d-47f0-b96f-5e5cb6356bfb) | Measures share a common baseline and subordinate explanatory labels. | Seller earnings, settled calls, and serving skills form one quiet overview; health and cost evidence remain accessible. No invented chart or earnings forecast. |
| [Stripe transactions](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f) | Amount, outcome, and date stay scannable through consistent alignment. | Public receipt rows and the receipt tree's list view use aligned monetary values and explicit settlement labels. |
| [Linear project empty state](https://mobbin.com/screens/5273571d-4f58-410a-97a0-f6018dc8b80f) and [assistant](https://mobbin.com/screens/91bb1f70-f2a9-4c6b-b153-522c8b6a8d62) | Stable navigation, a short explanation, and one immediate way forward. | Product navigation groups publishing under Seller studio. The assistant starts with an editable request, not a tour or a protocol command dump. |
| [Coinbase transaction detail flow](https://mobbin.com/flows/ef88aaa0-96c4-4fc4-98d6-f017b8535e33) | The transaction amount leads; fees and references are subordinate factual rows. | Payment review prioritizes exact USDC, service, recipient, network, success condition, and deliberate approval. Reference identifiers sit under payment details. |
| [Apple Wallet transaction](https://mobbin.com/screens/3b29e0d1-9ce1-4b0b-83aa-d394a3de3017), [payment sheet](https://mobbin.com/screens/5595f01a-1104-407b-b1f5-158a1becf509), and [payment completion](https://mobbin.com/screens/25fc692d-19a1-4de4-a63f-b0a6ecca0bd6) | Amount and payment destination are unmistakable; outcome language is brief and specific. | A bounded payment review surface and readable result lead to the actual settlement link and saved receipt tree. Approval itself never receives settled green. |

## Render-driven corrections

| Before | After | Why |
| --- | --- | --- |
| Large bordered panels repeated at every level | Solid content groups, whitespace hierarchy, restrained hairlines in comparable data rows | Make the work and amounts dominate instead of the containers. |
| Mobile filters occupied nearly the whole initial viewport | Search and sort share a row; tags form a keyboard-focusable horizontal region; shorter result count | A visitor sees an actual service while retaining all discovery controls. |
| Input instructions and editor shared one oversized empty panel | Separate reading column and local input workspace | Avoid a large empty region and give preparation a clear home. |
| Listing context repeated the same instructions twice | One short instruction beside an editable draft | Increase room for the user's actual input. |
| Send stretched to the full multiline input height | Compact button anchored at the composer's bottom edge | Preserve its familiar hit target without turning it into a giant control. |
| Raw network identifier and duplicate skill ID led payment review | Human network label; exact identifiers preserved under details | Prioritize the purchase decision while keeping precise verification possible. |
| JSON dominated successful results | Escaped readable fields with bounded preview, full JSON disclosure | Make results useful without interpreting seller output as trusted UI or losing evidence. |
| At 200% text, narrow controls crushed search and made the hold button excessively tall | Intrinsic card tracks, wrapping search controls, and a minimum usable approval width | Preserve readable prices and a reachable approval target as text grows. |
| A quote expanded into payment terms while chat followed the bottom, hiding the amount on first display | Pause bottom-follow during a live approval; reveal its heading once within the conversation only | Put the amount first without moving the page or pulling a reader away from earlier messages. Restored records never trigger the reveal. |
| CSS and route tests pinned the old presentation | Deliberately refreshed reviewed presentation hashes and copy assertions; preserved behavioral contracts | Keep regression protection aligned with the new design instead of disabling it. |

Motion review: pointer-down press feedback uses an interruptible 120ms custom ease-out transition. Filtering, receipt rows, streaming, and keyboard-oriented history changes do not animate. Reduced motion removes press movement while retaining feedback; the safety hold remains 900ms. Adaptive text contrast is tested in both schemes, including muted address text and all semantic amounts/states.
