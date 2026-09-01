// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NarrativeToken} from "../src/NarrativeToken.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract ThroneHandler is Test {
    NarrativeThrone public immutable throne;
    address[] public players;
    uint256 public nonce;
    uint256 public takeovers;
    uint256 public rotations;

    constructor(NarrativeThrone t) {
        throne = t;
        for (uint256 i = 0; i < 5; i++) {
            address p = makeAddr(string(abi.encodePacked(vm.toString(i), "-player")));
            vm.deal(p, 1000 ether);
            players.push(p);
        }
    }

    function play(uint256 playerIdx, uint256 warpDelta, uint256 extra) external {
        if (throne.activeQuestionId() == bytes32(0)) return;
        vm.warp(block.timestamp + (warpDelta % 45 minutes));
        if (block.timestamp >= throne.questionEnd()) {
            throne.queueQuestion(keccak256(abi.encode("q", nonce)), players[0], "ipfs://inv-q");
            try throne.rotateIfDue(1 days, 0.001 ether) {
                rotations++;
            } catch {}
            return;
        }
        address player = players[playerIdx % players.length];
        uint256 price = throne.getCurrentPrice();
        uint256 payAmount = price + (extra % 0.005 ether);
        if (player.balance < payAmount) vm.deal(player, 1000 ether);
        bytes32 answer = keccak256(abi.encode("a", nonce));
        bytes32 question = throne.activeQuestionId();
        uint64 epoch = uint64(throne.currentEpoch());
        vm.prank(player);
        throne.takeThrone{value: payAmount}(question, answer, "ipfs://inv-a", epoch, payAmount, block.timestamp + 1 hours);
        takeovers++;
        nonce++;
    }

    function submitCarryover(uint256 playerIdx) external {
        address holder = players[playerIdx % players.length];
        if (!throne.carryoverAnswerRequired() || throne.currentHolder() != holder) return;
        vm.prank(holder);
        throne.submitCarryoverAnswer(keccak256(abi.encode("c", nonce)), "ipfs://inv-c");
        nonce++;
    }
}

contract NarrativeThroneInvariantTest is Test {
    NarrativeThrone throne;
    NarrativeToken token;
    ThroneHandler handler;

    function setUp() public {
        throne = new NarrativeThrone(makeAddr("treasury"));
        token = NarrativeToken(address(throne.narr()));
        throne.transferOwnership(address(this));
        throne.startFirstQuestion(keccak256("genesis"), makeAddr("curator"), "ipfs://genesis", 1 days, 0.001 ether);
        handler = new ThroneHandler(throne);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = ThroneHandler.play.selector;
        selectors[1] = ThroneHandler.submitCarryover.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_ethNeverCustodied() public view {
        assertEq(address(throne).balance, 0, "protocol must never hold user ETH");
    }

    function invariant_priceNeverFallsBelowFloor() public view {
        if (throne.activeQuestionId() == bytes32(0) || block.timestamp >= throne.questionEnd()) return;
        uint256 price = throne.getCurrentPrice();
        assertGe(price, throne.floorPrice());
    }

    function invariant_supplyBoundedByEmissionCap() public view {
        uint256 elapsed = block.timestamp - throne.emissionStart();
        assertLe(token.totalSupply(), throne.INITIAL_EMISSION() * elapsed, "supply exceeds initial-rate ceiling");
    }

    function invariant_epochsTrackStateTransitions() public view {
        assertEq(throne.currentEpoch(), handler.takeovers() + handler.rotations());
    }

    function invariant_holderHoldsAnswer() public view {
        if (throne.currentHolder() != address(0) && !throne.carryoverAnswerRequired()) {
            assertTrue(throne.currentAnswerHash() != bytes32(0), "settled holder must have an answer");
        }
    }
}
