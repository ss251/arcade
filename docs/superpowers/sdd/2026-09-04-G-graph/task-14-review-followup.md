> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# G14 independent-review corrections

Date: 2026-09-05. This is a new follow-up to the two frozen reports. `internal/task14-report.md` and `internal/task14-followup-report.md` were not edited.

## Corrected child correlation

The reviewed source accepted a broker child whose `jobId` equalled the parent grant and accepted one child ID reused by both fixed hires. That could produce two payment claims without two distinct child jobs.

At `2026-09-05T11:45:42Z`, a pre-fix focused regression exercised three cases: flow child equals parent, settled Graph child equals flow child, and definitive nonsettled Graph response equals flow child. The selected test failed because the first invalid topology returned `end_turn` instead of the fixed refusal. No intentionally broken source was introduced.

The consumer now requires the settled flow child ID to differ from the parent grant and requires every Graph broker response, including the allowed definitive nonsettlement form, to differ from both parent and flow IDs. The regression then passed.

## Runtime and cancellation evidence

`test/runtime.bun.test.ts` executes the real wallet entry through `execSkill` and an owned real `startHireBroker`. Purchases and listing lookup are injected dummy functions; no key is used for signing and no provider, RPC, Graph gateway, hub or chain is contacted.

The runtime rail proves:

- two distinct dummy settled children produce one successful parsed wallet output with exact caps, lineage, budget and no logs;
- a correlated definitive Graph nonsettlement produces a flow-only caution with no Graph payment claim;
- an injected post-dispatch purchase failure is attempted once, refuses the parent and does not reflect the private diagnostic;
- an actual `execSkill` launch without a grant refuses and does not inherit or reflect a sensitive environment marker;
- importing the actual entry with ignored stdin exits zero with empty stdout/stderr and no retained timer;
- invalid envelope, truncated JSON and stdin beyond 64 KiB each produce exactly one compact fixed refusal and empty stderr;
- an actual stalled Unix request reaches the wallet's 32-second deadline, produces exactly one fixed refusal and is not retried.

The existing cancellation regression no longer uses an async Promise executor or the inbound request's `close` event. It directly awaits the pending client rejection and separately awaits the underlying server-side `req.socket` close, with finite fixture deadlines. Fixture server shutdown is also bounded.

Important limit: closing the wallet-to-broker Unix socket proves cleanup of that local transport only. It does **not** prove cancellation of a downstream purchase that the broker already dispatched. The current broker does not propagate client-disconnect cancellation into its purchase function. This task did not change or claim that shared behavior; ambiguous post-dispatch outcomes still make the wallet parent refuse and are never retried.

## Test chronology

- Child-ID Red: 1 selected failure, 12 skipped; invalid topology returned `end_turn`.
- Child-ID Green: 1 selected pass, 12 skipped.
- The first runtime pass had 8/9 cases green. Its final test overclaimed that the process-level deadline fixture must observe server-side `close`; the bounded observation timed out. That assertion was removed from the runtime deadline case because the dedicated direct cancellation regression is the correct seam for transport-close proof. The actual runtime deadline, refusal and one-attempt assertions were retained.
- Final Bun runtime: 9/9 tests, 38 assertions, 32.75 seconds. The actual deadline case completed in 32.05 seconds.
- Final focused Vitest: 13/13 tests.
- `bunx tsc --noEmit --pretty false`: exit 0.
- Owned wallet diff check: clean.

No full suite, Git mutation, Plan A/G12/shared edit, live payment or credential use was performed.
