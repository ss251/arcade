> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10 ordinary-browser transport/CORS preflight — September 6, 2026

Read-only, bounded source-composition review after H8b7fee76. **H10 remains held.**
No source/test, browser, server, external request, key, payment, Git, dependency or
gate action occurred. Fully read current H9–10 readiness and the actual ordinary
paid/acceptance/result/tree boundaries, F dispatch/auth/transport, H4 HTTP/decoders,
current web quote/settle/signing contracts and relevant configured-origin source.
This note proposes policy, not a deployed CORS observation or executed Red.

## Actual integration gaps

- `apps/hub/src/server.ts:788` invokes F session routes and session-call routing
  before ordinary routes. There is **no application CORS/OPTIONS implementation**
  in that server or the F route helpers. F's `sessionJsonResponse` adds private,
  no-store JSON, not CORS. Deployment/proxy headers were not inspected.
- Ordinary POST `/x/<seller>/<skillId>` reads the actual JSON input, returns the
  actual-input402 challenge when genuinely unpaid, verifies the supplied payment,
  persists queued Job, launches execution and returns202. Current browser quote
  constructs the seller-address route; do not substitute F's service-name route.
  `payment-signature` wins over `x-payment` by nullish precedence. Both current
  web relay headers contain the same encoded payload, including original accepted
  requirements; a CORS wrapper must not consume/rewrite its body or payment bytes.
- Ordinary202 (`server.ts:1290`) contains canonical generated job_id, job_token,
  price and poll_url **with the capability query parameter**. Its URL uses socket
  `url.origin`, unlike challenges/discovery using `publicOrigin`: behind a proxy
  that can advertise the wrong origin. Correct ordinary acceptance to the already
  configured validated public origin; do not trust Host/forwarded headers anew.
- `tokenFrom` accepts x-job-token first, then legacy query token. `/jobs/:id/result`
  authenticates before Store IO but scans allReceipts every300ms for up to120s,
  without request-abort checks/cancellable sleep. A browser abort therefore does
  not currently establish backend poll cleanup. Normal result/job/acceptance JSON
  also lacks private/no-store; tree and F responses already have it.
- Existing buyer `index.ts:125–136` follows poll_url, including query token, and
  does **not** use job_token. Removing the query globally would break that caller.
  Browser code must never request/log/persist that capability URL: validate its
  bounded legacy shape and origin/job/token agreement, then discard it and build
  the query-free result path from captured issuer + validated job_id. Keep legacy
  server output for existing nonbrowser callers unless separately migrated.
- `/api/settle` currently receives that capability and polls server-side. Returning
  its held token to JavaScript would not satisfy browser-only custody. Neither it
  nor a GET Start server function is a permissible capability retrieval relay.
  Root's purchase-authority correction must precede any direct paid-submit claim.

## Minimum proposed CORS contract (requires parent acceptance)

Add one import-safe pure policy in `apps/hub/src/browser-cors.ts`, wire it once
around the selected ordinary routes in `server.ts`, before body/Store/rail IO.
Proposed **new** configuration: `ARCADE_WEB_ORIGIN`, one exact canonical origin,
bounded2048bytes; production HTTPS only, literal127.0.0.1/[::1] HTTP for explicitly
owned local development. Reject userinfo/path/query/fragment/whitespace, opaque
`null`, wildcard, suffix matching and arbitrary request-origin reflection. Invalid
configured value fails startup with fixed text; absent means browser cross-origin
support is unavailable, not permissive fallback. Do not derive it from a listing,
Referer, Origin, proxy header or ENS metadata. No actual value was read here.

| Exact supported route | Method | Allowed author request headers |
| --- | --- | --- |
| `/x/0x<40hex>/<canonical skillId>` | POST | `content-type`, `payment-signature`, `x-payment`, optional `accept` |
| `/jobs/<canonical job_id>/result` | GET | `x-job-token`, optional `accept` |
| `/trees/<canonical job_id>` | GET | `x-job-token`, optional `accept` |

Use H4/H9 canonical job/skill/issuer rules, not the legacy broader server regex.
No token query in this **browser** policy; do not remove nonbrowser compatibility.
No `/jobs/:id` detail read is needed for minimum result/tree retrieval. No public
feed, registry, runner websocket, ratings or broad `/sessions` grant is implied.

OPTIONS with an approved Origin, exact route/method and bounded closed header-name
set returns204 without auth/body/Store/rail work. Header parsing should bound bytes
before splitting (e.g.512bytes/four names), normalize ASCII case and reject unknown
or duplicate names. Return that exact approved origin, route-specific method and
validated header subset. No `*`, credentials permission, bearer/header reflection,
private-network permission or unnecessary exposed response headers. Actual current
challenge/acceptance/result values are JSON bodies, not custom response headers.
Preserve `Vary`; add Origin and the requested-method/header variations to preflight.
Initially no preflight cache (`Max-Age:0`/no-store) simplifies exact browser tests.

Decorate **all actual outcomes** for the allowed ordinary request—402,202,200 and
fixed failures—with matching ACAO + Vary and private/no-store, preserving the
existing status/body/headers. A rejected browser Origin or foreign/malformed
preflight receives fixed refusal before selected-route IO, never the private
response with permission omitted after a mutation. No-Origin CLI/seller traffic
retains existing routing/auth. Same-origin hub-browser compatibility must be an
explicit policy choice, not an automatic trust of `req.url`/Host; current minimum
is the one configured web origin. CORS is not payment or capability authorization.

Do not include `x-arcade-session`, `x-session-token`, `x-arcade-hire-capability` or
`authorization` in this policy. Present-even-empty F headers on these browser
routes must not become an ordinary fallback. F endpoints keep their current
separate HMAC domains, three-header result auth and private responses; no F CORS
enablement, session import/export, opening/closing or source rewrite is required.
Current `/trees` does not itself reject every extra session header, although its
ordinary HMAC rejects session-job tokens: do not overclaim the existing matrix.

## Browser transport and cleanup seam

NEW `apps/web/src/lib/ordinary-job-http.ts`: browser-safe, no server environment,
signer or buyer-session import. Capture validated issuer once from a capability-free
public server fact, then bind every stored selection/request to that issuer and
ordinary realm. Public origin serialization is allowed; token serialization in
Start props is not. Proposed bounded `readOrdinaryResult` and `readOrdinaryTree`
take canonical job/token + AbortSignal; tree uses actual `decodeTree`/H7 shape.
Any direct `submitOnce` entry belongs to root's separately approved purchase edge,
not an effect triggered by selecting history or a generic arbitrary-URL helper.

Construct only fixed paths. Use GET header x-job-token, `credentials:omit`,
`redirect:error`, `cache:no-store`, `referrerPolicy:no-referrer`; no token-bearing
URL, web relay, model message, console, analytics, history transcript or exception.
Snapshot the exact bounded input JSON/payment header before a paid attempt; send
once after explicit fresh authority, never retry POST after CORS/timeout/abort.
Capture/validate202 and persist acceptance **before** read polling, retaining
uncertainty when terminal retrieval fails. Correlate job/issuer/skill/seller/buyer/
network/amount and settlement-kind fields before accepting terminal evidence;
ordinary acceptance alone does not prove a settled amount or a tree commitment.

Use a monotonic whole-response deadline, declared+actual byte limits, strict UTF-8/
JSON, redirect/response-URL checks, caller-abort composition, finite body-cancel
cleanup and removal of listeners/timers. H4's current jsonFetch overwrites supplied
signal; it cannot be reused unchanged while claiming caller cancellation. Keep one
read in flight; clear previous view first and ignore late responses from a forgotten,
unmounted or changed issuer/selection. Read-only polling may repeat only explicitly
validated202/pending within one total budget; never retry an unknown paid outcome.

Parent should narrowly make the ordinary server result loop abort-aware before
claiming backend cleanup: signal-bound Store execution, per-continuation checks,
cancellable300ms sleep and final listener/timer cleanup. Preserve auth-before-IO.
This cancels **retrieval**, never the independently admitted execution or settlement.
The paid ordinary `req.text()` is currently not application-bounded like F's body
reader; a bounded131072byte browser input does not establish a hub-wide limit.
Reuse/factor a reviewed bounded reader only in a separately approved ordinary
POST correction, without weakening F's stricter admission/capacity invariants.

## Required tests and exact proposed paths

- NEW `apps/hub/test/browser-cors.test.ts`: pure policy table, fixed diagnostics,
  absent/null/foreign/confusable origins, malformed/oversized header sets, forbidden
  F/hire headers, no-Origin compatibility, status/body/header preservation.
- NEW `apps/hub/test/browser-cors.bun.test.ts`: actual production Bun router with
  owned synthetic RailTest/Store/runner seams and exact IO counters. OPTIONS must
  do no IO/signing/job creation. Actual allowed requests preserve payment bytes
  and JSON; malformed origins fail pre-IO. Existing ordinary/F realm tests remain.
  Abort a real pending result request, then prove bounded cessation of reads.
- NEW `apps/web/test/ordinary-job-http.test.ts`: deterministic bounded stream,
  Unicode/bytes/JSON/redirect/late-response/abort/acceptance-binding cases. These
  mocks do not establish native CORS or browser header behavior.
- NEW `apps/web/test/fixtures/buyer-server.ts` plus
  `apps/web/test/buyer-route.test.ts`: exact distinct owned web/hub origins and
  actual browser execution through production policy/transport, not a mock hub
  that merely emits permissive CORS. Parent owns native browser acceptance.
  Observe native OPTIONS + readable402/202/result/tree, forbidden origin/header
  no paid dispatch, canonical capability in hub header only, zero web/model URL/
  request-body/transcript/SSR leakage, post-abort no late view or Store reads.
  Independent finite child reaping + closed ports; no real signer/payment/network.
- MODIFY `docs/runbook.md` only after policy approval to document the exact new
  origin configuration, proxy forwarding/header preservation and unsupported F
  browser path. Parent-owned purchase/Chat/sign/API files need their own approved
  scope; this preflight does not release or redesign them.

Unresolved technical acceptance: actual proxy public-origin and CORS forwarding,
native preflight header set (browser-supplied headers must not motivate `*`), private
network/mixed-content deployment behavior, desired long-poll total deadline/body
ceiling, same-origin hub browser policy, and root's one-shot purchase/capability
handoff. F's native session transport sets forbidden browser `accept-encoding`;
do not import it wholesale as an ordinary browser helper. Unsupported Gateway
signing and query-token CLI compatibility remain explicit, not inferred solved.

## Current inspected pins

| Path | SHA256 |
| --- | --- |
| `internal/task9-10-readiness-current.md` | `ea1a26d2993adecb90d6d6dfd8a6fde382da4be2bf62ec043778548ff71a05a1` |
| `apps/hub/src/server.ts` | `5362e18f456cb843f2d9452cabc9385e897d84de77b1f1e4f08d63421a50b519` |
| `apps/hub/src/server-sessions.ts` | `af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968` |
| `apps/hub/src/server-session-calls.ts` | `10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c` |
| `apps/hub/test/receipt-tree.bun.test.ts` | `4b0061cdeafc6a889782895bb62501813530025d0d53b4dbb6a4c1219b0204fa` |
| `apps/web/src/routes/api.settle.ts` | `3132399bc1880f3698b58c6d96d3b3d5941cf46f4d60424f798f02e4c4fa0088` |
| `apps/web/src/lib/hub-http.ts` | `25d571ddba8f4114e927ed23653e5a9e6eeeb3db7f044e7d9fdf05c71a7b6110` |
| `apps/web/src/lib/hub.ts` | `506b21a5585be87fc2b4523fa9d2fb686bbef2fa1f60fa49bff0b48afc1abb99` |
| `packages/buyer/src/session-http.ts` | `fbb95a382a0922bf01234d8c006704690a341f63532e151dff1bec74dcc27fb9` |

Only this ignored preflight was written. All proposed checks above are **NOT RUN**;
this is no live/proxy/browser/payment/cancellation proof or current source freeze.

## Same-day parent authority-proposal composition check

After freezing the preceding preflight (`abfd0b67ee5b3b8fcad3a20b144d6dd8f16b1016ec4ca3a7a8f947c51a44997a`),
fully read parent's121-line `internal/h10-authority-preflight.md`, SHA256
`78634d644cc1c6bcdbbe5ebe2dcb27dafa7f06659c467851e94518e40f89bd20`.
The proposed H10a authority/transport then H10b dashboard split is coherent.
No added transport blocker beyond the gaps above; two exact details must remain
explicit in the corrected source brief:

1. Current Thread→Chat approval callback carries only approval.id + boolean
   (`chat.tsx:732–739,887`), not toolCallId/input. Mint the one-use permit from
   the actual confirm closure's captured approval.id, toolCallId/tool name,
   original canonical input and ceiling. Do not recover those facts later from
   model-provided `awaitingSignature` output. Both IDs must be correlated; a
   later replayed tool output cannot stand in for the original click.
2. `paymentRequirementsKind` is a **signing-domain discriminator**, not proof of
   one of the three settlement rails. Actual `test-rail.ts:44–58` emits the same
   USDC domain metadata as EIP3009. Do not automatically label `usdc` as proven
   eip3009, or imply a USDC signature given to a test service is harmless. Keep
   operational Test signing unsupported/explicitly qualified without trusted
   captured rail context; native tests use only synthetic offline wallet fixtures.
   Gateway helper validation/recovery remains appropriate, not a session export.

Read `gateway-sign.ts` completely for this check: SHA256
`6b8621b0ea5aa793441d877f07877523f377e0274de9c2feeda998e438a28893`;
observed Test source SHA256
`112e408bd2737885cc339e82a40069e1c4a7d2466c53bc256de3e7ea40c453d1`.
These are source-composition findings only; no signing/test/browser action ran.

## Same-day public-origin wording correction

Parent identified an overstatement in the preceding proposed transport wording:
the existing configured public origin is **not validated**. Independently reread
`apps/hub/src/server.ts:106–225`: preflight checks configuration presence and
durability conditions, while `publicOrigin(url)` returns raw
`process.env["ARCADE_PUBLIC_URL"] ?? url.origin`. It neither parses nor captures
a canonical origin. Thus “already configured validated public origin” must not
be read as an existing guarantee.

H10a must explicitly validate and capture the canonical advertised hub origin
when browser support is armed (or define an equally explicit scoped policy).
Reusing the current raw helper does not establish that property. This is distinct
from validating the allowed browser origin, and neither may be inferred from
proxy request headers. The socket-origin/poll-URL compatibility finding above
remains unchanged. This appendix preserves the prior 210-line report prefix
SHA256 `87a6fbad228df1c9d8ff88f5bf4b0595c63f9bbb50d8b12b138701d8d378679e`.
No source edit, environment-value read, test or network request occurred.
