// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeeSplitter, IFiatToken} from "../FeeSplitter.sol";

/**
 * @notice Minimal FiatTokenV2 stand-in: EIP-3009 receive + ERC-20 transfer + a blocklist.
 * @dev The blocklist is not decoration — an audit agent showed (and Arc's docs confirm) that
 *      a blocklisted transfer HARD REVERTS, which is what could brick the v1 design.
 */
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => bool) public blocked;

    bool public reenterOnTransfer;
    address public reentrantTarget;

    error Blocked();
    error AuthorizationUsed();

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setBlocked(address who, bool v) external {
        blocked[who] = v;
    }

    function setReentrancy(address target) external {
        reenterOnTransfer = true;
        reentrantTarget = target;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (blocked[to] || blocked[msg.sender]) revert Blocked();
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        if (reenterOnTransfer) {
            reenterOnTransfer = false;
            // Simulate a token that gained a transfer hook and calls back in.
            (bool ok,) = reentrantTarget.call(abi.encodeWithSignature("withdrawFees()"));
            ok; // ignore; the guard is what we assert on
        }
        return true;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8,
        bytes32,
        bytes32
    ) external {
        require(block.timestamp > validAfter, "not yet valid");
        require(block.timestamp < validBefore, "expired");
        if (authorizationState[from][nonce]) revert AuthorizationUsed();
        authorizationState[from][nonce] = true;
        if (blocked[from] || blocked[to]) revert Blocked();
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}

contract FeeSplitterTest is Test {
    MockUSDC usdc;
    FeeSplitter splitter;

    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address buyer = makeAddr("buyer");
    address attacker = makeAddr("attacker");

    uint16 constant FEE_BPS = 500; // 5%

    function setUp() public {
        usdc = new MockUSDC();
        splitter = new FeeSplitter(address(usdc), seller, treasury, FEE_BPS);
        usdc.mint(buyer, 1_000_000_000);
        vm.warp(1000);
    }

    function _settle(uint256 value, bytes32 nonce) internal {
        splitter.settle(buyer, value, 0, block.timestamp + 3600, nonce, 27, bytes32(0), bytes32(0));
    }

    // ── the fix works ────────────────────────────────────────────────────────

    function test_settle_paysSellerAndAccruesFee() public {
        _settle(100_000000, "n1");
        // 5% of 100 USDC = 5; seller gets 95.
        assertEq(usdc.balanceOf(seller), 95_000000);
        assertEq(splitter.accruedFees(), 5_000000);
        // The fee is HELD, not pushed — that is what keeps a blocked treasury from bricking us.
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(address(splitter)), 5_000000);
    }

    function test_withdrawFees_isPermissionlessAndGoesOnlyToTreasury() public {
        _settle(100_000000, "n1");
        vm.prank(attacker); // anyone may trigger it…
        splitter.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 5_000000); // …but only treasury receives.
        assertEq(splitter.accruedFees(), 0);
    }

    // ── audit finding 1: seller redirection (6 agents) ───────────────────────

    function test_sellerIsImmutable_noRedirectionPossible() public {
        // v1 took `seller` as a runtime arg. There is no such argument now — the only way to
        // change the payee is to deploy a different splitter, which changes payTo, which
        // changes what the buyer signed. Attack surface removed rather than guarded.
        assertEq(splitter.seller(), seller);
        vm.prank(attacker);
        _settle(100_000000, "n1"); // attacker CAN call settle…
        assertEq(usdc.balanceOf(seller), 95_000000); // …and the seller still gets paid.
        assertEq(usdc.balanceOf(attacker), 0);
    }

    // ── audit finding 2: fee rounding to zero (math agent) ───────────────────

    function test_feeRoundsUp_neverZeroForNonZeroValue() public {
        // v1: (19 * 500)/10000 == 0 — a literal 0% take on small payments.
        _settle(19, "n1");
        assertEq(splitter.accruedFees(), 1); // rounds UP to 1 atomic unit
        assertEq(usdc.balanceOf(seller), 18);
    }

    function test_feeNonZero_acrossTheWholeNanopaymentBand() public {
        // The band that used to pay nothing: value < ceil(10000/feeBps) == 20.
        for (uint256 v = 1; v < 20; v++) {
            FeeSplitter s = new FeeSplitter(address(usdc), seller, treasury, FEE_BPS);
            usdc.mint(buyer, v);
            s.settle(buyer, v, 0, block.timestamp + 3600, bytes32(v), 27, bytes32(0), bytes32(0));
            assertGt(s.accruedFees(), 0, "fee must never round to zero");
        }
    }

    function test_quoteMatchesSettleExactly() public {
        (uint256 qSeller, uint256 qFee) = splitter.quote(100_000000);
        _settle(100_000000, "n1");
        assertEq(usdc.balanceOf(seller), qSeller);
        assertEq(splitter.accruedFees(), qFee);
        assertEq(qSeller + qFee, 100_000000); // conservation
    }

    // ── audit finding 3: poisoned recipient (3 agents) ───────────────────────

    function test_cannotDeployWithSelfOrTokenAsSeller() public {
        vm.expectRevert(FeeSplitter.InvalidSeller.selector);
        new FeeSplitter(address(usdc), address(usdc), treasury, FEE_BPS);

        vm.expectRevert(FeeSplitter.ZeroAddress.selector);
        new FeeSplitter(address(usdc), address(0), treasury, FEE_BPS);
    }

    // ── audit finding 4: blocked treasury must not brick settlement ──────────

    function test_blockedTreasury_doesNotBrickSettlement() public {
        usdc.setBlocked(treasury, true);
        // v1 pushed the fee inside settle, so this would revert forever and kill the market.
        _settle(100_000000, "n1");
        assertEq(usdc.balanceOf(seller), 95_000000); // sellers keep getting paid
        assertEq(splitter.accruedFees(), 5_000000); // fee simply waits

        vm.expectRevert(); // only the withdrawal fails
        splitter.withdrawFees();

        usdc.setBlocked(treasury, false);
        splitter.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 5_000000); // and recovers cleanly
    }

    // ── audit finding 5: reentrancy via a hypothetical token hook ────────────

    function test_reentrancyGuardBlocksTokenHook() public {
        _settle(100_000000, "n1");
        usdc.setReentrancy(address(splitter));
        // The hook re-enters withdrawFees mid-withdraw; the guard must stop it draining twice.
        splitter.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 5_000000); // exactly once
        assertEq(splitter.accruedFees(), 0);
    }

    // ── replay + accounting invariants ──────────────────────────────────────

    function test_replayIsRejectedByTheToken() public {
        _settle(100_000000, "n1");
        vm.expectRevert(MockUSDC.AuthorizationUsed.selector);
        _settle(100_000000, "n1");
    }

    function test_strandedFundsGoToSellerNotAnAdmin() public {
        _settle(100_000000, "n1");
        usdc.mint(address(splitter), 7_000000); // stray transfer
        uint256 before = usdc.balanceOf(seller);
        splitter.rescueStrandedToSeller();
        assertEq(usdc.balanceOf(seller), before + 7_000000);
        // Accrued fees are NOT swept out as "stranded".
        assertEq(splitter.accruedFees(), 5_000000);
    }

    function test_feeCannotExceedCeiling() public {
        vm.expectRevert(FeeSplitter.FeeTooHigh.selector);
        new FeeSplitter(address(usdc), seller, treasury, 1001);
    }

    // ── fuzz: conservation and bounds hold for every value and rate ──────────

    function testFuzz_conservationAndFeeBound(uint96 value, uint16 bps) public {
        value = uint96(bound(value, 1, 1e15));
        bps = uint16(bound(bps, 0, 1000));

        FeeSplitter s = new FeeSplitter(address(usdc), seller, treasury, bps);
        usdc.mint(buyer, value);
        uint256 sellerBefore = usdc.balanceOf(seller);

        s.settle(buyer, value, 0, block.timestamp + 3600, keccak256(abi.encode(value, bps)), 27, bytes32(0), bytes32(0));

        uint256 paid = usdc.balanceOf(seller) - sellerBefore;
        uint256 fee = s.accruedFees();

        assertEq(paid + fee, value, "no atomic unit created or destroyed");
        assertLe(fee, (uint256(value) * bps) / 10_000 + 1, "fee never exceeds rate + 1 rounding unit");
        assertLt(fee, value + 1, "fee never exceeds the payment");
        if (bps > 0) assertGt(fee, 0, "a non-zero rate must always collect something");
    }
}
