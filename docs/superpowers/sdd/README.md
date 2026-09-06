# Spec-driven development records

September 6 follow-up: [vendor-neutrality briefs and evidence](2026-09-06-vendor-neutrality/README.md)
track the separately approved format-wording, openai-api and plugin-ingestion work.
This link does not mark those later tasks complete.

[Plan J Arc-native execution records](2026-09-06-J-arc-native/README.md) track
the approved extension after H and before I. Metadata checkpoints and later
paid/escrow proofs are reported separately, not inferred from one another.

These are sanitized copies of the execution records for ARCADE's ETHOnline continuation. The [continuity statement](../../CONTINUITY.md) separates the inherited build from new work; the [design specification](../specs/2026-09-04-ethonline-continuity-design.md) and [execution index](../plans/2026-09-04-02-execution-index.md) describe the approved scope.

| Plan | Records | Implementation checkpoint |
| --- | --- | --- |
| A — Settlement core | [Briefs, reports, preparation and original work order](2026-09-04-A-settlement-core/README.md) | Complete; approved three-settlement lineage proof passed. |
| B — Publish adapters | [Reports and preparation](2026-09-04-B-publish-adapters/README.md) | Complete; full three-adapter local live execution passed. Separate paid FX proof remains distinct. |
| C — Pay-tested listings | [Reports and preparation](2026-09-04-C-canary/README.md) | Complete; approved scheduled-purchase, delisting and recovery proof passed. |
| D — ERC-8004 | [Reports and preparation](2026-09-04-D-erc8004/README.md) | Complete; approved identity, settlement and validation proof passed. |
| E — ENS namespaces | [Reports and preparation](2026-09-04-E-ens/README.md) | Complete; approved isolated live continuation passed. Production URLs remain pending. |
| F — Gateway sessions | [Gate brief, report and progress](2026-09-04-F-gateway-sessions/README.md) | F1 single live gate passed acceptance/debit checks; recipient credit pending batch. F2–12 code work unblocked; session live evidence remains separate. |
| H — Web and public APIs | [Briefs, reports and progress](2026-09-04-H-web/README.md) | H1 read-only feeds implemented/reviewed; H2/H3 pure preparations and full gates remain separately tracked. No web/live completion claim. |

Plans F–I have [committed implementation plans](../plans/2026-09-04-02-execution-index.md); their execution records are published as that work progresses. This index does not claim those plans are complete.

## How to read the records

Reports preserve the checkpoint at which they were written, including genuine test failures, partial live results, blockers and later corrections. A later dated completion can supersede an earlier pending statement without erasing it. Public copies are documentation, not fresh execution or authorization. Follow the [current runbook](../../runbook.md) for current behavior and operator commands; command blocks in historical records are not current instructions.

The initial publication includes 118 selected Markdown artifacts and five plan indexes. B's later dated integration record and three reviewed follow-up copies extend that archive without rewriting historical reports. Originals remain in place. Personal filesystem and transient runtime locations were normalized, and links to excluded private artifacts were omitted. Non-clickable repository-relative structural references may remain for context. Retained 64-hex evidence values were individually classified as public transactions, blocks or commitments.

No private keys, registration secrets, runtime journals, databases, owner-action ledgers, heartbeat logs, raw terminal logs, private executable helpers or unrelated internal research were copied. Sanitization does not turn an offline test into live evidence, a temporary loopback endpoint into a production deployment, or an old approval into permission to repeat a transaction.

## Publication verification — September 5, 2026

The scoped sanitizer passed 24 tests with 83 assertions and strict TypeScript checking. An independent reviewer compared all 123 generated files against the reviewed transformation, verified all 118 originals remained unchanged, and checked 257 local links. A separate scan of the actual public bytes found no remaining personal paths or high-severity credential matches. Its 49 contextual matches were reviewed individually: public addresses, chain timestamps and numeric limits, historical inline Keychain substitutions without secret values, and an explicitly stopped loopback URI. These checks apply to this selected archive, not to excluded private files.

Before each of the five separate plan-publication commits, the full repository gate passed 2,054 Vitest tests, 213 Bun tests with 1,128 assertions, and strict TypeScript checking. Initial A and E gate attempts hit existing MCP subprocess startup timeouts; the affected suites passed in isolation and the unchanged full gates then passed. Product code, assertions and timeout limits were not altered for publication. The commits remain incremental on local `main`; no push or history rewrite was performed.
