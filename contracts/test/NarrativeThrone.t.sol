// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NarrativeToken} from "../src/NarrativeToken.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract RejectingReceiver {
    receive() external payable { revert(); }
}

contract NarrativeThroneTest is Test {
    NarrativeToken token;
    NarrativeThrone throne;
    address treasury = makeAddr("treasury");
    address curator = makeAddr("curator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 q1 = keccak256("q1");
    bytes32 q2 = keccak256("q2");
    bytes32 a1 = keccak256("answer one");
    bytes32 a2 = keccak256("answer two");
    string constant Q1_URI = "data:application/json;base64,eyJ0ZXh0IjoicTEifQ==";
    string constant Q2_URI = "data:application/json;base64,eyJ0ZXh0IjoicTIifQ==";
    string constant A1_URI = "data:application/json;base64,eyJ0ZXh0IjoiYTEifQ==";
    string constant A2_URI = "data:application/json;base64,eyJ0ZXh0IjoiYTIifQ==";

    function setUp() public {
        throne = new NarrativeThrone(treasury);
        token = NarrativeToken(address(throne.narr()));
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        throne.startFirstQuestion(q1, curator, Q1_URI, 1 days, 0.001 ether);
    }

    function testImmutableMinterAndFirstTakeover() public {
        assertEq(token.minter(), address(throne));

        uint256 treasuryBefore = treasury.balance;
        uint256 curatorBefore = curator.balance;
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);

        assertEq(throne.currentHolder(), alice);
        assertEq(throne.currentAnswerHash(), a1);
        assertEq(throne.currentAnswerUri(), A1_URI);
        assertEq(throne.currentPrice(), 0.002 ether);
        assertEq(throne.currentEpoch(), 1);
        assertEq(treasury.balance - treasuryBefore, 0.00095 ether);
        assertEq(curator.balance - curatorBefore, 0.00005 ether);
        assertEq(address(throne).balance, 0);
    }

    function testPriceDecaysToFloor() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 1 hours);
        assertEq(throne.getCurrentPrice(), 0.001 ether);
    }

    function testFuzzPriceBoundsAndPayoutConservation(uint64 elapsed) public {
        elapsed = uint64(bound(elapsed, 0, 1 days - 1));

        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + elapsed);

        uint256 price = throne.getCurrentPrice();
        assertGe(price, throne.floorPrice());
        assertGe(price, throne.floorPrice());

        uint256 aliceBefore = alice.balance;
        uint256 treasuryBefore = treasury.balance;
        uint256 curatorBefore = curator.balance;
        vm.prank(bob);
        throne.takeThrone{value: price}(q1, a2, A2_URI, 1, price, block.timestamp + 1 hours);

        assertEq(alice.balance - aliceBefore + treasury.balance - treasuryBefore + curator.balance - curatorBefore, price);
        assertEq(address(throne).balance, 0);
        assertEq(throne.currentEpoch(), 2);
    }

    function testPriceDoublesWithoutProtocolCap() public {
        NarrativeThrone uncapped = new NarrativeThrone(treasury);
        uncapped.startFirstQuestion(q1, curator, Q1_URI, 1 days, 0.001 ether);

        vm.prank(alice);
        uncapped.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        assertEq(uncapped.currentPrice(), 0.002 ether);

        vm.prank(bob);
        uncapped.takeThrone{value: 0.002 ether}(q1, a2, A2_URI, 1, 0.002 ether, block.timestamp + 1 hours);
        assertEq(uncapped.currentPrice(), 0.004 ether);
    }

    function testDeadlineAndMaximumAcceptedPriceAreEnforced() public {
        vm.expectRevert(NarrativeThrone.DeadlineExpired.selector);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp - 1);

        vm.expectRevert(NarrativeThrone.PriceTooHigh.selector);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.0009 ether, block.timestamp + 1 hours);
    }

    function testDethronedHolderGetsDirectPayoutAndAnswerTime() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 30 minutes);

        uint256 price = throne.getCurrentPrice();
        uint256 aliceBefore = alice.balance;
        uint256 treasuryBefore = treasury.balance;
        uint256 curatorBefore = curator.balance;
        vm.prank(bob);
        throne.takeThrone{value: price}(q1, a2, A2_URI, 1, price, block.timestamp + 1 hours);

        assertEq(alice.balance - aliceBefore, price * 80 / 100);
        assertEq(treasury.balance - treasuryBefore, price * 15 / 100);
        assertEq(curator.balance - curatorBefore, price * 5 / 100);
        assertEq(throne.answerHoldSeconds(q1, a1), 30 minutes);
        assertEq(token.balanceOf(alice), 30 minutes * 4 ether);
        assertEq(address(throne).balance, 0);
    }

    function testPriceDriftAcceptsBoundedPaymentAndRefundsExcess() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 30 minutes);

        uint256 price = throne.getCurrentPrice();
        uint256 sent = price + 0.0001 ether;
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        throne.takeThrone{value: sent}(q1, a2, A2_URI, 1, sent, block.timestamp + 1 hours);

        assertEq(bobBefore - bob.balance, price);
        assertEq(address(throne).balance, 0);
    }

    function testRewardsCrossHalvingBoundaryAndMintInSettlementTransaction() public {
        NarrativeThrone halving = new NarrativeThrone(treasury);
        NarrativeToken halvingToken = NarrativeToken(address(halving.narr()));
        halving.startFirstQuestion(q1, curator, Q1_URI, 60 days, 0.001 ether);

        vm.prank(alice);
        halving.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 30 days + 10 seconds);

        uint256 price = halving.getCurrentPrice();
        vm.prank(bob);
        halving.takeThrone{value: price}(q1, a2, A2_URI, 1, price, block.timestamp + 1 hours);

        uint256 expected = 30 days * 4 ether + 10 seconds * 2 ether;
        assertEq(halvingToken.balanceOf(alice), expected);
    }

    function testRewardsContinueAcrossQuestionRotation() public {
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        throne.queueQuestion(q2, curator, Q2_URI);
        vm.warp(block.timestamp + 1 days);
        throne.rotateIfDue(1 days, 0.001 ether);

        assertEq(throne.currentHolder(), alice);
        assertTrue(throne.carryoverAnswerRequired());
        assertEq(throne.currentAnswerHash(), bytes32(0));
        assertEq(token.balanceOf(alice), 1 days * 4 ether);
        assertEq(throne.answerHoldSeconds(q2, a2), 0);

        vm.prank(alice);
        throne.submitCarryoverAnswer(a2, A2_URI);
        vm.warp(block.timestamp + 30 minutes);
        uint256 price = throne.getCurrentPrice();
        vm.prank(bob);
        throne.takeThrone{value: price}(q2, keccak256("answer three"), A1_URI, 2, price, block.timestamp + 1 hours);

        assertEq(token.balanceOf(alice), (1 days + 30 minutes) * 4 ether);
        assertEq(throne.answerHoldSeconds(q2, a2), 30 minutes);
        assertEq(throne.currentEpoch(), 3);
    }

    function testEpochMismatchReverts() public {
        vm.expectRevert(NarrativeThrone.EpochMismatch.selector);
        throne.takeThrone(q1, a1, A1_URI, 1, 0.001 ether, block.timestamp + 1 hours);

        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
    }

    function testQuestionAndAnswerUrisAreStored() public {
        assertEq(throne.activeQuestionUri(), Q1_URI);
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
        assertEq(throne.currentAnswerUri(), A1_URI);
    }

    function testQuestionAndAnswerUrisAreEmitted() public {
        vm.expectEmit(true, true, false, true);
        emit NarrativeThrone.QuestionProposed(q2, address(this), Q2_URI, block.timestamp);
        throne.proposeQuestion(q2, Q2_URI);

        vm.expectEmit(true, true, true, true);
        emit NarrativeThrone.PayoutDistributed(q1, address(0), treasury, curator, 0, 0.00095 ether, 0.00005 ether);
        vm.expectEmit(true, true, true, true);
        emit NarrativeThrone.Takeover(q1, alice, address(0), 0.001 ether, a1, A1_URI, block.timestamp);
        vm.prank(alice);
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
    }

    function testOversizedUriReverts() public {
        bytes memory raw = new bytes(2_049);
        string memory tooLong = string(raw);
        vm.expectRevert(NarrativeThrone.InvalidUri.selector);
        throne.queueQuestion(q2, curator, tooLong);
    }

    function testOversizedAnswerUriReverts() public {
        bytes memory raw = new bytes(2_049);
        string memory tooLong = string(raw);
        vm.expectRevert(NarrativeThrone.InvalidUri.selector);
        throne.takeThrone{value: 0.001 ether}(q1, a1, tooLong, 0, 0.001 ether, block.timestamp + 1 hours);
    }

    function testQuestionRotationRejectsInvalidTransitions() public {
        vm.expectRevert(NarrativeThrone.QuestionStillActive.selector);
        throne.rotateIfDue(1 days, 0.001 ether);

        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(NarrativeThrone.NoQueuedQuestion.selector);
        throne.rotateIfDue(1 days, 0.001 ether);
    }

    function testQuestionProposalRejectsDuplicates() public {
        throne.proposeQuestion(q2, Q2_URI);
        assertTrue(throne.proposedQuestionIds(q2));
        vm.expectRevert(NarrativeThrone.QuestionAlreadyProposed.selector);
        throne.proposeQuestion(q2, Q2_URI);
    }

    function testPayoutFailureRevertsTakeover() public {
        RejectingReceiver rejecting = new RejectingReceiver();
        throne.setTreasury(address(rejecting));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NarrativeThrone.PayoutFailed.selector, address(rejecting), 0.00095 ether));
        throne.takeThrone{value: 0.001 ether}(q1, a1, A1_URI, 0, 0.001 ether, block.timestamp + 1 hours);
    }

    function testPauseAndUnpause() public {
        throne.pause();
        vm.expectRevert();
        throne.proposeQuestion(q2, Q2_URI);
        throne.unpause();
        throne.proposeQuestion(q2, Q2_URI);
    }

    function invariantImmutableMinterAndNoStrandedEth() public {
        assertEq(token.minter(), address(throne));
        assertEq(address(throne).balance, 0);
    }
}
