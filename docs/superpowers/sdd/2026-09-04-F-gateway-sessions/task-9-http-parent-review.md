> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 HTTP parent independent review — September 6, 2026

Verdict: CLEAN for the frozen session-only HTTP helper. This is a scoped source
review and independent execution of the author's 19 transport cases, not a full
SDK/lifecycle, live Circle or whole repository acceptance.

Source SHA-256 `fbb95a382a0922bf01234d8c006704690a341f63532e151dff1bec74dcc27fb9`
matched before/after review. Parent read all172 lines, all transport tests and the
owned listener/process fixture. The test and fixture continued additive SDK
integration development; those final versions are covered by their later report,
not retrospectively frozen by this checkpoint.

Parent run: `bun --no-env-file test packages/buyer/test/session.bun.test.ts
--test-name-pattern 'session HTTP'` in an empty environment preserving only
PATH/HOME/USER/TMPDIR. Owned loopback permission only; no credential or external
request. Exit0: 19 pass,5 filtered,0 fail,71 assertions,5.16 seconds. The actual
unfinished native body ended at5005.36ms; uncooperative injected cancellation
ended at72.95ms. Exact HTTP TypeScript program using parsed repository options
returned zero diagnostics independently. No full suite was run.

Reviewed properties: captured own scalar request/headers/body, canonical safe URL,
literal loopback-only HTTP, no redirects or credential inheritance, fixed finite
whole-request deadline capped by caller monotonic deadline, exact response origin
and status/type/encoding/framing, fatal UTF8, byte bounds, bounded empty chunks,
removable per-await abort listeners, fixed diagnostics, cancellation/reaping of
owned listeners and bounded reader cleanup. A late fetch can only cancel its body;
it cannot parse or send again. Request JSON semantic validation and same-origin
session routing remain the higher layer's responsibility, explicitly documented.

The author's genuine empty-stream Red reported356080 pulls before the1024-empty
guard; parent independently reran its passing regression but did not reintroduce
the defective source. No stronger TCP EOF, native peer teardown, hostile-Proxy
sandbox, funding or financial finality claim follows. Real native request-policy
assertions check the actual fetch init; Bun Request's credential projection is not
used as proof. The helper is unchanged by this review.
