// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NarrativeToken} from "../src/NarrativeToken.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract Attacker {
    NarrativeThrone public throne;
    bytes32 public q;
    uint64 public epoch;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;
    bool public carryoverDuringPayout;

    constructor(NarrativeThrone t, bytes32 q_, uint64 epoch_) {
        throne = t;
        q = q_;
        epoch = epoch_;
    }

    function seize(uint256 maxPrice) external payable {
        throne.takeThrone{value: msg.value}(q, keccak256("attacker"), "ipfs://attacker", epoch, maxPrice, block.timestamp + 1 hours);
    }

    receive() external payable {
        reentryAttempts++;
        uint256 reentryValue = address(this).balance >= 1 ether ? 1 ether : address(this).balance;
        (bool ok,) = address(throne).call{value: reentryValue}(
            abi.encodeWithSelector(
                NarrativeThrone.takeThrone.selector,
                q, keccak256("attacker2"), "ipfs://attacker2", epoch + 1, type(uint256).max, block.timestamp + 1 hours
            )
        );
        reentrySucceeded = reentrySucceeded || ok;
        (bool carryOk,) = address(throne).call(
            abi.encodeWithSelector(NarrativeThrone.submitCarryoverAnswer.selector, keccak256("late"), "ipfs://late")
        );
        carryoverDuringPayout = carryOk;
    }
}

contract RejectingKing {
    NarrativeThrone public immutable throne;
    bytes32 public immutable q;

    constructor(NarrativeThrone t, bytes32 q_) {
        throne = t;
        q = q_;
    }

    function seize(uint256 maxPrice) external payable {
        throne.takeThrone{value: msg.value}(q, keccak256("rejector"), "ipfs://rejector", 0, maxPrice, block.timestamp + 1 hours);
    }

    receive() external payable {
        revert("king refuses payout");
    }
}

contract DonationContract {
    function forceDonate(address target) external payable {
        selfdestruct(payable(target));
    }
}

contract NarrativeThroneAttackTest is Test {
    NarrativeThrone throne;
    NarrativeToken token;
    address treasury = makeAddr("treasury");
    address curator = makeAddr("curator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address eve = makeAddr("eve");

    bytes32 q1 = keccak256("q1");
    bytes32 q2 = keccak256("q2");
    bytes32 a1 = keccak256("answer one");
    bytes32 a2 = keccak256("answer two");
    string constant Q1_URI = "ipfs://q1";
    string constant Q2_URI = "ipfs://q2";
    string constant A1_URI = "ipfs://a1";

    uint256 constant FLOOR = 0.001 ether;
    uint256 constant MAX = 1 ether;
    uint256 constant DURATION = 1 days;

    function setUp() public {
        throne = new NarrativeThrone(treasury);
        token = NarrativeToken(address(throne.narr()));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(eve, 100 ether);
        throne.startFirstQuestion(q1, curator, Q1_URI, DURATION, FLOOR, MAX);
    }

    function _take(address taker, bytes32 answerHash, uint64 epoch) internal {
        uint256 price = throne.getCurrentPrice();
        bytes32 question = throne.activeQuestionId();
        vm.prank(taker);
        throne.takeThrone{value: price}(question, answerHash, A1_URI, epoch, price, block.timestamp + 1 hours);
    }

    function testReentrantTakeoverIsBlockedAndStateConsistent() public {
        Attacker attacker = new Attacker(throne, q1, 0);
        vm.deal(address(attacker), 10 ether);

        attacker.seize{value: FLOOR}(FLOOR);
        assertEq(throne.currentHolder(), address(attacker));
        assertEq(address(throne).balance, 0, "conservation: throne must hold nothing");

        vm.warp(block.timestamp + 10 minutes);
        _take(alice, a1, 1);

        assertGe(attacker.reentryAttempts(), 1, "attacker must have received payout callback");
        assertFalse(attacker.reentrySucceeded(), "reentrant takeThrone must fail (nonReentrant)");
        assertEq(throne.currentHolder(), alice);
        assertEq(throne.currentEpoch(), 2);
        assertEq(address(throne).balance, 0, "conservation after reentry attempt");
    }

    function testReentrantCarryoverCannotCorruptSettlement() public {
        Attacker attacker = new Attacker(throne, q1, 0);
        vm.deal(address(attacker), 10 ether);
        attacker.seize{value: FLOOR}(FLOOR);

        vm.warp(block.timestamp + 10 minutes);
        _take(alice, a1, 1);

        assertEq(throne.currentAnswerHash(), a1, "late carryover must not overwrite settled answer");
        assertEq(throne.lastTakeoverAt(), block.timestamp, "lastTakeoverAt must reflect dethroning tx");
    }

    function testDonatedEthCannotBeExtracted() public {
        DonationContract donor = new DonationContract();
        donor.forceDonate{value: 5 ether}(address(throne));
        assertEq(address(throne).balance, 5 ether);

        _take(alice, a1, 0);
        assertEq(address(throne).balance, 5 ether, "donated ETH must stay inert");

        vm.warp(block.timestamp + 1 hours);
        _take(bob, a2, 1);
        assertEq(address(throne).balance, 5 ether, "donated ETH must stay inert across takeovers");
    }

    function testRejectingKingBlocksTakeoverButRotationRecovers() public {
        RejectingKing king = new RejectingKing(throne, q1);
        vm.deal(address(king), 10 ether);
        king.seize{value: FLOOR}(FLOOR);
        assertEq(throne.currentHolder(), address(king));

        vm.warp(block.timestamp + 10 minutes);
        uint256 price = throne.getCurrentPrice();
        vm.prank(bob);
        vm.expectRevert();
        throne.takeThrone{value: price}(q1, a2, A1_URI, 1, price, block.timestamp + 1 hours);

        vm.warp(block.timestamp + DURATION + 1);
        throne.queueQuestion(q2, curator, Q2_URI);
        throne.rotateIfDue(DURATION, FLOOR, MAX);
        assertEq(throne.activeQuestionId(), q2, "rotation must bypass a rejecting king");
        assertEq(throne.questionResolved(q1), true);
    }

    function testWinAttributionTheftViaAnswerCopying() public {
        _take(alice, a1, 0);
        vm.warp(block.timestamp + 100);
        _take(bob, a1, 1);
        vm.warp(block.timestamp + 100);
        _take(eve, a1, 2);

        vm.warp(block.timestamp + DURATION + 1);
        throne.queueQuestion(q2, curator, Q2_URI);
        throne.rotateIfDue(DURATION, FLOOR, MAX);

        assertEq(throne.leadingAnswer(q1), a1);
        assertEq(throne.leadingHolder(q1), eve, "answer copying lets last holder capture win attribution");
    }

    function testNoFreeThroneAtFloor() public {
        uint256 price = throne.getCurrentPrice();
        assertEq(price, FLOOR);
        vm.prank(alice);
        vm.expectRevert(NarrativeThrone.IncorrectPayment.selector);
        throne.takeThrone{value: 0}(q1, a1, A1_URI, 0, FLOOR, block.timestamp + 1 hours);
        assertEq(throne.currentHolder(), address(0));
    }

    function testNoDoubleMintAcrossSettlements() public {
        _take(alice, a1, 0);
        vm.warp(block.timestamp + 100);
        _take(bob, a2, 1);
        uint256 supply = token.totalSupply();

        vm.warp(block.timestamp + 200);
        _take(eve, a1, 2);
        uint256 delta = token.totalSupply() - supply;
        assertApproxEqAbs(delta, throne.INITIAL_EMISSION() * 200, 1e10, "linear accrual, no double mint");
    }

    function _startLongQuestion() internal {
        throne.queueQuestion(q2, curator, Q2_URI);
        vm.warp(block.timestamp + DURATION + 1);
        throne.rotateIfDue(730 days, FLOOR, MAX);
    }

    function testEmissionsBoundedOverOneYear() public {
        _startLongQuestion();
        _take(alice, a1, 1);
        vm.warp(block.timestamp + 365 days);
        _take(bob, a2, 2);
        uint256 supply = token.totalSupply();
        assertLe(supply, throne.INITIAL_EMISSION() * 366 days + throne.TAIL_EMISSION() * 366 days);
    }

    function testLongDormantSettlementCompletes() public {
        _startLongQuestion();
        _take(alice, a1, 1);
        vm.warp(block.timestamp + 500 days);
        _take(bob, a2, 2);
        assertEq(throne.currentHolder(), bob, "settlement after long dormancy must still complete");
    }

    function testOwnerCannotRugFunds() public {
        _take(alice, a1, 0);
        assertEq(address(throne).balance, 0, "protocol never custodies user funds");
    }

    function testFuzzConservationUnderRandomPlay(uint256 seed) public {
        vm.assume(seed != 0);
        address[3] memory players = [alice, bob, eve];
        uint64 epoch = 0;
        uint256 inBefore = treasury.balance + curator.balance + alice.balance + bob.balance + eve.balance;

        for (uint256 i = 0; i < 12; i++) {
            uint256 warpTime = uint256(keccak256(abi.encode(seed, i, "w"))) % 2 hours;
            vm.warp(block.timestamp + warpTime);
            if (block.timestamp >= throne.questionEnd()) break;

            address player = players[uint256(keccak256(abi.encode(seed, i, "p"))) % 3];
            uint256 price = throne.getCurrentPrice();
            uint256 payAmount = price + (uint256(keccak256(abi.encode(seed, i, "x"))) % 0.01 ether);

            vm.prank(player);
            throne.takeThrone{value: payAmount}(q1, keccak256(abi.encode(seed, i)), A1_URI, epoch, payAmount, block.timestamp + 1 hours);
            epoch++;
            assertEq(address(throne).balance, 0, "conservation inside fuzz sequence");
        }

        uint256 inAfter = treasury.balance + curator.balance + alice.balance + bob.balance + eve.balance;
        assertEq(inBefore, inAfter, "no ETH may be created or destroyed outside explicit payments");
    }
}
