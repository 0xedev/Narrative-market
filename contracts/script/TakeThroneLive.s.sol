// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract TakeThroneLive is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address throneAddress = 0x3d683C4867b2ed61FDD37F5339C68A3d6fb17B29;
        NarrativeThrone throne = NarrativeThrone(payable(throneAddress));

        bytes32 questionId = throne.activeQuestionId();
        uint64 epoch = throne.currentEpoch();
        uint256 price = throne.getCurrentPrice();
        string memory answer = "Foundry live takeover execution";
        bytes32 answerHash = keccak256(bytes(answer));
        string memory answerUri = string.concat("data:text/plain,", answer);
        uint256 deadline = block.timestamp + 300;

        console.log("Active Question:", vm.toString(questionId));
        console.log("Epoch:", epoch);
        console.log("Current Price (wei):", price);

        vm.startBroadcast(deployerKey);
        throne.takeThrone{value: price}(
            questionId,
            answerHash,
            answerUri,
            epoch,
            price,
            deadline
        );
        vm.stopBroadcast();

        console.log("Takeover completed successfully!");
        console.log("New King:", throne.currentHolder());
        console.log("New Epoch:", throne.currentEpoch());
        console.log("New Price (wei):", throne.currentPrice());
    }
}