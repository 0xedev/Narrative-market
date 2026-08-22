// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NarrativeThrone} from "../../src/NarrativeThrone.sol";
import {NarrativeToken} from "../../src/NarrativeToken.sol";

contract RhTestnetForkTest is Test {
    NarrativeThrone constant THRONE = NarrativeThrone(0xd87fCf950760F9373E656387736f8EAfC3757dA2);
    NarrativeToken constant TOKEN = NarrativeToken(0x3147400e2e7724818DaA5e96524aE46E543aB433);
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("RH_TESTNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        try vm.createSelectFork(rpc) {
            forked = true;
        } catch {
            vm.skip(true);
        }
    }

    function testLiveContractsDeployedAndConfigured() public view {
        assertTrue(forked);
        assertTrue(address(THRONE).code.length > 0, "throne must have code");
        assertTrue(address(TOKEN).code.length > 0, "token must have code");
        assertEq(address(THRONE.narr()), address(TOKEN), "throne must own the deployed token");
        assertTrue(TOKEN.minter() == address(THRONE), "minter must be the throne");
        assertTrue(THRONE.treasury() != address(0), "treasury must be set");
        assertTrue(THRONE.owner() != address(0), "owner must be set");
    }

    function testLivePriceWithinBounds() public view {
        assertTrue(forked);
        if (THRONE.activeQuestionId() == bytes32(0)) return;
        uint256 price = THRONE.getCurrentPrice();
        assertGe(price, THRONE.floorPrice());
        assertLe(price, THRONE.maxPrice());
    }

    function testLiveBalanceConservation() public view {
        assertTrue(forked);
        assertEq(address(THRONE).balance, 0, "live throne must not custody ETH");
    }

    function testSimulatedTakeoverOnFork() public {
        assertTrue(forked);
        if (THRONE.activeQuestionId() == bytes32(0) || block.timestamp >= THRONE.questionEnd()) return;

        address challenger = makeAddr("fork-challenger");
        vm.deal(challenger, 100 ether);

        address previousHolder = THRONE.currentHolder();
        uint256 prevBalance = previousHolder.balance;
        uint256 price = THRONE.getCurrentPrice();
        uint64 epoch = uint64(THRONE.currentEpoch());

        vm.prank(challenger);
        THRONE.takeThrone{value: price}(
            THRONE.activeQuestionId(), keccak256("fork-answer"), "ipfs://fork", epoch, price, block.timestamp + 1 hours
        );

        assertEq(THRONE.currentHolder(), challenger, "challenger must hold throne");
        assertEq(address(THRONE).balance, 0, "conservation on live fork");
        if (previousHolder != address(0)) {
            assertEq(previousHolder.balance - prevBalance, price * THRONE.KING_BPS() / THRONE.BPS(), "king payout must be 80%");
        }
    }
}
