> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D1 implementation handoff

- Owned only `packages/core/src/erc8004.ts`, its `src/index.ts` export, and `core/test/erc8004.test.ts`.
- Genuine initial Red: missing module, 2026-09-05 04:42:10 local. Added regression Red at 04:48:47 for hidden `toJSON` and pre-enumeration array bounds.
- Final focused Green: 48/48 Vitest, 04:49:59. `bunx tsc --noEmit` and `git diff --check` passed. No full suite, staging, commits, private keys, live chain calls, or payments.
- Current ERC registration-v1 `type`, `services`, `supportedTrust`, and `registrations` are present. `endpoints` and `supportedTrusts` remain aliases. Optional decimal-string `agentId` preserves uint256 precision; `registrations` is empty before mint. No invented image or nonexistent HTTP MCP URL. `input` remains non-enumerable.
- ABI functions/events/indexing checked against https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-8004.md and https://docs.arc.io/arc/tutorials/register-your-first-ai-agent on 2026-09-05. Comments pin those source URLs; no unverified git revision is claimed. No `getSummary` ABI.
- `docBytes` preserves compact JSON property order, uses own property descriptors, never calls getters/toJSON, and rejects non-JSON values, sparse/extended arrays, cycles, unsafe depth, and oversized documents. Bounds: depth 64, 100,000 visited values, 8,388,608 output code units. Top-level `hashJson(undefined)` intentionally equals JSON null; nested undefined rejects.
- URI origins allow HTTP/HTTPS (including local testing), no credentials/query/fragment/non-root path. Path identifiers allow ASCII letters, digits, `_`, `-` and are encoded. Addresses, positive chain IDs, uint256 IDs, bytes32 hashes, nonnegative prices, and timestamp ranges are checked with fixed errors.
- Validation documents publish hashes, never raw input/output/schema. Arbitrary provider reason strings are ignored: public reason is `ok` or `not settled`; stopReason is a small fixed classification allowlist (unknown becomes null). All current `JobStatus.literals` are covered by a regression. D8 should use these builders rather than reintroducing raw diagnostics.
- Following ts-testing, tests use existing Vitest, real viem selectors/topics/hashes, and public behavior. Agent-reach source verification used the official web reader after GitHub CLI networking failed. Missing Context7/use-arc/ethskills were not fabricated.

Root commit subject: `feat(core): pin the Arc ERC-8004 ABIs and the off-chain documents`.
