# Task 3 — funded buyer rail selection

Start from merged c447759, root-only with four-worker sequential verification.
Use two atomic checkpoints: 3A bounded selection/read-only balance foundations,
then 3B SDK/MCP/canary integration. One full gate per commit, no live purchase,
funding transaction, key acquisition, deposit, approval or push.

Default preference is Gateway, exact, then escrow. Preference is an allow-list
in priority order: an explicit single rail never silently broadens. Unknown
schemes are ignored; malformed known Gateway metadata must never become exact.
Gateway requires observed available balance at least the price. Missing/read
failure is not zero funds and cannot prove funding; automatic selection may
choose an offered exact alternative before any signature exists. Escrow stays
unselectable until Task9 implements its lifecycle, rather than using exact signing.

Capture preferences, requirements and the balance transport before caller awaits;
no getters or mutable domains grant authority. Balance inspection is one bounded
anonymous request to the pinned selected Gateway, no redirect/retry/key/header
forwarding. It observes availability, not a reservation or settlement guarantee.

Integration must preserve caps and ENS's final signing gate, record chosen rail
as local authorization provenance (not hub JSON or settlement proof), teach MCP
quotes multiple accepts without acquiring a key, and reject per-call overrides
of an active session's fixed rail. Canary remains on its configured hub default;
no automatic Gateway preference or new scheduled spending policy is authorized.

Tests use existing Vitest/Bun per the ts-testing skill: pure decision tables,
bounded actual fetch/read/abort behavior, real offline signing/retry provenance,
MCP argument/reservation checks and configured canary selection. Raw diagnostics,
wallet material and private work-order files remain outside committed artifacts.
