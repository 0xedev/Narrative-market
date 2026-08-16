// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NarrativeToken} from "../src/NarrativeToken.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract NarrativeThroneTest is Test {
    NarrativeToken token;
    NarrativeThrone throne;
    address treasury = makeAddr("treasury");
    address curator = makeAddr("curator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 q1 = keccak256("q1");
    bytes32 a1 = keccak256("answer one");
    bytes32 a2 = keccak256("answer two");

    function setUp() public {
        token = new NarrativeToken();
        throne = new NarrativeThrone(address(token), treasury);
        token.setMinter(address(throne));
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        throne.startFirstQuestion(q1, curator, 1 days, 0.001 ether, 0.1 ether);
    }

    function testFirstTakeoverAndPriceReset() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, 0.001 ether, block.timestamp + 1 hours);
        assertEq(throne.currentHolder(), alice);
        assertEq(throne.currentAnswerHash(), a1);
        assertEq(throne.currentPrice(), 0.002 ether);
    }

    function testPriceDecaysToFloor() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 1 hours);
        assertEq(throne.getCurrentPrice(), 0.001 ether);
    }

    function testDethronedHolderGetsCreditAndAnswerTime() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 30 minutes);
        vm.prank(bob);
        throne.takeThrone{value: 0.002 ether}(q1, a2, 0.002 ether, block.timestamp + 1 hours);
        assertGt(throne.ethCredits(alice), 0);
        assertEq(throne.answerHoldSeconds(q1, a1), 30 minutes);
    }

    function testRewardsCrossHalvingBoundary() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 30 days + 10 seconds);
        uint256 pending = throne.pendingReward(alice);
        assertGt(pending, 30 days * 2 ether);
        assertLt(pending, 30 days * 4 ether + 100 ether);
    }

    function testCarryoverRequiresFreshAnswer() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, 0.001 ether, block.timestamp + 1 hours);
        bytes32 q2 = keccak256("q2");
        throne.queueQuestion(q2, curator);
        vm.warp(block.timestamp + 1 days);
        throne.rotateIfDue(1 days, 0.001 ether, 0.1 ether);
        assertEq(throne.currentHolder(), alice);
        assertTrue(throne.carryoverAnswerRequired());
        vm.prank(alice);
        throne.submitCarryoverAnswer(a2);
        assertEq(throne.currentAnswerHash(), a2);
    }
}
