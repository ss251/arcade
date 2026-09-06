> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H7 targeted native-scroll follow-up

Date: 2026-09-06, approximately 05:33–05:34 UTC. Separately authorized narrow check after the initial visual report was frozen.

## Verdict

PASS for actual horizontal native scrolling in the synthetic depth-16 graph at 390×844 dark and 1280×900 dark. Exact URL, 17 nodes and page-width containment remained unchanged before/after input. This resolves the initial scrolling-interaction acceptance gap without any product source change or repetition of the 28-case matrix. Mobile keyboard-only scrolling and touch gestures are not separately claimed.

The original `internal/task7-visual-review.md` remains byte-identical at SHA-256 `8386799eb3554918602ccc6d9d0f6db821afbb49bda3d48c798e8ef8dcc38a82`; its historical unresolved observation is not rewritten.

## Owned execution and observed behavior

Fresh directory: `<owned-h7-scroll-directory>`. The retained `supervise.ts` launches the same actual SSR fixture, isolated Chrome for Testing binary and private installed browser-harness daemon; all are exact directly owned children. Real HOME is preserved, profile/cache/BH paths remain private, no shared Chrome/cloud/consent is used, and no external hyperlink is followed. Network blocking and local `Connection: close` carry forward the first run's verified mechanics.

The new supervisor uses a 110-second operational fuse, leaving cleanup headroom within the requested short approximately 120-second bound. Its CDP-file and daemon-socket startup loops now explicitly test both stop state and their own monotonic 15-second deadlines; a Promise.race is no longer the only limit on those loops. The check itself is a directly owned child with a 60-second bound. Actual completion occurred without hitting either operation fuse. Cleanup always runs; stderr remains bounded at 64 KiB per stream.

Command: `bun --no-env-file <owned-h7-scroll-directory>/supervise.ts`, using the approved owned-loopback process permission. No product tests, builds, Git, live hub, wallet, keys, provider or dependency operations occurred.

| Case | Before | Keyboard observation | Wheel observation | Containment |
| --- | ---: | ---: | ---: | --- |
| 390×844 dark, deep 17 nodes | scrollLeft 0 | 0 while tab hidden | 740 after owned-tab activation and one retry | documentWidth 390; graph client/scroll 342/4022 |
| 1280×900 dark, same deep case | scrollLeft 0 | ArrowRight → 40 | then wheel → 390 | documentWidth 1280; graph client/scroll 872/4022 |

The first mobile page was observably `document.visibilityState="hidden"`. Native coordinate focus made `document.hasFocus()` true but the initial arrow still did not move it. The first bounded native wheel call timed out. Following the already-read browser-harness skill, the check activated **only its current owned isolated tab**, then retried the same wheel once. The page became visible and scrollLeft advanced to 740. That value reflects the resulting sequence, potentially including queued input; it is not attributed to precisely one 350px event or interpreted as a component scroll quantum. No touch fallback was needed. On the now-visible desktop case, native ArrowRight and wheel both moved the graph normally.

No JavaScript scroll setter, synthetic DOM click or layout mutation was used. JS/CDP Runtime calls were observation-only; actual coordinate focus, native key events and native wheel input drove the change. Four before/after screenshots visibly confirm that different descendants enter the clipped graph region while the surrounding page remains fixed-width.

This directly establishes the background-tab mechanic for this isolated follow-up. It does not prove the original root-run Chrome startup stall was caused by HOME, or retrospectively assign every earlier input observation to one cause.

## Source preservation

Post-cleanup hashes match the initial visual report:

- styles.css: `503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad`
- tree-graph.tsx: `f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc`
- tree-layout.ts: `4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5`
- tree-server.tsx: `1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f`

The browser-harness/pro skills influenced the narrowly scoped owned-tab activation after an actual timeout. No global skill, helper or runtime was edited.

## Exact evidence and cleanup

All evidence below remains private under `<owned-h7-scroll-directory>/`; nothing here is a public artifact or to be staged.

| Artifact | SHA-256 |
| --- | --- |
| supervise.ts | 69d7fc5f2c9faa96c5e34e3c1eb9386fe6a415a09d5d49ba6ec33df77ef1b994 |
| scroll.py | 2640c09d1b60403e0a59fa2301d39866ac84c736a81b1835b73d278f117baf69 |
| scroll.json | 09749ee95114cc23eee9bb18cb1f894b27a5dc32580db506f9375e7100dcb052 |
| cleanup.json | fe7ba0a69c37c8147c79df1391556020405301cd9a1ad4ec3e1cf58353d2b6f6 |
| port-refusal.json | 099231b8e6e7a3232fcdba5f14f7e64451894631e7861f827e8d0cbeec86360f |
| shots/390-dark-before.png | 1d160e582de925e7a55a2a074aec9cb1f513cf9775b355d3b354b23088edeb3f |
| shots/390-dark-after-wheel.png | 6f692dd390d48c54b124d10ddbfbb0c870cf2098bfc1040f7666c7a59421b6c0 |
| shots/1280-dark-before.png | d7cbdab9fe3fde589f1874f48352f50a5e6ad6d5be0f076dbc575580b8814067 |
| shots/1280-dark-after-wheel.png | 73e45bedca3c341515cd6d996fa2e96ebf1cf3939eb82a1964e8af5d1523bac0 |

The check child PID 23897 exited 0; harness 23872 was terminated by SIGTERM; Chrome 23851 exited 0; fixture 23847 exited 0; supervisor 23844 exited 0. All direct child exit promises and stream drains were awaited; no KILL escalation was needed. Independent post-cleanup socket checks returned ECONNREFUSED on fixture port 65364 and CDP port 65368. An exact-PID inspection found all five processes absent. No service, browser, daemon or check process remains running. The command's only stderr was an installed-harness update notice; no update was performed.
