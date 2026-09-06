# Task 14 — honest receipt references, session provenance and documentation

F12 committed as `fb26382`. This checkpoint completes the F14 implementation and
local verification, not F12 live acceptance or the subsequent full-F merge gates.

- [Source handoff](task-14-source-handoff.md)
- [Independent readiness and historical findings](task-14-independent-readiness-review.md)
- [Accepted parent decisions](task-14-parent-decisions.md)
- [Reference/feed implementation and genuine test chronology](task-14-reference-report.md)
- [UI, server and documentation implementation](task-14-ui-report.md)
- [Independent source and correction review](task-14-independent-review.md)
- [Parent review, actual browser checks and complete gate](task-14-parent-review.md)

Only settled ordinary EIP-3009 references with a valid explicitly selected chain
and absent/onchain kind gain explorer links. Gateway transfer UUIDs, simulated
references, unknown kinds and unverified releases do not. A released root does
not erase independently settled children. Public session provenance is a bounded
boolean, never a private session ID or an inherited child label. Later Plan H
must retain its stronger field whitelist and these absent-versus-invalid rules.

The fee column reports recorded amounts; the configured percentage is explicitly
a default, not a universal Gateway fee. Unsettled price is not represented as a
zero-charge proof. Both legacy receipt tables have named keyboard-focusable scroll
regions. Actual isolated synthetic-browser QA passes desktop1280 and mobile390,
including ArrowRight scrolling to accessible references. Original mobile overflow
and fee-label failures are preserved separately from their fixes. All owned
browser/preview processes stopped; both listener checks returned ECONNREFUSED.
The URLs served only synthetic local fixtures during these checks, not live data.

Frozen complete gate:2,748Vitest/124files,529Bun/41files/4,681assertions, root/web
strict checks and client/SSR web builds, all exit0. Bun includes retained ignored
review fixtures; those totals are not all public-checkout tests. Source review
is CLEAN; historical-copy audit precedes the atomic commit. Full-F four gates,
fast-forward merge and the same main gates remain separate.

Seven exact historical copies use three literal artifact-locator substitutions.
Private scripts, screenshots, live journals and owner/status handoffs are excluded.
F12 live remains **unimplemented / NOT RUN**; twenty offline UUIDs do not prove a
mined batch. F13 was not triggered. Current Minter identity and exact deposit-credit
attribution limitations remain in the [funding brief](task-11-brief.md).
No new spending, consumed approval replay, production change or push.
