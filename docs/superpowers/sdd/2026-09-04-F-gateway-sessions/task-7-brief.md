# F7 brief — private session lifecycle HTTP

September 6, 2026. F6 was committed separately as `5d61133`, after its corrected
full gate and independent source/publication review. This task implements
[Plan F Task 7](../../plans/2026-09-04-F-gateway-sessions.md#task-7-post-sessions-and-post-sessionsidclose)
under the [work order](../2026-09-04-A-settlement-core/work-order.md).

## Contract and preparation

The import-safe route factory uses the one F6 service and F5 Store. It adds no
accounting cache or remote payment action. Open accepts canonical positive
decimal-string `budgetUsd`, buyer and optional built rail. Status and close use a
canonical session ID and header-only HMAC capability. Application namespace
responses, including refusals, are private/no-store; capabilities authenticate
before Store IO. Real opens require actual durable storage and a captured matching,
configured stable hub secret. Test-rail use and historical reads remain available.

Open/close bodies are limited to 16 KiB, a five-second whole-read deadline and 32
active session handlers. Status projects one authoritative snapshot. A complete,
actually closed snapshot includes its original `closed_receipt`, allowing read-only
recovery after a lost close response. This never retries close or invents time.
Repeated close and unresolved holds refuse. Public receipts omit private session
IDs. The shared ASCII-safe token comparator also fixes decoded Unicode handling
on the existing ordinary job route without changing valid ordinary capabilities.

- [Implementation readiness](task-7-implementation-readiness.md)
- [Parent decisions and source-release bounds](task-7-parent-decisions.md)
- [Independent review preparation](task-7-independent-review-preparation.md)
- [Author implementation and actual-router report](task-7-report.md)
- [Parent source review and gate chronology](task-7-parent-review.md)
- [Final independent source and runtime review](task-7-independent-review.md)

The copied preparation artifacts retain their original dated held/pending states.
Two literal private readiness locators in the review preparation are replaced by
their public counterparts. Its original decision-file fingerprint predates the
later parent source-release clarification; it is not a final-source fingerprint.

## Evidence limits

Actual owned loopback tests exercise the production router and real memory/disk
Store, including restart, cross-handle holds, stored close recovery, privacy,
Unicode query tokens, body errors and capacity. External requests are denied in
the fixture. A complete application error response does not prove peer TCP EOF;
the owned sockets and child processes are explicitly cleaned up by the tests.
Raw HTTP framing failures generated before application dispatch are not covered
by the application's cache-header guarantee.

Author freeze, independent review and the parent's complete repository gate are
recorded separately when available. F8 still owns paid session integration; this
lifecycle endpoint milestone alone is not a usable paid-session or Gateway mining
proof. F1's one-shot approval is consumed. No keys, further spending, withdrawal,
deployment, production re-point, mainnet action or push is authorized here.

The final independent source review is CLEAN: 101 focused Vitest, 11 actual Bun /
184 assertions, exact seven-file strict typing, plus a separately attributed
seven-case / 19-assertion private supplement and eight-root strict check. Parent
independently repeated that supplement and exact seven-root check. Its full gate
passed 2,412 Vitest / 116 files, 385 Bun / 3,978 assertions / 34 files, and
strict root/web typing. Source remained frozen. Final public-copy review and
the atomic commit follow this checkpoint; no live integration claim is added.
