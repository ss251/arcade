# H14 — read-only capture tool and page evidence

2026-09-06 after780f958. Root-only self-review; no independent/parallel reviewer.
[Brief](task-14-brief.md), [public capture observations](task-14-native-evidence.json).
The script and read-only captures are implemented. **Owner visual ranking,
subsequent selected polish and the real funded-wallet demo are not completed.**

## Tool boundary

Explicit exact hub origin, seller, skill and trusted absolute Chrome executable;
no production default, shell arguments or profile reuse. The shell entrypoint
and child disable environment-file loading and package auto-install. Build the
web separately; there is no hidden build or full-gate rerun in the capture tool.
The actual prebuilt Start handler sits behind a screenshot-only numeric-loopback
server. Only six selected GET pages and simple built assets are served; active
chat/quote/preview/RPC/private-job routes and POSTs refuse. Outbound fetch is
limited to selected public GETs with no credentials, no redirects and fixed
diagnostic refusal. The wrapper passes no inherited model keys or local-publish
flag. This is a trusted-checkout utility, not an OS sandbox for malicious code.

One installed headless Chrome, max2 renderers, isolated empty home/cache/profile,
bounded startup/CDP/page/run deadlines, no wallet extensions, downloads or external
browser DNS. The wrapper performs public HTTP reads; screenshots/browser requests
remain local. Body text, image hashes, actual computed colour scheme, browser
version and cleanup metadata are retained in a fresh temporary output directory.
Each image is a1440x1000 viewport, not full-page/phone/touch/accessibility proof.
The script records failure and stops; it never automatically retries or installs
an alternative browser. Trusted Chrome selection stays explicit.

## Tests and failures, without rewriting history

-21:01:17 tests-first collection failed because the implementation module did
 not exist: no assertion-based Red is claimed.
-First implementation run:14pass/1fail. Vitest it.each spread the array-shaped
 rows; fixed the test table to wrap each complete argv array in an object.
-21:03:02:15 pure policy checks passed. Initial exact strict caught a generic
 Object.freeze map inference, Headers.keys without iterable lib and an unknown
 evaluate result; explicit typed operations corrected these.
-21:09:28:17focused/2files passed,1.11s. Real loopback server, exact runtime
 copies with ONLY built SSR substituted, selected GETs/refusals, no forwarded
 credentials, forced fake-Chrome failure, inherited public environment-canary
 exclusion and exact child/socket cleanup. Not full app/browser proof.
-One exact-optional test-record typing issue fixed without a cast. Final five
 script/test roots strict0. No new framework or dependency.
-First full Chrome capture saved0frames, bounded failure atmarket-light. Second
 added safe diagnostics and extended Page.navigate's deadline to35s, still
 saved0. Third used previously verified launch flags and proved blank renderer
 evaluation, but Page.navigate still timed out;0frames. Each Chrome needed exact
 SIGKILL after bounded shutdown. All nine PIDs/six ports/profile processes were
 independently checked stopped before another attempt.
-A separate actual built wrapper request, without a browser, returned200 in
 1095ms,7651HTML characters, with2publicGETs and0refusals; its child exited0.
 One separately selected public /stats read returned404 in0.706s.
-Installed headless-shell succeeded twelve frames in approximately7s and both
 children exited0. Full Chrome and the successful headless shell both emitted
 CVDisplayLink errors, so those logs **do not establish the original cause**.
 No OS/display setting, shared browser, keychain or install was changed.
-Final explicit no-install/version-recording capture again produced12frames;
 start 2026-09-06T15:56:13.480Z, end 2026-09-06T15:56:20.367Z, HeadlessChrome/151.0.7922.34,
 revision @782af9cb30a53f54487e5d2e44738645a8ec457c. All12 final images were opened and
 visually inspected. Five-run independent cleanup:15exactPIDs absent,
 10formerports ECONNREFUSED, zero owned profile processes.
-One frozen full gate86002 started21:29:24; final results are recorded below.
 No source or browser work overlaps that full gate.

Sole gate86002 exited0:4,232Vitest/187files/56.25s;834Bun/54files/
6,091assertions/162.00s;root/webstrict0;client build completed and SSR174ms.
The middle output (including client duration) was truncated, so no duration is
invented. All six frozen script/test fingerprints remain unchanged. No full
gate repeat. Public/preservation/link audit precedes the local commit.

Final audit passed35source pins (six new, all retained H12/H13 source preserved),
the exact captured built handler, public projection and all12original/copied
PNG hashes,225 local links, selected privacy patterns, empty index and scoped
tracked changes. Screenshot wrapper executable mode is set. Private review
images/HTML and handoffs are excluded from the atomic12-path commit.

## What the actual frames show

The public catalogue has four listings. Diff Triage metadata shows$0.12/version
0.1.0 and the selected public seller. Totals, seller summary, pay-test history,
identity/freshness/count evidence and recent receipts are unavailable, not zero
or fabricated. The fresh buyer has no saved ordinary jobs; sessions are honestly
labelled unavailable. Publish is passive; its manual command scrolls inside its
panel. Chat is disabled because this capture process has no model credential.
The only automatically created storage key observed is the local conversation
history key; no job token, wallet, signature, private result or paid request.

Both scheme colours matched actual ARCADE body tokens; all page widths were
contained within1440px and all recorded browser error arrays were empty.
This is rendered read-only local build/public-feed evidence, not a production
web deployment, a complete live ledger or funded-wallet recovery demonstration.
Full-page content below the viewport is not visually claimed.

## Owner review and remaining work

All twelve unchanged PNGs are in a private local review sheet using the repo's
design tokens. No screenshot or private review surface is committed or uploaded.
Owner ranks meaning, hierarchy, legibility and cosmetics before changes; real
wallet interaction and final submission frames remain owner-only.

One semantic wording candidate is explicit: the disabled-chat prose says each
receipt links to an Arc transaction, which does not cover Gateway transfer
references. No cosmetic or wording change is smuggled into this tool commit.
Unavailable live feeds require later integrated deployment/evidence, not invented
values. Durable browser session recovery still precedes H completion/merge;
deferred G8/G9, vendor-neutrality tasks and Plan I remain.

No new payment, owner key, consumed-approval replay, ENS write, production change,
mainnet action, push or parallel agent/review.

## Frozen source fingerprints

| File | SHA-256 |
| --- | --- |
| scripts/web-screens.sh | 020e940b9bd73512c3cf435e5606dce0884630a8f9eb932b0eaf6a09b07ce1db |
| scripts/web-screens.ts | 70899241ddee907c63af98bf5223bda3f286a911efff9f149575da5648b35780 |
| scripts/web-screens-policy.ts | cbd2e494364e3852893ec5a3b24cec33378e096858c032b3b496a459a28c33f5 |
| scripts/web-screens-server.ts | c61ef877f69df07b36d0b8deb4fc7251aea78f725d92e3d070b8af8f0d3fbf2e |
| apps/web/test/web-screens-policy.test.ts | cf435deb56e7f01e0b0b8da467d3b3a2422aa4c3bfff6f905c82e3315566b8ed |
| apps/web/test/web-screens-runtime.test.ts | eb7e273ac9375588d79656fdc0b13c75ddcd08f976b4210eaf6ed842d168fbb9 |
