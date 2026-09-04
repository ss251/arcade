// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {FeeSplitterV2} from "../FeeSplitterV2.sol";
import {MockUSDC} from "./FeeSplitter.t.sol"; // reuse the existing mock token from the v1 test

contract FeeSplitterV2Test is Test {
    MockUSDC usdc;
    FeeSplitterV2 s;
    address seller = address(0xBEEF);
    address treasury = address(0xCAFE);
    uint256 buyerKey = 0xA11CE;
    address buyer;

    function setUp() public {
        usdc = new MockUSDC();
        s = new FeeSplitterV2(address(usdc), seller, treasury, 500);
        buyer = vm.addr(buyerKey);
        usdc.mint(buyer, 1_000_000);
    }

    function _auth(uint256 value, bytes32 nonce) internal view returns (uint8 v, bytes32 r, bytes32 sg) {
        bytes32 digest = usdc.transferDigest(buyer, address(s), value, 0, type(uint256).max, nonce);
        (v, r, sg) = vm.sign(buyerKey, digest);
    }

    function testSettleWithTreeEmitsCommitment() public {
        bytes32 nonce = keccak256("n1");
        bytes32 tree = keccak256("tree");
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
        bytes32 nonce = keccak256("n3");
        bytes32 tree = keccak256("t");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(10_000, nonce);
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
        vm.expectRevert();
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
    }
}
