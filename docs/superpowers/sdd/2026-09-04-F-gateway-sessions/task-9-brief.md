# Task 9 — captured buyer sessions

F8 committed as `1953256` after its complete gate and final independent public
audit. F9 supplies a funding-independent buyer SDK on that private protocol.

The immutable Effect and Promise facades capture origin, account identity, rail,
network and ceiling, keeping session/job capabilities private. Actual-input quotes
are read-only; each intentional call independently validates its challenge and
authorizes at most once. Issued authority stays counted after ambiguous delivery,
release or close. Status and closed artifacts are validated, not invented from
local totals. Lost-close recovery is authenticated read-only, never a repeat POST.

- [Initial source-grounded readiness](task-9-buyer-readiness.md)
- [Independent readiness findings](task-9-independent-readiness-review.md)
- [Parent decisions](task-9-parent-decisions.md)
- [Source handoff](task-9-source-handoff.md)
- [Buyer author chronology](task-9-report.md)
- [Transport and actual native integration](task-9-http-native-report.md)
- [Independent wire review](task-9-wire-independent-review.md)
- [Parent transport review](task-9-http-parent-review.md)
- [Initial independent lifecycle findings](task-9-lifecycle-independent-review.md)
- [Independent temporal correction review](task-9-lifecycle-correction-review.md)
- [Parent final review and gate chronology](task-9-parent-review.md)

The legacy buyer/hire/ENS implementation is unchanged apart from an additive
session export. Session ENS/hire combinations refuse before IO/signing. Splitter
ownership and fees remain trusted hub assertions, not SDK pre-sign verification.
Native tests use owned loopback and controlled facilitator responses; they are
not live purchases. Gateway UUIDs and TestRail references are not mined proof.
Funding is F11, MCP is F10, and live F12 remains NOT RUN under no-new-spend.
F13 fallback is not triggered by passing F1. No approval replay or push.
