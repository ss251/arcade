> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 7 report: FeeSplitter v2 with `settleWithTree`

Commit: `31a6cf559d33a62b057f7ba96ac2e537aea9243f` on `feat/a-settlement-core`
Message: `feat(contracts,payments): FeeSplitterV2 settleWithTree commits the receipt tree on chain`
Trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (no session trailer, per task instructions)

## What was implemented

### Contracts
- `contracts/FeeSplitterV2.sol` (new). v1's body refactored into internal `_settle(...)`
  returning `(sellerAmount, feeAmount)`; `settle` calls it and emits `Settled` (unchanged
  shape); new `settleWithTree(..., bytes32 treeHash, uint32 childCount, uint256
  childTotalAtomic)` calls the same `_settle` and emits the new `SettledTree` event with the
  exact field order specified in the brief (load-bearing for Plan G's ABI copy — not
  reordered). Added `function version() external pure returns (uint8) { return 2; }` and
  `@custom:version 2` NatSpec. Every v1 guard is preserved: `nonReentrant` on both external
  entry points, the balance-delta check (`UnexpectedAmountReceived`), fee rounds up, `seller`
  and `treasury` immutable, poisoned-recipient constructor guard, `rescueStrandedToSeller`
  unchanged.
- `contracts/test/FeeSplitterV2.t.sol` (new) — the brief's three tests verbatim (event
  assertion, plain settle, nonce-reuse revert).
- `contracts/test/FeeSplitter.t.sol` (modified, additive only) — see "Deviation 1" below.

### `packages/payments`
- `rail.ts`: new `SettleTree` interface (`treeHash`, `childCount`, `childTotalAtomic`);
  `ChallengeInput.feeSplitterVersion?: 1 | 2`; `Rail.settle` widened to `(verified, tree?)`.
- `eip3009.ts`: `FEE_SPLITTER_V2_ABI` (`settleWithTree` + `version()`); `challenge` copies
  `feeSplitterVersion` into `extra` when present; `settle` takes `tree?` and branches to
  `settleWithTree` only when `useSplitter && tree !== undefined &&
  extra.feeSplitterVersion === 2` — otherwise the existing `settle`/`transferWithAuthorization`
  paths, unchanged. Added `Eip3009Config.walletClient?` (mirrors the existing
  `publicClient?` override) — see "Deviation 2".
- `gateway.ts`, `test-rail.ts`: `settle` widened to `(verified, _tree?: SettleTree)`,
  accepted and ignored, per the brief.
- `test/rail.conformance.test.ts`: added a tree-argument case for every rail (RailTest,
  GatewayLive, EIP3009Live plain-settle, EIP3009Live v2-settleWithTree, EIP3009Live
  no-splitter) — see "Deviation 2" for why these are separate blocks rather than inside the
  existing `describe.each(candidates)` loop.

### `apps/hub`
- `server.ts`: `SPLITTER_ABI` gained `version()`; `SplitterFacts.version: 1 | 2`, read in its
  own inner try/catch inside `splitterFacts` so a revert (v1, no such selector) doesn't
  discard the feeBps/seller/treasury reads that already succeeded; `store.putListing` now
  carries `splitterVersion` when `splitterInfo` is defined; both `rail.challenge(...)` call
  sites now spread `feeSplitterVersion` from the listing record. See "Deviation 3" for why
  this landed in `server.ts` rather than `splitter.ts`.
- `store.ts`: `ListingRecord.splitterVersion?: 1 | 2`.
- `pipeline.ts`: builds `settleTree` from the existing `tree` (computed pre-settle-decision
  in Task 6) only when `tree.children.length > 0`; passes it as `rail.settle(args.verified,
  settleTree)`. An ordinary root (no children) still calls plain settle.

### `scripts/deploy-splitter.ts`
- `--v2` flag: switches `contractName`/artifact path to `FeeSplitterV2`, runs `forge build`
  first (only on `--v2` — v1's existing "read whatever's already in out/" behavior is
  untouched), and reads `version()` back in the on-chain verification printout.

## Deviations from the brief (and why)

1. **`FeeSplitter.t.sol`'s `MockUSDC` had no `transferDigest` helper.** The brief's Step 1
   template calls `usdc.transferDigest(...)` and says "the v1 test already signs
   authorizations against a mock; reuse it." In the actual code, `MockUSDC.transferWithAuthorization`
   ignores `v`/`r`/`s` entirely (every existing v1 test call passes `27, bytes32(0),
   bytes32(0)`) — there was no digest helper and no real signature check to reuse. Rather
   than write a second mock (explicitly what the brief wants to avoid) or add real `ecrecover`
   verification to `transferWithAuthorization` (which would have broken all 13 passing v1
   tests, since they pass bogus signatures), I added `TRANSFER_WITH_AUTHORIZATION_TYPEHASH`,
   `DOMAIN_SEPARATOR()`, and `transferDigest(...)` to the existing `MockUSDC` as a pure,
   additive EIP-712 digest helper. `transferWithAuthorization`'s behavior is byte-for-byte
   unchanged (still trusts `from` as given, still only enforces the timestamp window and
   nonce reuse), so all 13 v1 tests pass unmodified; the new helper only lets `vm.sign`
   produce a plausible signature the way a real client would, satisfying the V2 test file as
   written in the brief. Documented inline in the diff.

2. **The conformance-suite "tree arg accepted" cases could not literally live inside the
   existing `describe.each(candidates)` loop and call `.settle()` to a genuine success**, for
   `EIP3009Live` and `GatewayLive`. That loop's existing tests only ever exercise rejection
   paths that short-circuit before any network I/O (confirmed by reading `verify`'s early
   returns) — the file's own docstring states real chain/facilitator calls stay in
   `*.live.test.ts`, excluded by default, and no such file exists for this package. Making
   `settle` "succeed" genuinely and deterministically for these two rails required stubbing
   the network boundary each depends on: `GatewayLive` via a temporary `globalThis.fetch`
   stub (zero production changes), and `EIP3009Live` via a new, small, additive
   `Eip3009Config.walletClient?` override — the same pattern the file already uses for
   `publicClient?` and for the same reason ("Exists so the verify path... can be tested
   without a chain"). I placed the four resulting tests in their own `describe` block
   instead of inside `describe.each(candidates)`, since the raw `candidates` array's
   `EIP3009Live`/`GatewayLive` entries are deliberately unstubbed. Coverage is equal or
   better than the brief's literal one-line-per-rail ask: RailTest (genuine settle, exact
   brief shape), GatewayLive (genuine settle via stubbed facilitator), and three
   EIP3009Live cases (plain settle ignores tree, v2 splitter + tree calls `settleWithTree`
   and I assert the actual 4-byte selector broadcast, no-splitter settle ignores tree).

3. **`apps/hub/src/splitter.ts` does not perform any RPC read.** It is a 33-line, pure,
   side-effect-free module (deliberately extracted, per its own docstring, because a module
   that imports `server.ts` boots `Bun.serve` — "a guard that cannot be imported cannot be
   tested") holding only `splitterRefusal`. The actual `feeBps()`/`seller()`/`treasury()`
   handshake verification (`SplitterFacts`, `splitterFacts`, `SPLITTER_ABI`) lives in
   `server.ts`, not `splitter.ts`, contrary to the brief's context description. I added
   `version()` detection to the real location (`server.ts`'s `splitterFacts`/`SplitterFacts`/
   `SPLITTER_ABI`) rather than inventing RPC logic in `splitter.ts` that would duplicate it.
   `splitter.ts` itself is untouched — there was no pure/testable logic to add there for this
   task. Functionally this satisfies the brief's intent (`version()` read at handshake,
   fail-to-1 on revert, `splitterVersion` on `ListingRecord`) at the correct file.

## Tests and results

**Foundry** — `forge test`: 16/16 pass (13 v1 unchanged + 3 new v2).
Historical excerpt (not current operator instructions):
```
Ran 3 tests for contracts/test/FeeSplitterV2.t.sol:FeeSplitterV2Test
[PASS] testNonceReuseReverts() (gas: 142082)
[PASS] testPlainSettleStillWorks() (gas: 136552)
[PASS] testSettleWithTreeEmitsCommitment() (gas: 142504)
Suite result: ok. 3 passed; 0 failed; 0 skipped

Ran 13 tests for contracts/test/FeeSplitter.t.sol:FeeSplitterTest
Suite result: ok. 13 passed; 0 failed; 0 skipped

Ran 2 test suites: 16 tests passed, 0 failed, 0 skipped
```

**TDD evidence.** RED: `forge test --match-contract FeeSplitterV2Test` before
`FeeSplitterV2.sol` existed failed to compile —
`Error (6275): Source "contracts/FeeSplitterV2.sol" not found`. GREEN: after writing the
contract, the same command (and the full suite) passed as above.

**TypeScript** — `bunx tsc --noEmit`: clean, zero errors (one real error surfaced and was
fixed mid-implementation: casting the wallet client to a bare `ReturnType<typeof
createWalletClient>` lost the bound-account narrowing and made `sendTransaction`'s `account`
field spuriously required; fixed by typing off a `realWallet()` helper instead so the
override path and the default path share the exact same inferred type).

**Vitest** — `bunx vitest run packages/payments apps/hub packages/core`: 287/292 pass.
`packages/payments` conformance suite: 30/30 (was 25, +5 net from the tree-arg cases across
4 new tests plus one existing file's `describe` restructure). The 5 failures are all in
`apps/hub/test/preflight.test.ts`, and only when run as part of the combined suite — this
matches the task instructions' documented "spawn-flake note applies to preflight/lineage-http."
Verified: `bunx vitest run apps/hub/test/preflight.test.ts` alone passes 7/7. This is a
pre-existing subprocess-spawn contention issue unrelated to Task 7's changes (I did not touch
`preflight.ts` or its test).

## Files changed
- `contracts/FeeSplitterV2.sol` (new)
- `contracts/test/FeeSplitterV2.t.sol` (new)
- `contracts/test/FeeSplitter.t.sol` (additive: digest helper on `MockUSDC`)
- `packages/payments/src/rail.ts`
- `packages/payments/src/eip3009.ts`
- `packages/payments/src/gateway.ts`
- `packages/payments/src/test-rail.ts`
- `packages/payments/test/rail.conformance.test.ts`
- `scripts/deploy-splitter.ts`
- `apps/hub/src/server.ts`
- `apps/hub/src/store.ts`
- `apps/hub/src/pipeline.ts`

`apps/hub/src/splitter.ts` was NOT modified (see Deviation 3). `docs/runbook.md` was NOT
touched (Step 8 did not run — see below).

## Self-review (against the brief's checklist)

- Contract + event + `version()`: done, event field order matches the brief verbatim
  (buyer, total, sellerAmount, feeAmount, nonce, treeHash, childCount, childTotalAtomic) —
  checked against the brief's Merge-notes warning not to reorder it.
- `Rail.settle` signature: done, optional second arg, backward compatible; grepped the repo
  for every non-test `rail.settle(` call site — only `pipeline.ts`, already updated.
- EIP3009 branch on version 2 with tree: done; branch order is `useTree` → `useSplitter` →
  plain `transferWithAuthorization`, each mutually exclusive and derived from what the buyer
  signed (`extra.feeSplitter`, `extra.feeSplitterVersion`), never re-read from config at
  settle time — consistent with the file's existing stated design principle.
- `test-rail`/`gateway` accept `tree`: done, both ignore it, both documented inline.
- Conformance rows: done, exceeds the literal ask (see Deviation 2).
- `splitterVersion` detection: done, in the file that actually owns the RPC read (Deviation 3).
- Challenge carries `feeSplitterVersion`: done, both call sites in `server.ts`.
- Pipeline passes tree only with children: done, guarded on `tree.children.length > 0`.
- `deploy --v2`: done, gated `forge build` to the `--v2` path only so v1's behavior is
  untouched; smoke-tested the early-exit path (`DEPLOYER_KEY, SELLER and TREASURY are
  required`) to confirm no syntax/runtime error before the key check.

**Quality/discipline**: no `lib/` files touched or staged; `contracts/out/` is gitignored and
was never staged; `internal/` untouched; no secrets read, printed, or referenced. Kept
`rail.ts`/`eip3009.ts`/`gateway.ts` changes additive per the Plan F merge note — no existing
field, function, or exported name was removed or renamed, only new optional fields/params and
new exports added.

## Concerns for the conductor

1. Deviations 1–3 above are real gaps between the brief's stated context and the actual
   repository state at `be413a0`, not choices among equally-valid options — worth a quick
   read before merging, especially Deviation 3 if Plan G or another task expects
   `splitter.ts` itself to gain RPC logic.
2. `Eip3009Config.walletClient?` is a new field on a file Plan F also edits. It's additive
   and default-preserving (omitting it reproduces the exact prior code path), but flag it to
   whoever rebases F onto this.

## Step 8 (live deploy)

**Skipped.** Neither `ARCADE_FACILITATOR_KEY` nor `DEPLOYER_KEY` is set in this environment
(checked their presence only, never read or printed a value). Per the task instructions, I
did not run the deploy and left `docs/runbook.md` untouched for the conductor to update once
a real deploy runs `bun run scripts/deploy-splitter.ts --v2` with a funded key.
