# H5 brief — preserved chat route, native navigation and marketplace shell

Move the existing page to `/chat` without changing its facts loader, model-key
presence decision, conversation behavior or Chat/Sidebar props. Change only its
route/header integration, preserving E's Confirm and ENS/payment authority. Add a
pure `Nav({here})` with five destinations inside the named section navigation,
one current-page marker and a separate home wordmark. Use the existing visual
tokens, visible keyboard focus and bounded responsive wrapping; do not invent
another color meaning or expand a route move into a component redesign.

`/` is intentionally the empty marketplace shell filled in H6. Seller, buyer and
publish links name future pages, not implemented functionality. The reviewed
implementation uses native anchors, so navigation works without router context
or hydration and reloads the page. This differs from the literal router-Link
example and makes no SPA-transition claim. Regenerate the real route tree and
preserve all existing API routes. No live model, wallet or payment is required.

## Verification and attribution

The [author's retained report](task-5-report.md) records genuine absent-module
and actual-route 404 failures before production edits, followed by eight
Nav/preservation tests, one production-router test and eight unchanged Confirm
tests passing. It separately records the focused web suite (231 tests / 17 files),
actual client **and SSR** build and exact nested web TypeScript. The earlier
client-only build, an uncollected nonexistent test path, an incorrect fixture
label and a checker path error are not concealed or counted as successful proof.

At 14:16–14:18 UTC, the author executed the actual isolated browser checks:
1280-pixel desktop and 390-pixel mobile layouts without horizontal overflow,
light/dark mobile views, 44-pixel section targets, keyboard focus, native
`/chat` → `/` → `/chat` navigation, and synthetic browser-local conversation /
sidebar behavior. These checks did not contact a live provider or use a real
conversation. The marketplace screenshot shows only the intentional route shell.

Parent read all eight frozen source/test files and inspected the four actual
screenshots. Parent separately passed the nine Nav/route cases, eight Confirm
cases and web strict TypeScript. **Parent did not independently perform the
recorded browser clicks.** This document publisher did not run the browser,
inspect image pixels, rerun tests or assert another source review. Screenshot
hashes in the report identify retained private artifacts; no image, profile or
runtime directory is published or linked as a public artifact.

## Browser failure and cleanup boundaries

The shared browser-harness stopped at Chrome debugging consent, which was not
granted. CUA's in-app surface was unavailable and extension attempts timed out.
One created blank tab could not subsequently be obtained/closed; the other
creation result remained unknown. Those attempts are not visual proof, and their
blank-tab cleanup remains incomplete rather than being masked by a later success.

The separately approved isolated Chrome path used its own temporary profile and
harness namespace, local CDP, disabled telemetry/background networking, no user
credentials/extensions and bounded supervision. It did not replace the shared
daemon. The author reports its owned tab/daemon and supervisor/Chrome/Vite children
closed, followed by both listeners refusing connections. That successful isolated
cleanup does not prove cleanup of the earlier inaccessible CUA surfaces. Temporary
artifacts remain private and disposable; no unrelated tab or process was operated.

## Publication and gate status

The public report adds a historical banner and substitutes generic labels for
five temporary profile/screenshot paths, the harness namespace, failed blank-tab
identifier, supervisor PID and listener port identifiers. Body content, screenshot
hashes, source/test fingerprints and evidence limitations otherwise remain exact.
The original report SHA256 remains
`98116b27f5e3871a3a45a636bcbf4961373c769fcec99f9f112fc2be5fe77e73`.
The precise substitution map and equality checks are retained in the private
publication audit, without exporting any executable or runtime artifacts.
Publisher checks at 14:29:59 UTC passed exact projected-copy equality, all 30
local links across these four selected documents, targeted privacy review,
unchanged original/eight source fingerprints and diff check. This does not claim
a global privacy audit, another browser session or independent source approval.

H4's separate commit `d1f89f6` passed its own full gate: 2,308 Vitest / 113 files,
322 Bun / 3,678 assertions / 30 files, strict types and web build. It remains
bounded offline/client evidence, not a live hub result. H5's own full repository
gate remains pending at this publication checkpoint; the author performed only
focused tests/builds. Parent owns final review, full gate and commit. No production
deployment, future page completion, payment, push or F-before-H exception is implied.

See the [approved H5 plan](../../plans/2026-09-04-H-web.md#task-5-move-the-chat-to-chat-add-the-nav-make--a-shell),
[H execution index](README.md) and [dated progress](progress.md).

### Parent follow-up

The [parent review](task-5-parent-review.md) records independently repeated
exact chat-copy, source/protected-file/screenshot hash and nested strict checks,
plus the successful separate full gate: 2,317 Vitest / 115 files, 322 Bun /
3,678 assertions / 30 files, root/web strict and actual client/SSR build.
The author and publisher reports retain their historical observation times.
