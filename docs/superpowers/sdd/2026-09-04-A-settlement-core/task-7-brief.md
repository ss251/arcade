> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 7: FeeSplitter v2 with `settleWithTree`

**Merge notes.** `packages/payments/src/rail.ts`, `eip3009.ts` and `gateway.ts` are also edited by **F** (Task 3 hardens `GatewayLive`, Task 3 adds `SettledPayment.settlementKind`). A lands first: F rebases onto the widened `Rail.settle(verified, tree?)` signature and keeps `gateway.ts` *accepting and ignoring* the `tree` argument, exactly as Step 5 below specifies. The `SettledTree` event signature written here — `SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)` — is copied verbatim into Plan G's `subgraph/abis/FeeSplitterV2.json`; changing the field order here means changing it there in the same week, so do not reorder it after Sept 7.

**Files:**
- Create: `contracts/FeeSplitterV2.sol`, `contracts/test/FeeSplitterV2.t.sol`
- Modify: `packages/payments/src/rail.ts` (settle signature), `packages/payments/src/eip3009.ts` (ABI + branch), `packages/payments/src/test-rail.ts`, `packages/payments/src/gateway.ts` (accept and ignore the tree arg), `scripts/deploy-splitter.ts`, `apps/hub/src/splitter.ts` (detect v2 via `settleWithTree` selector), `apps/hub/src/pipeline.ts` (pass tree)
- Test: Foundry test; `packages/payments/test/rail.conformance.test.ts` (tree arg accepted by all rails)

**Interfaces:**
- Produces: `Rail.settle(verified: VerifiedPayment, tree?: {treeHash: \`0x${string}\`; childCount: number; childTotalAtomic: bigint}): Effect<SettledPayment, SettleError>`; `FEE_SPLITTER_V2_ABI` with `settleWithTree(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic)` and event `SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)`; `ListingRecord.splitterVersion?: 1 | 2`.

- [ ] **Step 1: Write the failing Foundry test**

Historical excerpt (not current operator instructions):
```solidity
// contracts/test/FeeSplitterV2.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "forge-std/Test.sol";
import {FeeSplitterV2} from "../FeeSplitterV2.sol";
import {MockUSDC} from "./FeeSplitter.t.sol"; // reuse the existing mock token from the v1 test

contract FeeSplitterV2Test is Test {
    MockUSDC usdc; FeeSplitterV2 s; address seller = address(0xBEEF); address treasury = address(0xCAFE);
    uint256 buyerKey = 0xA11CE; address buyer;
    function setUp() public { usdc = new MockUSDC(); s = new FeeSplitterV2(address(usdc), seller, treasury, 500); buyer = vm.addr(buyerKey); usdc.mint(buyer, 1_000_000); }
    function _auth(uint256 value, bytes32 nonce) internal view returns (uint8 v, bytes32 r, bytes32 sg) {
        bytes32 digest = usdc.transferDigest(buyer, address(s), value, 0, type(uint256).max, nonce);
        (v, r, sg) = vm.sign(buyerKey, digest);
    }
    function testSettleWithTreeEmitsCommitment() public {
        bytes32 nonce = keccak256("n1"); bytes32 tree = keccak256("tree");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(250_000, nonce);
        vm.expectEmit(true, true, true, true);
        emit FeeSplitterV2.SettledTree(buyer, 250_000, 237_500, 12_500, nonce, tree, 1, 10_000);
        s.settleWithTree(buyer, 250_000, 0, type(uint256).max, nonce, v, r, sg, tree, 1, 10_000);
        assertEq(usdc.balanceOf(seller), 237_500);
        assertEq(s.accruedFees(), 12_500);
    }
    function testPlainSettleStillWorks() public {
        bytes32 nonce = keccak256("n2");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(10_000, nonce);
        s.settle(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg);
        assertEq(usdc.balanceOf(seller), 9_500);
    }
    function testNonceReuseReverts() public {
        bytes32 nonce = keccak256("n3"); bytes32 tree = keccak256("t");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(10_000, nonce);
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
        vm.expectRevert();
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
    }
}
```

Check `contracts/test/FeeSplitter.t.sol` for the actual name of its mock token and its digest helper and adjust the two identifiers above to match (the v1 test already signs authorizations against a mock; reuse it rather than writing a second mock).

- [ ] **Step 2: Run to verify failure**

Run: `forge test --match-contract FeeSplitterV2Test`
Expected: FAIL to compile — `FeeSplitterV2` missing.

- [ ] **Step 3: Write `contracts/FeeSplitterV2.sol`**

Copy `contracts/FeeSplitter.sol` to `contracts/FeeSplitterV2.sol`, rename the contract to `FeeSplitterV2`, keep every existing function and event, and add:

Historical excerpt (not current operator instructions):
```solidity
    /// @notice Same as `settle`, plus a commitment to the receipt tree the hub settled under
    ///         this authorization. Child hops were paid from the hiring seller's own wallet;
    ///         this records their existence and total so a later receipt cannot omit one.
    event SettledTree(
        address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount,
        bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic
    );

    function settleWithTree(
        address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s_, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic
    ) external nonReentrant {
        (uint256 sellerAmount, uint256 feeAmount) = _settle(from, value, validAfter, validBefore, nonce, v, r, s_);
        emit SettledTree(from, value, sellerAmount, feeAmount, nonce, treeHash, childCount, childTotalAtomic);
    }
```

Refactor the body of `settle` into `function _settle(...) internal returns (uint256 sellerAmount, uint256 feeAmount)` that does the pull, the balance guard, the fee math, `accruedFees += feeAmount`, the seller transfer, and returns the amounts; `settle` calls `_settle` and emits the existing `Settled` event. Add `/// @custom:version 2` to the contract NatSpec so the hub can distinguish it, and a `function version() external pure returns (uint8) { return 2; }`.

- [ ] **Step 4: Run Foundry tests**

Run: `forge test`
Expected: PASS (v1 and v2 suites).

- [ ] **Step 5: Extend the Rail interface and the EIP-3009 rail**

`packages/payments/src/rail.ts`:

Historical excerpt (not current operator instructions):
```ts
export interface SettleTree {
  readonly treeHash: `0x${string}`
  readonly childCount: number
  readonly childTotalAtomic: bigint
}
// in Rail:
  readonly settle: (verified: VerifiedPayment, tree?: SettleTree) => Effect.Effect<SettledPayment, SettleError>
```

`packages/payments/src/eip3009.ts`: add `FEE_SPLITTER_V2_ABI` (the `settleWithTree` function and `version()` view), and in `settle`, when `useSplitter && tree !== undefined && verified.requirements.extra?.["feeSplitterVersion"] === 2`, encode `settleWithTree` with the extra three args; otherwise the existing paths. `challenge` copies `feeSplitterVersion` into `extra` when the `ChallengeInput` carries it (add `feeSplitterVersion?: 1 | 2` to `ChallengeInput`). `test-rail.ts` and `gateway.ts` accept and ignore `tree`. `apps/hub/src/splitter.ts`: when verifying the announced splitter, also `readContract version()` and record `splitterVersion` on `ListingRecord` (1 if the call reverts). `server.ts` passes `feeSplitterVersion` into `rail.challenge`. `pipeline.ts` passes `tree` (from Task 6) into `rail.settle` for roots.

- [ ] **Step 6: Update the conformance suite and deploy script**

In `packages/payments/test/rail.conformance.test.ts` add one case per rail: `settle(verified, {treeHash: "0x" + "11".repeat(32), childCount: 0, childTotalAtomic: 0n})` succeeds. In `scripts/deploy-splitter.ts` add a `--v2` flag that deploys `FeeSplitterV2` (compile with `forge build`, read the artifact from `out/FeeSplitterV2.sol/FeeSplitterV2.json`).

- [ ] **Step 7: Run everything**

Run: `forge test && bunx vitest run packages/payments apps/hub && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Deploy v2 to Arc testnet and record it**

Run: `bun run scripts/deploy-splitter.ts --v2` (facilitator key from env as the existing script expects). Record the address in `docs/runbook.md` next to the v1 address and set `ARCADE_FEE_SPLITTER` for the demo runner to the v2 address.

- [ ] **Step 9: Commit**

Historical command (not current operator instructions):
```text
git add contracts/FeeSplitterV2.sol contracts/test/FeeSplitterV2.t.sol packages/payments/src scripts/deploy-splitter.ts apps/hub/src/splitter.ts apps/hub/src/pipeline.ts apps/hub/src/server.ts packages/payments/test/rail.conformance.test.ts docs/runbook.md
git commit -m "feat(contracts,payments): FeeSplitterV2 settleWithTree commits the receipt tree on chain"
```

---
