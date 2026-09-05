> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C5 — Canary receipt marker

Prepared optional Receipt.canary and RunJobArgs.canary. Only literal true from server-owned arguments is copied; ordinary purchases and seller output claims cannot add it. Existing lineage/tree fields are preserved and the marker does not change settlement or balances. Server verified-payer identification follows in C6.

Five added regressions: success/failure canary markers with real test-rail balances, schema roundtrip/backward compatibility, absent/false ordinary cases, seller output spoof. Two marker assertions failed at03:42:53 IST, then15 pipeline and163 combinedcore/pipeline tests passed at03:43:07. Commit remains ordered after C4; final gates recorded on completion. No web/contracts edits, live calls, key reads or push.
# Completion

Commit cf7e35c after full04:01:39 IST precommit gate:1,149 Vitest+37 Bun, TypeScript and diffcheck. Exact plan subject/trailer; only3 receipt/pipeline files. Independent review of15 pipeline tests clean. No payment behavior or lineage change.
