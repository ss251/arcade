> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D12 buyer implementation — frozen for independent review

## Owned scope

- `packages/buyer/src/mcp.ts`: exported exact `Erc8004Evidence`/`renderErc8004Evidence` interface, typed `Listing.erc8004`, a private validated public projection, and the actual `arcade_describe_skill` text + `structuredContent.skill.erc8004` integration.
- `packages/buyer/test/mcp-erc8004.test.ts`: 39 focused formatter and tool-integration tests.
- No hub/server, paid-call, SDK-wide, config, package, or existing MCP test edits. Root owns the server-side D12 object and ordered commit.

## TDD and checks

- Tests were first drafted under `.superpowers/.../task12-tests.pending` outside Vitest/tsc collection while root's D7/D8/D9 gates ran. No tracked MCP edits were made before GO.
- 2026-09-05 **05:57:20** genuine Red: **37 failed / 2 passed**. Missing formatter export plus actual SDK describe output leaking extra evidence fields, foreign-chain data, and unverified/stale counts. Missing-identity and invalid-argument compatibility tests already passed.
- **05:58:26** Green: **64/64** across the 39 new tests and all 25 existing MCP tests. `bunx tsc --noEmit` passed.
- All testing was offline: fetch stubs, an invalid deliberately unused buyer key, and the installed SDK's in-memory linked transport. The actual SDK Client initializes the real `createServer()`, lists tools, and calls `arcade_describe_skill`; no sockets, keys, RPC, or payment operations were used.

## Behavior and compatibility adaptations

- Agent IDs are canonical uint256 decimal strings, preserving full precision. Only the selected ready chain's exact CAIP-2 and pinned identity registry are accepted. Unknown/foreign/pending network claims produce fixed unavailable text, no links, and no structured evidence object.
- Explorer links use the selected config, never a hard-coded network. Hashes require exact 32-byte hexadecimal syntax. Invalid announced hashes are omitted; valid ones are explicitly labeled **announced registration**, with **mint transaction not independently verified**. Ownership text attributes the read to the hub rather than pretending the MCP made a chain read.
- Counts require strict `verified === true` and `stale === false`, all three nonnegative safe integers, `validationPasses <= validationsRead <= 20`, and `settlementFeedback <= 4096`. Any failure omits all counts and sets `stale: true` in structured output; zero is shown only when it is a valid measured zero.
- Text contains no `score`, `reputation`, or `rank`, including negations; the literal plan's contradictory “not a score” wording was intentionally not copied.
- The projection reads only own data properties, ignores private extras, refuses malformed/accessor/inherited identity data without invoking accessors, and returns only exact public fields. Invalid provider strings are not interpolated into the model's context.
- Existing skill-detail fields, schema/bounds/stats/ratings, tool arguments, read-only annotations, seller-data fencing, and budget/payment behavior are unchanged. Good server evidence passes through the same public shape in text and structured output.

The ts-testing skill guided regression-first coverage and reuse of the installed Vitest/MCP SDK stack. Root owns independent review, full gates, and commits; this agent did not stage or commit.
