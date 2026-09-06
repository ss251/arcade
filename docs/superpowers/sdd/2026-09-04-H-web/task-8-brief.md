# H8 — public listing detail

Starts after the F/H integration commit `2580f40`, with H still on its own
branch and main at `5259f9a`. The approved [Task 8](../../plans/2026-09-04-H-web.md)
is implemented against the current H3/H4 contracts, with these explicit corrections:

- Public receipt descendants are flat records, not known direct children. Show
  them without inferred edges; authenticated H7 tree rendering belongs to H10.
- Validate the route's own bounded name before any read. A valid ENS lookup is
  followed by exactly one detail read and one receipt read in parallel; their
  failures are independent. Match the resolved seller and skill to detail before
  presenting that resolved name. Typed expiry is distinct from an unavailable hub.
- Project the response before Start serialization, including replacing pay-test
  job IDs with the existing empty-string compatibility value. No private fields,
  capabilities, provider errors or unknown extras belong in hydration data.
- Missing identity/count evidence is unavailable, not a negative finding or zero.
  Fresh ownership checks do not prove the advertised registration transaction.
  D's bounded validator/attester counts are not all marketplace jobs or this
  listing's paid calls. ENS annotations remain hub-reported, not live runner proof.
- A pay-test or registration hash without chain/rail context earns no explorer
  link. Public receipt links use H4's qualified projection. Display the announced
  registration-document path as a path, not a broken web-origin link.
- Render schemas as bounded escaped JSON, with scoped page flow, responsive
  layout and native keyboard-accessible disclosure controls. No payment shortcut,
  Graph query, token store, dependency or live deployment is added.

## Assignment and acceptance

The loader/projection and its pure tests, the page/evidence components and their
rendering tests, and the owned actual Start/H4 fixture have separate file owners.
The parent owns the route, source review, browser acceptance, one full gate and
publication. A small pure loader module and page component keep SSR tests separate
from router boot while retaining the planned route and evidence interfaces.

Prewritten behavior tests cover privacy at the serialized boundary, invalid names,
ENS expiry/outage/mismatch, independent feed failures, absent versus empty history,
qualified evidence, escaped schemas and flat descendants. Actual route checks must
count allowed reads and show no tree, quote or payment request. Final acceptance
also requires strict TypeScript, client/SSR build and owned desktop/mobile,
light/dark and keyboard checks with bounded cleanup. No acceptance is claimed yet.

TanStack's [server-function documentation](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
and the installed `start-client-core` implementation were consulted because the
configured framework lookup tool was unavailable. Server-function output crosses
the browser boundary; privacy cannot depend on JSX choosing not to print a field.
Existing H4 deadlines remain unchanged; router cancellation is not claimed to
cancel an already-running hub read.

## Parent acceptance — September 6

The [loader record](task-8-data-report.md) preserves its genuine ENS mismatch,
post-read timestamp and metadata/count regressions, ending at 42 focused tests.
The [UI record](task-8-ui-report.md) distinguishes test setup mistakes from its
standalone stale-count regression; final 112 focused tests include 39 new UI cases.
Both [loader/route](task-8-data-independent-review.md) and
[UI/route](task-8-ui-independent-review.md) cross-source reviews are CLEAN.
No reviewer certifies their own authored slice as independent review.

The [actual-route fixture](task-8-route-report.md) passed 9 tests with 21 route
observations: complete Start-serialized privacy, exact allowed reads, partial
states, expiry/outage distinction and cleanup. Its additional lifecycle exit 143
failure was fixed by retiring only a competing Vite handler in the isolated test
process, not by changing production dependencies. All exact nested strict checks
passed. Parent read the complete source/tests and seven historical originals.

The [native browser record](task-8-browser-report.md) covers 16 actual cases across
1280/390px and light/dark, keyboard disclosures and contained schema scrolling.
One hidden-tab wheel timeout required the documented owned-tab activation and
one retry. Six inspected screenshots and actual DOM/counter observations support
the stated scope. All five owned processes are absent; all three ports refused.
No browser/runtime artifact or screenshot is copied into this public directory.

The **single full H8 gate passed**: 3,343 Vitest tests across 145 files (48.99s),
823 Bun tests across 53 files with 5,917 assertions (159.11s), root/web strict TypeScript,
and actual production client/SSR builds (562ms / 361ms). No full sweep was repeated.
H4, payment/Confirm/Chat, H7 geometry and the pre-H8 CSS prefix are unchanged.
The generated route was produced by the installed router/Start tooling. Seven
historical copies preserve original bodies/EOF with only five explicit personal-
or runtime-location substitutions. Parent's final audit verified all seven original
pins and exact copies, ten frozen source/test pins, 64 local links and zero selected
privacy-pattern findings across the ten public documents. This is not a guarantee
that arbitrary prose cannot contain sensitive information. The atomic commit is
the last handoff step; H9 is not implemented by this commit.
