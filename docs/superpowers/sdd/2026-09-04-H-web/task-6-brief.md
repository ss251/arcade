# H6 brief: read-only marketplace and catalogue evidence

Replace H5's `/` shell with the marketplace described by
[Plan H Task 6](../../plans/2026-09-04-H-web.md), following the
[shared work order](../2026-09-04-A-settlement-core/work-order.md).
Keep the keyless web boundary, preserved chat/Confirm/ENS behavior and canonical
F-before-H merge dependency. Nothing in this increment signs, spends or settles.

## Current contract and plan corrections

The real Start server function reads H4's listSkills and stats once in parallel.
Independent nullable results and fixed local error codes preserve one successful
feed when the other fails. Unavailable values never become invented zeros, and
an empty eligible catalogue is not proof that no runner is serving. No polling,
retry, per-card detail/statistics/receipt fanout or H4 transport change is added.
One serialized observation time keeps rendered ages stable across server rendering
and hydration. Passing the router request signal does not prove immediate upstream
fetch cancellation; the unchanged H4 reads retain their own finite bounds.

Cards distinguish absent pay-test metadata on older hubs from explicit null, and
failed observations from passing ones. The additive hub catalogue projection reads
existing store-derived metadata once, overwrites any similarly named manifest
field and publishes only atMs, ok, optional safely shaped passing reference and
the redacted compatibility value `jobId:""`. That empty field is not correlation
or a capability. No buyer, private job ID, nonce, signature or diagnostic is added.
Existing discovery, delisting and ENS-expired filtering is unchanged.

Neither a bare reference nor its hash shape supplies rail/network authority, so
pay-test badges have no guessed explorer link. Catalogue ENS names are annotations,
not independently verified resolution. Explicitly expired names fall back to the
service name and remain labelled; expired and delisted cards have no detail link.
Ordinary native detail links remain informational future destinations, not a
completed listing page or buying flow.

The original reports use “H9” for that future detail page. This historical wording
is preserved in their copies; the approved plan actually assigns `/skill/$name`
to **Task 8** and browser job-token storage to **Task 9**. H6 implements neither.

Prices and totals use validated exact display strings. Recorded totals identify
their hub/subgraph source and can include test or hub-owned canary traffic; they
do not prove customer demand or independently verified on-chain money. Recorded
listing counts need not equal the filtered card count. Missing latency/statistics
remain unknown. React escapes seller prose. Marketplace-scoped styling preserves
chat's viewport/scroll chain and handles long names, descriptions and prices.

## Evidence, without combining authorship

The [historical web report](task-6-web-report.md) records the author's actual Reds:
the absent ListingCard module and the real Start route making zero list/stat reads,
then a real 390-pixel browser finding where a long name and large price collapsed
the title track. The persisted CSS regression failed before the fit-content fix.
Fixture/import corrections and a later attempted read after the first supervisor
had already closed remain explicit, not successful evidence.

The author's final focused web suite passed **245 tests across 19 files**. Exact
nested web TypeScript and actual client plus server-rendering builds passed too.
The author used an isolated owned browser for desktop/mobile, light/dark, keyboard
focus, partial/both-failed/empty/long states and a real future-detail click reaching
the existing not-found page. All eight final screenshots are historical private
artifacts; their hashes identify observations, not additional tests or public
images. Parent read seven web source/test files and inspected all eight images,
but did not independently repeat the author's keyboard/detail-click sequence.
This document publisher did not run or inspect browser pixels.

The [root hub report](task-6-hub-report.md) separately records two actual-router
Reds for missing safe catalogue fields while the existing one-read/no-write case
passed. Root's final focused repeat was **3 Bun tests / 57 assertions**. The
supplemental failed-reference fixture first passed a partial equality check;
an explicit missing-settleTx assertion closed that coverage gap without requiring
a production correction. It is not another Red.

The [independent hub review](task-6-hub-review.md) is CLEAN. Its earlier **3/56**
checkpoint remains historical; the reviewer independently repeated the final
three-test suite after the extra assertion and passed **3/57**. This is distinct
from root's run, the author's 245 web tests and browser work. No independent full
gate or extra strict check is attributed to that reviewer.

The parent subsequently reported H6's own full gate passed: **2,331 Vitest tests
across 117 files; 325 Bun tests / 3,735 assertions across 31 files; root and web
strict TypeScript; actual Vite client and server-rendering builds**. Build phases
took 475 ms and 152 ms respectively. This supersedes historical pending-gate
statements without rewriting them. Parent owns final exact nested/hash/public
review and the atomic commit; no commit, main merge or deployment is inferred.

## Publication boundary

Three retained originals are copied with a two-line historical banner. The web
copy also substitutes eight explicit private runtime path/identifier strings;
the hub implementation and review are banner-only copies. Screenshot/source
hashes and all other report body bytes remain unchanged. The exact map, original
hashes, projected-copy checks and nine-source hash checks are recorded in a private
publication audit. No screenshot, browser profile, runtime journal or owner
handoff is published or linked. This is a targeted publication check, not a
whole-repository secret audit, source review, live proof or repeated test run.

Original SHA-256 values:

- Web report: `cdd26e13182face8e7e41ac5353c1ada55ac1872c9cbaefdcdf2f0696d6dc54e`.
- Hub report: `7c2a2b90a40f9dd8035e75d2244ddad7550d0f1af855fc0b6fddfd56cbd750b3`.
- Hub review: `59c8a45d294086e815eb1002227b2ea5bc9eff5cf6ea3b0fa10059490fbd3a12`.

The document-generation skill informed the separation of current contract,
historical reference evidence and explanatory limits. Its generic Git, sync and
telemetry steps were outside this publication-only task and were not performed.
See the [H index](README.md) and [dated progress](progress.md).
