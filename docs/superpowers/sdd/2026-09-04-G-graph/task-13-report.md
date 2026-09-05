# G13 implementation report — September 5, 2026

Created `skills/counterparty-graph/SKILL.md` and seven documentation contract tests.
The guide matches the implemented source rather than the plan's unsafe literal
examples: separate chains/costs, up to two fixed queries, first-block snapshot,
unknown source values, bounded evidence, current no-verifier/no-allow/count-zero
boundary, explicit credentials and owner-pending live work. It does not teach
printing/deleting a payer key or changing a live runner. It describes refusal and
uncertain signed expenditure without suggesting restart or failure revokes it.

At 15:48:07 IST, all seven collected tests genuinely failed with ENOENT because
SKILL.md did not exist. The document was then written and all seven passed at
15:50:01 IST. Tests pin both networks/tokens, manifest price, explicit credential
choices, every stable contradiction/evidence flag, exact source, unsigned-only
checkpoint, refusal semantics and a strictly schema-valid illustrative example.
No sample transaction or positive service count is fabricated as live evidence.

The independent reviewer read the full guide, tests and underlying frozen G12
client/runtime; review CLEAN. Both local Markdown links exist and both shell
fences parsed with `bash -n` through stdin; those guide commands were not executed.
Parent's combined repeat passed 165 skill Vitest tests, ten actual Bun fixtures /
79 assertions and root/web strict checks. Exact-root-options compilation including
all nested skill tests also passed after the separately documented G12 fixture
header-iteration compatibility fix. No compiler settings or assertions weakened.

Whole-repository precommit gates and the separate G13 commit are pending at this
report checkpoint. This guide is not a paid-query, Studio, production deployment
or Arc settlement result. Historical plan wording remains preserved in the plan;
current differences are explicit here and in the G12 integration record.
