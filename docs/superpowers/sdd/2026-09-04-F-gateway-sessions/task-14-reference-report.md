> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F14 receipt reference and public-feed implementation

Frozen local checkpoint: 2026-09-06, after the 06:34:28 IST focused run.

## Scope and contract

Only four tracked paths were authored: `apps/hub/src/receipt-reference.ts`, `apps/hub/test/receipt-reference.test.ts`, `apps/hub/src/receipts-feed.ts`, and `apps/hub/test/receipts-feed.test.ts`. The UI, two ordinary server explorer projections, and three general documents belong to the separate author. No F8 helper, H source, core schema, chain configuration, dependency, or Git mutation was performed.

Shared exports are `receiptExplorer(receipt: unknown): string | null`, `receiptChildExplorer(root: unknown, child: unknown): string | null`, and `hasSessionMarker(receipt: unknown): boolean`.

The helper uses the explicit relative `packages/core/src/chain-config.ts` subpath, not the ambient-selecting core barrel. It loads only the two explicit existing manifest identifiers. Eligible recorded provenance requires a ready manifest, positive safe chain ID coherent with CAIP-2, a canonical HTTPS explorer origin, EIP-3009 rail, own boolean settled evidence, and a nonzero 32-byte hexadecimal reference. Links are inspection destinations for recorded evidence, not new mining/status verification. Pending mainnet, unknown networks, TestRail references, Gateway UUIDs, and hash-shaped Gateway references receive no explorer link.

True own-property absence of `settleRefKind` supports legacy EIP receipts. An own `onchain` value also qualifies. Present `undefined`, unknown values, null, and every other kind refuse. An actual keyless `Receipt.make` probe confirmed that omitted kind is absent while explicitly supplied `undefined` is an own enumerable property. Compact children inherit the original root's rail/network/kind presence, but use their own settled/hash evidence: a released root does not erase a separately settled child's recorded reference. Child-supplied context does not override root provenance.

Pure helper authority reads use own property descriptors, refuse accessors/inherited values without invoking getters or value coercion, and catch descriptor failures. This is not a universal Proxy sandbox or a rewrite of the trusted-receipt public feed into a full future-field whitelist.

The feed retains its existing monetary, tree, and explicit private-field projection. It derives and overwrites public `session` from a canonical own `ses_` plus 32 lowercase hexadecimal ID, without emitting the private ID. Canary and session provenance remain independent; session markers do not propagate to compact children. Any present reference kind is normalized to `onchain`, `gateway-transfer`, `test`, or `unrecognized`, after the legacy rest projection, so JSON cannot erase an invalid present value into eligible absence. Truly absent kind stays absent. The known pipeline fallback `child.skillId === child.jobId` becomes `unknown-skill`, preserving the monetary evidence without publishing that private alias.

## Reproduced Red and Green chronology

1. At 06:30:18 IST, the existing feed suite collected 18 cases: **14 failed, 4 passed** before implementation. Actual failures covered missing/forged session provenance, unsafe TestRail/Gateway explorer construction, a released-root reference, the private child-job fallback alias, and present kind normalization. Existing incorrect malformed TestRail explorer expectations were corrected to null; monetary/tree/private-field assertions were preserved and a positive legacy EIP root/child case passed already.
2. At 06:32:04 IST, the new helper suite could not import the not-yet-created module: **zero collected tests, loader failure**. This is a missing-module checkpoint, not 48 behavioral Reds.
3. At 06:33:03 IST, implementation produced **66 passing cases**: 48 helper and 18 feed.
4. Seven supplemental feed cases were then added for already-correct safe-kind retention, malformed runtime-kind normalization, and frozen input nonmutation. They passed immediately; no new Red is claimed. The released-root feed fixture was refined from a malformed root reference to a valid hash, isolating its settlement-state assertion. At 06:34:28 IST, the final suite passed **73/73 cases across two files**: 48 helper and 25 feed.

The malformed newline cases are canonical-input coverage, not evidence that an unflagged JavaScript `$` accepted a final newline. The forged public `session: true` overwrite was the actual feed failure in that case. Explicit length/alphabet checks remain defensive.

## Checks

Focused command, run only in the F worktree:

```sh
bun --no-env-file x vitest run apps/hub/test/receipt-reference.test.ts apps/hub/test/receipts-feed.test.ts
```

Final result: **73 passed, two files, exit 0**. The pure helper matrix includes real fresh import under an invalid ambient network selector, controlled manifest mocks, malformed/zero/opaque references, explicit versus absent kind, own/inherited/accessor authority, original root/child context, and private session provenance. Mock/environment cleanup is explicit after each test.

An independent fileless TypeScript `createProgram` used the actual root `tsconfig.json`, absolute `configFilePath`, its parsed strict compiler options, and exactly the four owned source/test roots with `noEmit: true` and `incremental: false`. Result: **four roots, zero diagnostics, exit 0**. This is an exact nested check, not a claim that the normal root include pattern checks hub tests.

No Bun runtime test was needed for these pure functions. No full-repository gate, live/provider/RPC request, operational key, service, wallet action, or new spend was used. Parent owns combined integration, independent review, complete gates, publication, and commit. At this checkpoint those later gates are not claimed by this report.

## Frozen SHA-256 inventory

| Path | SHA-256 |
| --- | --- |
| `apps/hub/src/receipt-reference.ts` | `c70e3380fdfd37c50358b01a8cf27682ff946a7f3ac5e963f83d81a110f5212b` |
| `apps/hub/test/receipt-reference.test.ts` | `c4bc5322039c33e14e7b65fc88b67ce8acc15d7136fa359746d854711c5ec643` |
| `apps/hub/src/receipts-feed.ts` | `3e911fcb5e5f10959d0009f8a5323621b2ce420f717ba68e13c506339b4be3bc` |
| `apps/hub/test/receipts-feed.test.ts` | `0e4e57f9eddd7d5aaea8202f2ac59d8b715ff2e5caf7666aa989ae3bc5b5f66a` |
