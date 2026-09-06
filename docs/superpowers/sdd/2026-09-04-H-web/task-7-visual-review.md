> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H7 isolated browser visual review — bounded checkpoint

Date: 2026-09-06, frozen 05:28 UTC. This report records actual browser observations, not a full UI acceptance or a new product-test gate.

## Verdict and remaining gap

The 28 exact-document viewport/scheme cases passed rendered containment and expected-node checks. Native accessibility/full-detail observations and four keyboard focus/disclosure sequences passed. Saved images show no material layout/text-fit defect in the reviewed synthetic cases. **Horizontal native scrolling remains unverified:** the mobile wide graph has horizontal overflow, but the recorded ArrowRight input produced zero scroll delta. A follow-up native-wheel command did not execute because the finite supervisor had already stopped its private daemon. Do not infer scrolling interaction success from CSS or screenshots. Parent may authorize a separate short targeted check; this report does not authorize a new browser launch.

No product source was edited. No shared Chrome, user profile, hub, wallet, provider, live payment, key, Git command, dependency installation, or full test suite was used. The fixture is synthetic SSR, not the future production receipt page or an authenticated H3/H4 integration test.

## Frozen source observed

| File | SHA-256 |
| --- | --- |
| apps/web/test/fixtures/tree-server.tsx | 1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f |
| apps/web/src/components/tree-graph.tsx | f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc |
| apps/web/src/styles.css | 503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad |
| apps/web/src/lib/tree-layout.ts | 4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5 |

All four matched at readback after cleanup. Parent supplied the corrected CSS freeze before this browser launch. The prior state-text contrast Red and 64 focused parent tests are parent evidence, not tests run by this reviewer.

## One isolated corrected launch

Owned artifact directory: `<owned-h7-visual-directory>` (existing fresh 0700 directory supplied by parent). Retained launch implementation: `supervise.ts`; harness-command child wrapper: `run-harness.ts` in that directory. They are private QA tools, not product entry points.

The supervisor launched the actual fixture with Bun `--no-env-file`, then the installed Chrome for Testing binary at `<installed-chrome-for-testing>`, then the installed Python `-m browser_harness.daemon` module as a directly owned child. This is the same installed module used by the harness CLI; direct ownership allowed awaited child cleanup. All later CLI invocations used `BH_REQUIRE_EXISTING_DAEMON=1` and the exact private CDP origin. No discovery/replacement of a shared daemon occurred.

The captured minimal environment preserved real `HOME=<owner-home>`, used private profile/cache/BH_HOME/BH_RUNTIME_DIR/BH_TMP_DIR/BH_AGENT_WORKSPACE/TMPDIR, and disabled recording, telemetry and domain skills. Metadata-only checks found no harness repository `.env`; no environment-file content was read. Chrome used an ephemeral loopback CDP port, background-network-disabling flags and resolver denial except loopback. The fixture has no external assets/scripts/fetch, and HTTPS was blocked in the page before the matrix. No dummy Arcscan link was activated. This is not a packet-capture claim about every Chromium internal subsystem.

Initial `new_tab`, `wait_for_load`, page observation and native AX query completed normally (0.5-second command). Corrected launch success does **not** establish that the prior root-run stall was caused specifically by HOME: permissions, supervision and other environment details also differed. No second Chrome attempt was made by this reviewer.

## Observation chronology, including setup failures

1. The first matrix used `wait_for_load` alone. Some recorded zero-node observations belonged to an outgoing/error document; `matrix.json` and the initial screenshots outside `shots/final/` are retained **non-final setup evidence**, not accepted cases.
2. Exact URL, selected-case link and expected-node readiness checks exposed real local HTTP 503 navigations (`net::ERR_HTTP_RESPONSE_CODE_FAILURE`), retained in `network-errors.json`. This is a fixture transport observation, not a TreeGraph defect. The fixture has `maxRequestsPerSocket=16`; repeated HTML/CSS requests consumed that finite connection allowance. Setting `Network.setExtraHTTPHeaders` to `Connection: close` for the already-owned loopback requests eliminated the observed 503s; no server/source restart or bound weakening occurred. The full final matrix then passed.
3. The initial custom Enter event omitted native Enter text semantics, so a disclosure assertion failed. Using the installed documented `press_key` helper corrected the QA input, and all four final native sequences opened details. This is not a product Red or a product fix.
4. The first arrow-scroll assertion failed; final `focus.json` explicitly records zero deltas instead of weakening a success assertion into a claim. Desktop wide is not horizontally overflowing (872 client/872 scroll width), so zero there is expected. Mobile wide is 342/422 and remains an interaction gap. The attempted separate deep-wheel command was refused immediately by the already-stopped required daemon; no wheel/scroll proof was generated.

Final browser commands used `bun --no-env-file <owned-dir>/run-harness.ts matrix` and then `... focus`, one at a time. Both exited 0 after the above QA corrections; their assertions cover the scope stated here, not the unresolved arrow-scroll behavior.

## Verified rendering and accessibility

- Four environments: 1280×900 light/dark and 390×844 light/dark, device scale factor 1; actual `innerWidth`, `innerHeight` and `prefers-color-scheme` matched each request.
- Seven cases each: normal 3 nodes, wide 13 nodes (12 siblings), deep 17 nodes (depth 16), long 3 nodes, incomplete 2 nodes, single 1 node, empty 0 nodes. All 28 final cases matched exact document/case and node counts.
- Document/body width never exceeded viewport width. Horizontal graph overflow remained contained: deep SVG width 4014 with graph scroll width 4022, versus client width 872 desktop / 342 mobile. Mobile normal/wide graph scroll width is 422. These are DOM/layout observations, not scroll-interaction proof.
- Across 156 rendered nodes / 468 text boxes, measured text rectangles remained within their node rectangles and price/state rectangles did not overlap. Compact SVG text is deliberately shortened, while full text remains in the native fallback.
- All 24 nonempty cases opened native details with an actual coordinate click on the AX-resolved summary. Native AX exposed the expected links/group labels. Normal has two qualified SVG links and two detail links (plus seven fixture-navigation links). Unsettled nodes have no transaction link.
- The four long cases exposed full 64-character names, full uint256-derived price text and the full 1024-character synthetic reason in native details/AX (long reason StaticText length 1047 including the prefix); no truncated SVG label was mistaken for the full data.
- Four native keyboard sequences traversed navigation → graph region → SVG links → summary → detail link, with `:focus-visible` true. Region/summary/detail links have a computed 2px outline. SVG links have a visible 3px stroke; **it remains semantic green due to CSS specificity, not computed ink**. Screenshots and `focus.json` preserve the actual result. No external link was pressed.
- Synthetic incomplete copy exposes missing receipt/reservation uncertainty and omits unknown digest/budget; empty copy is the explicit fallback; single shows canonical `$0.00`/`$0.00`. No mined/payment-completion claim is inferred.

I visually inspected the saved seven-state set across both sizes/schemes, plus the expanded long-label/detail and representative focus screenshots. Wide siblings extend vertically; deep descendants extend horizontally inside the graph region. Full reason/price wrapping remains contained on mobile.

## Contrast

I read the browser-harness, browser-harness-pro, matching connection/viewport/screenshot references and contrast-check skill. The contrast skill's executable would install a missing dependency; installation was not authorized, so it was not run. Its stated WCAG AA normal-text threshold (4.5:1) was applied with the standard sRGB luminance calculation to actual browser-computed RGB pairs; no global skill/helper file was modified.

| Observed text pair | Ratio | AA normal |
| --- | ---: | --- |
| Light node skill/state ink on card | 16.4393 | Pass |
| Dark node skill/state ink on card | 13.6295 | Pass |
| Light node price blue on card | 6.9910 | Pass |
| Dark node price blue on card | 5.3373 | Pass |
| Light caption slate on paper | 5.1180 | Pass |
| Dark caption slate on paper | 6.1950 | Pass |

These measured text pairs are not a full WCAG certification or a contrast claim for every decorative edge/border.

## Exact retained evidence and screenshot paths

All paths below are under `<owned-h7-visual-directory>/`; these are private retained artifacts, not public links or files to stage.

- `shots/final/`: **52 PNGs**: 28 case viewports, four deep full-page captures, four long expanded-detail captures, 16 focus captures. `screenshot-inventory.json` lists every exact filename/hash. Pattern `{1280|390}-{light|dark}-{normal|wide|deep|long|incomplete|single|empty}.png`; additional suffixes `-full`, `-details`, `-focus-{viewport|svg|summary|detail}`.
- Representative actual images: `shots/final/1280-light-normal.png`, `shots/final/390-dark-normal.png`, `shots/final/390-light-long-details.png`, `shots/final/390-light-wide.png`, `shots/final/390-dark-focus-detail.png`.
- `matrix-final.json`: all final computed geometry, colors, AX names, full detail text and exact-case observations.
- `focus.json`: all four native keyboard sequences and the explicit zero scroll deltas.
- `measurement-summary.json`: six measured contrast pairs, 156 nodes/468 text bounds, zero text-fit/overlap findings.
- `network-errors.json`, `chrome.stderr.log` (32,658 bytes), empty fixture/harness stderr logs, `ready.json`, `cleanup.json`, `port-refusal.json`.
- Chrome stderr contains repeated local CVDisplayLink errors and one failed disabled on-device-component update; navigation, screenshot and AX operations nevertheless worked. Raw log is retained privately, not copied to public docs.

| Private artifact | SHA-256 |
| --- | --- |
| supervise.ts | 218d45a16e04443c8752760e1a8d7b689bb496dd9eb556126b29f62e3e4c0851 |
| run-harness.ts | 23237b0573678836e7d7c7513c7490ee0766f6af184a9c4a380b5061625db642 |
| matrix.py | cc4d3915fdb2ee7b789370d3145a5148f2b38db88d39cd77cc411d7d2ad64757 |
| focus.py | 649ce8e749d7dcf6844ef0276c1fab9449e70a8c012650721c09e39db6936fb7 |
| matrix-final.json | 9c5a11743731a6593cb63bb286f353b1a9c6f1b24938706a9b5f866f2d9b5baf |
| focus.json | c7174f22ed1df890f0398d8c825cd3dd7acc7bb4f35f5a8c33c852eeb0a6c37b |
| measurement-summary.json | 1db574f3d5340fb816f8e079acc2ccba06665c2867ea97fd70e36045758a45c7 |
| screenshot-inventory.json | 2718cf2cc609073c5f66fb22ac0b0e4d58e36b18490a15b839df971a867706e2 |
| network-errors.json | 568680b61716587294ca1267370736f84b823624a8e66580b31746f9c4b71638 |
| cleanup.json | dcfad895b4e68f424e6e9de81886f861ab9d9af557ba77512100738264952484 |
| port-refusal.json | d733c4604ed75a3adbafe9231bc193ec3f043cb4e133fce69f70225e0a241931 |

## Cleanup

Supervisor PID 85654 had a 590-second fuse, parent-death check and direct owned handles. It awaited TERM→bounded KILL fallback and stream drains in reverse order. Actual result: harness PID 85691 terminated by SIGTERM; Chrome PID 85660 exited 0; fixture PID 85657 exited 0; supervisor exited 0. No KILL fallback was needed. An independent later check found all four exact PIDs absent and both fixture port 60513 / CDP port 60520 returned ECONNREFUSED. No service is left running and no restart was performed. The browser's internal helper processes were not individually PID-inventoried; the exact Chrome parent was awaited and its endpoint independently closed.

Reusable private-only mechanics: preserve real HOME while isolating profile/BH paths; own the actual daemon process; require that exact existing daemon on every CLI call; wait for the intended document rather than readyState alone; account for a finite fixture connection budget; use the installed native keyboard helper; retain final and non-final evidence distinctly. No shared runtime/global skill edits were made.
