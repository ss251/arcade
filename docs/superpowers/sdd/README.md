# Spec-driven development records

These are sanitized copies of the execution records for ARCADE's ETHOnline continuation. The [continuity statement](../../CONTINUITY.md) separates the inherited build from new work; the [design specification](../specs/2026-09-04-ethonline-continuity-design.md) and [execution index](../plans/2026-09-04-02-execution-index.md) describe the approved scope.

| Plan | Records | Implementation checkpoint |
| --- | --- | --- |
| A — Settlement core | [Briefs, reports, preparation and original work order](2026-09-04-A-settlement-core/README.md) | Complete; approved three-settlement lineage proof passed. |
| B — Publish adapters | [Reports and preparation](2026-09-04-B-publish-adapters/README.md) | Adapter implementation landed; full three-adapter live proof still pending. |
| C — Pay-tested listings | [Reports and preparation](2026-09-04-C-canary/README.md) | Complete; approved scheduled-purchase, delisting and recovery proof passed. |
| D — ERC-8004 | [Reports and preparation](2026-09-04-D-erc8004/README.md) | Complete; approved identity, settlement and validation proof passed. |
| E — ENS namespaces | [Reports and preparation](2026-09-04-E-ens/README.md) | Complete; approved isolated live continuation passed. Production URLs remain pending. |

Plans F–I have [committed implementation plans](../plans/2026-09-04-02-execution-index.md); their execution records will be published as that work progresses. This index does not claim those plans are complete.

## How to read the records

Reports preserve the checkpoint at which they were written, including genuine test failures, partial live results, blockers and later corrections. A later dated completion can supersede an earlier pending statement without erasing it. Public copies are documentation, not fresh execution or authorization. Follow the [current runbook](../../runbook.md) for current behavior and operator commands; command blocks in historical records are not current instructions.

The publication includes 118 selected Markdown artifacts and five plan indexes. Originals remain in place. Personal filesystem and transient runtime locations were normalized, and links to excluded private artifacts were omitted. Non-clickable repository-relative structural references may remain for context. Retained 64-hex evidence values were individually classified as public transactions, blocks or commitments.

No private keys, registration secrets, runtime journals, databases, owner-action ledgers, heartbeat logs, raw terminal logs, private executable helpers or unrelated internal research were copied. Sanitization does not turn an offline test into live evidence, a temporary loopback endpoint into a production deployment, or an old approval into permission to repeat a transaction.

## Publication verification — September 5, 2026

The scoped sanitizer passed 24 tests with 83 assertions and strict TypeScript checking. An independent reviewer compared all 123 generated files against the reviewed transformation, verified all 118 originals remained unchanged, and checked 257 local links. A separate scan of the actual public bytes found no remaining personal paths or high-severity credential matches. Its 49 contextual matches were reviewed individually: public addresses, chain timestamps and numeric limits, historical inline Keychain substitutions without secret values, and an explicitly stopped loopback URI. These checks apply to this selected archive, not to excluded private files.

Before each of the five separate plan-publication commits, the full repository gate passed 2,054 Vitest tests, 213 Bun tests with 1,128 assertions, and strict TypeScript checking. Initial A and E gate attempts hit existing MCP subprocess startup timeouts; the affected suites passed in isolation and the unchanged full gates then passed. Product code, assertions and timeout limits were not altered for publication. The commits remain incremental on local `main`; no push or history rewrite was performed.
