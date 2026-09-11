# Final rendered review

The final route matrix was captured at `2026-09-09T13:37:54.623Z`; its source fingerprint is `0759cd039eaca86904f6b31d706359954dc1522018e087b0ff55ae7e1ad67d38`. The subsequent 200% root-text/reduced-motion pass has the same source fingerprint. Both manifests report stable source and no errors.

## Inspection

All six primary contact sheets were opened after the final capture, covering `/`, `/skill/diff-triage`, `/buyer`, `/seller`, `/publish`, and `/chat` at 390, 834, and 1440 pixels in light and dark. The discovery, preparation/API, wallet, result, receipt-tree, empty, and error sheets were also inspected across the size/scheme matrix during iteration. Final individual phone marketplace/listing and phone/tablet approval images were opened at readable size. The final 200% control and active hold images were inspected separately.

Corrections from those reviews are recorded in [REFERENCE-STUDY.md](REFERENCE-STUDY.md). The final payment correction is demonstrated by the retained before-fix `approval-review/` diagnostic and the passing `approval-proof/` capture: the app now reveals the payment heading without moving outer page scroll. The final main capture never scrolls the card into place before checking its heading and amount.

## Browser checks

- 156 route/state frames, each with viewport and full-page PNGs; no browser exceptions, console errors, or document overflow.
- Actual local search, intersecting tags, exact price bounds, unknown-last sorting, activity refresh, JSON preparation, one-shot private draft handoff, and multiline composition exercised through the UI.
- All six normal-size approval cases show the heading and amount spontaneously. A real pointer hold produces progress, releases unsigned, and resets. A separate complete hold invokes exactly one synthetic signature and one accepted fixture call per case.
- Result recovery, parent-first receipt list/diagram, guarded settlement links, wallet six-decimal balance display, and wallet failure states exercised.
- Additional 390px/200% text/reduced-motion capture verifies usable wrapped controls and an actual hit-tested, canceled hold. The authorization duration remains 900ms.

The app runs against an isolated synthetic hub and model stream for these checks. No live model availability or real Arc settlement is claimed; no live funds were used.

## Live demo prerequisites

A final read-only configuration audit found no workspace `.env` files, no configured `ARCADE_MODEL` or supported provider key, no `ARCADE_HUB`, and no reachable default hub at `http://localhost:8787/healthz`. A real free discovery turn therefore cannot run in this workspace yet. Configure a supported model's matching provider key and a reachable hub (or run the default local hub). A hosted purchase demo additionally needs `ARCADE_APPROVAL_SECRET`. The audit did not print secret values, call a model, sign, or pay.

## Automated validation

- `bun run typecheck`: passed.
- `bun run web:build`: passed.
- `bun run test:vitest`: 5,477 tests passed across 251 files.
- `bun run test:bun`: 1,885 tests passed across 100 files in the final serial run (327.05 seconds). Together with Vitest, both parts of `bun run test` are green: 7,362 tests.
- An earlier Bun subprocess hit its existing 15-second startup timeout while Vitest and the build were running concurrently. Its entire 398-test file and the final complete Bun suite passed unchanged on rerun.

The deliberate presentation assertion changes and new behavioral coverage are listed in [IMPLEMENTATION.md](IMPLEMENTATION.md). No tests were disabled or given larger deadlines. No commit or deployment was performed.
