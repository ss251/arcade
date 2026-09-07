// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC8183} from "erc8183/ERC8183.sol";
import {ERC8183WithAuthorization} from "erc8183/ERC8183WithAuthorization.sol";
import {IERC8183Hook} from "erc8183/IERC8183Hook.sol";
import {ArcadeJobHook} from "../ArcadeJobHook.sol";

contract EscrowTestToken is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract ArcadeJobHookTest is Test {
    ERC8183WithAuthorization escrow;
    ArcadeJobHook hook;
    EscrowTestToken token;
    address buyer;
    address provider;
    address evaluator = makeAddr("escrow-evaluator");
    address treasury = makeAddr("escrow-treasury");
    uint256 constant PROVIDER_KEY = 0x8183;
    uint256 constant BUYER_KEY = 0xB8183;
    uint256 constant BUDGET = 300_000;
    bytes32 constant TREE = keccak256("tree");
    bytes32 constant RECEIPT = keccak256("receipt");
    bytes32 constant REASON = bytes32("arcade-settled");

    event ArcadeSettled(uint256 indexed jobId, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic, bytes32 receiptHash);
    event ArcadeRefused(uint256 indexed jobId, bytes32 reason);

    function setUp() public {
        vm.warp(10_000);
        buyer = vm.addr(BUYER_KEY);
        provider = vm.addr(PROVIDER_KEY);
        ERC8183WithAuthorization implementation = new ERC8183WithAuthorization();
        escrow = ERC8183WithAuthorization(address(new ERC1967Proxy(
            address(implementation), abi.encodeCall(ERC8183WithAuthorization.initialize, (treasury, address(this)))
        )));
        token = new EscrowTestToken();
        escrow.setPlatformFee(500, treasury);
        escrow.setEvaluatorFee(0);
        escrow.setPaymentTokenAllowed(address(token), true);
        hook = new ArcadeJobHook(address(escrow), evaluator);
        escrow.setHookWhitelist(address(hook), true);
        token.mint(buyer, BUDGET);
        vm.prank(buyer);
        token.approve(address(escrow), BUDGET);
    }

    function create(address jobEvaluator) internal returns (uint256 jobId) {
        vm.prank(buyer);
        jobId = escrow.createJob(provider, jobEvaluator, uint48(block.timestamp + 1 hours), "test listing", address(hook), 0);
        vm.prank(provider);
        escrow.setBudget(jobId, address(token), BUDGET, "");
    }

    function fund(uint256 jobId) internal {
        vm.prank(buyer);
        escrow.fund(jobId, address(token), BUDGET, "");
    }

    function submit(uint256 jobId) internal {
        vm.prank(provider);
        escrow.submit(jobId, keccak256("output"), "");
    }

    function treeData() internal pure returns (bytes memory) {
        return abi.encode(TREE, uint32(2), uint256(100_000), RECEIPT);
    }

    function test_interfacesAndImmutableBindings() public view {
        assertTrue(hook.supportsInterface(type(IERC8183Hook).interfaceId));
        assertTrue(hook.supportsInterface(type(IERC165).interfaceId));
        assertFalse(hook.supportsInterface(0xffffffff));
        assertEq(address(hook.escrow()), address(escrow));
        assertEq(hook.evaluator(), evaluator);
    }

    function test_constructorRefusesMissingBindings() public {
        vm.expectRevert(ArcadeJobHook.InvalidBinding.selector);
        new ArcadeJobHook(address(0), evaluator);
        vm.expectRevert(ArcadeJobHook.InvalidBinding.selector);
        new ArcadeJobHook(buyer, evaluator);
        vm.expectRevert(ArcadeJobHook.InvalidBinding.selector);
        new ArcadeJobHook(address(escrow), address(0));
    }

    function test_onlyEscrowForBothCallbacksIncludingUnknownSelectors() public {
        vm.expectRevert(ArcadeJobHook.OnlyEscrow.selector);
        hook.beforeAction(1, ERC8183.fund.selector, "");
        vm.expectRevert(ArcadeJobHook.OnlyEscrow.selector);
        hook.afterAction(1, ERC8183.complete.selector, "");
        vm.expectRevert(ArcadeJobHook.OnlyEscrow.selector);
        hook.afterAction(1, 0xffffffff, "");
    }

    function test_foreignEvaluatorCannotFundOrMoveTokens() public {
        uint256 id = create(makeAddr("foreign-evaluator"));
        vm.expectRevert(ArcadeJobHook.WrongEvaluator.selector);
        fund(id);
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Open));
        assertEq(token.balanceOf(buyer), BUDGET);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_completeCommitsTreeAndPaysFivePercent() public {
        uint256 id = create(evaluator);
        fund(id);
        submit(id);
        vm.expectEmit(true, false, false, true, address(hook));
        emit ArcadeSettled(id, TREE, 2, 100_000, RECEIPT);
        vm.prank(evaluator);
        escrow.complete(id, REASON, treeData());
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Completed));
        assertEq(token.balanceOf(provider), 285_000);
        assertEq(token.balanceOf(treasury), 15_000);
        assertEq(token.balanceOf(evaluator), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
        vm.expectRevert(ERC8183.WrongStatus.selector);
        vm.prank(evaluator);
        escrow.complete(id, REASON, treeData());
    }

    function test_emptyTreeStillCommitsReceipt() public {
        uint256 id = create(evaluator);
        fund(id);
        submit(id);
        vm.expectEmit(true, false, false, true, address(hook));
        emit ArcadeSettled(id, bytes32(0), 0, 0, RECEIPT);
        vm.prank(evaluator);
        escrow.complete(id, REASON, abi.encode(bytes32(0), uint32(0), uint256(0), RECEIPT));
    }

    function test_malformedCompletionRollsBackPaymentsAndStatus() public {
        uint256 id = create(evaluator);
        fund(id);
        submit(id);
        vm.expectRevert();
        vm.prank(evaluator);
        escrow.complete(id, REASON, hex"01");
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Submitted));
        assertEq(token.balanceOf(address(escrow)), BUDGET);
        assertEq(token.balanceOf(provider), 0);
        assertEq(token.balanceOf(treasury), 0);
    }

    function assertReject(uint256 id) internal {
        bytes32 reason = bytes32("runner-lost");
        vm.expectEmit(true, false, false, true, address(hook));
        emit ArcadeRefused(id, reason);
        vm.prank(evaluator);
        escrow.reject(id, reason, "");
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Rejected));
        assertEq(token.balanceOf(buyer), BUDGET);
        assertEq(token.balanceOf(provider), 0);
        assertEq(token.balanceOf(treasury), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_evaluatorRejectsFundedJobBeforeSubmission() public {
        uint256 id = create(evaluator);
        fund(id);
        assertReject(id);
    }

    function test_evaluatorRejectsSubmittedJob() public {
        uint256 id = create(evaluator);
        fund(id);
        submit(id);
        assertReject(id);
    }

    function test_buyerCannotRejectFundedJobButCanClaimAtExpiry() public {
        uint256 id = create(evaluator);
        fund(id);
        vm.expectRevert(ERC8183.Unauthorized.selector);
        vm.prank(buyer);
        escrow.reject(id, bytes32("cancel"), "");
        vm.warp(escrow.getJob(id).expiredAt);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(buyer), BUDGET);
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Expired));
    }

    function test_submittedRefundWaitsExistingGracePeriod() public {
        uint256 id = create(evaluator);
        fund(id);
        submit(id);
        uint256 expiry = escrow.getJob(id).expiredAt;
        vm.warp(expiry);
        vm.expectRevert(ERC8183.GracePeriodActive.selector);
        escrow.claimRefund(id);
        vm.warp(expiry + escrow.EVALUATION_GRACE_PERIOD());
        escrow.claimRefund(id);
        assertEq(token.balanceOf(buyer), BUDGET);
    }

    function test_initializerEnablesNoHookAndZeroSetterReverts() public {
        assertTrue(escrow.whitelistedHooks(address(0)));
        vm.expectRevert(ERC8183.ZeroAddress.selector);
        escrow.setHookWhitelist(address(0), true);
    }

    function test_relayedSubmissionUsesRealSignatureAndBaseHookSelector() public {
        uint256 id = create(evaluator);
        fund(id);
        bytes32 deliverable = keccak256("relayed output");
        uint72 nonce = 17;
        uint256 deadline = block.timestamp + 600;
        bytes32 hash = keccak256(abi.encode(
            keccak256("SubmitAuthorization(address signer,uint256 jobId,bytes32 deliverable,bytes32 optParamsHash,uint72 nonce,uint256 deadline)"),
            provider, id, deliverable, keccak256(""), nonce, deadline
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PROVIDER_KEY, keccak256(abi.encodePacked(
            "\x19\x01", escrow.DOMAIN_SEPARATOR(), hash
        )));
        ERC8183WithAuthorization.Authorization memory auth = ERC8183WithAuthorization.Authorization(
            provider, nonce, deadline, abi.encodePacked(r, s, v)
        );
        escrow.submitWithAuthorization(id, deliverable, "", auth);
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Submitted));
        vm.expectRevert(ERC8183WithAuthorization.AuthorizationNonceUsed.selector);
        escrow.submitWithAuthorization(id, deliverable, "", auth);
        vm.expectEmit(true, false, false, true, address(hook));
        emit ArcadeSettled(id, TREE, 2, 100_000, RECEIPT);
        vm.prank(evaluator);
        escrow.complete(id, REASON, treeData());
    }

    function fundingAuth(uint256 id) internal view returns (ERC8183WithAuthorization.Authorization memory) {
        uint72 nonce = 19;
        uint256 deadline = block.timestamp + 600;
        bytes32 hash = keccak256(abi.encode(
            escrow.FUND_AUTHORIZATION_TYPEHASH(), buyer, id, address(token), BUDGET, keccak256(""), nonce, deadline
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_KEY, keccak256(abi.encodePacked(
            "\x19\x01", escrow.DOMAIN_SEPARATOR(), hash
        )));
        return ERC8183WithAuthorization.Authorization(buyer, nonce, deadline, abi.encodePacked(r, s, v));
    }

    function test_relayedFundCannotBypassEvaluatorGateAndRollsBackNonce() public {
        uint256 id = create(makeAddr("foreign-evaluator"));
        ERC8183WithAuthorization.Authorization memory auth = fundingAuth(id);
        vm.expectRevert(ArcadeJobHook.WrongEvaluator.selector);
        escrow.fundWithAuthorization(id, address(token), BUDGET, "", auth);
        bytes32 packed = bytes32((uint256(uint160(buyer)) << 96) | uint256(auth.nonce));
        assertFalse(escrow.authorizationNonceUsed(packed));
        assertEq(token.balanceOf(buyer), BUDGET);
    }

    function test_relayedFundSucceedsOnceWithPinnedEvaluator() public {
        uint256 id = create(evaluator);
        ERC8183WithAuthorization.Authorization memory auth = fundingAuth(id);
        escrow.fundWithAuthorization(id, address(token), BUDGET, "", auth);
        assertEq(uint256(escrow.getJob(id).status), uint256(ERC8183.JobStatus.Funded));
        assertEq(token.balanceOf(address(escrow)), BUDGET);
        vm.expectRevert(ERC8183WithAuthorization.AuthorizationNonceUsed.selector);
        escrow.fundWithAuthorization(id, address(token), BUDGET, "", auth);
    }
}
