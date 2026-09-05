> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H3 follow-up — unresolved root-ledger reservations

2026-09-05, frozen after focused verification at 11:11:15Z. This corrects an independent review finding; the original `internal/task3-report.md` is unchanged (SHA-256 `eed3bd06e005ae357b4b1c5494fd2907286b87b8a9323503cf9085c90fd5050d`).

## Finding and correction

The root's flat `children` manifest excludes released calls but includes reserved and committed calls. A manifest member with `settled:false` is therefore unresolved, even when a matching non-settled receipt exists and the canonical digest plus committed total are internally coherent. The earlier builder incorrectly returned two nodes with `complete:true` and no flags for that case.

Added the fixed `reservation-unresolved` evidence flag for every unsettled manifest member. The actual non-settled node may remain visible with `settled:false` and no explorer, but completeness is false. A legitimate failed released descendant **absent** from the manifest remains complete when all other lineage/commitment evidence is coherent; that pre-existing test is retained unchanged.

The local `treeHash` remains only a checked recorded digest. Neither this flag nor the existing builder performs a mined-transaction check or turns the digest into on-chain proof.

## Evidence

- Genuine Red at16:40:45IST /11:10:45Z: new coherent-digest/committed0/matching-unsettled-child regression failed `expected true to be false`;19 existing tests passed.
- Green at16:41:07IST /11:11:07Z:20/20 focused tree tests,25ms.
- Strict TypeScript compiler using exact root options and explicitly including `tree-view.test.ts`:0 diagnostics.
- `git diff --check`:clean.
- Frozen source SHA-256: `c6ac65dd4e92cbb81bee2c1aebf92248887342fabaaddf423b8f8d5afe14f19f`.
- Frozen test SHA-256: `501ad2f4931a90534666323700eb692bd60841e9a475d2f15b78092156355395`.

Only the pure tree module, its focused test, and this new ignored report changed in this follow-up. No route/store/web/paid-path edits, keys, I/O runtime, network, full suite, Git mutation or live activity. Parent owns independent review and integration.
