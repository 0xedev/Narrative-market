// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {NarrativeToken} from "../src/NarrativeToken.sol";
import {NarrativeThrone} from "../src/NarrativeThrone.sol";

contract Deploy is Script {
    function run() external returns (NarrativeToken token, NarrativeThrone throne) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);
        throne = new NarrativeThrone(treasury);
        token = NarrativeToken(address(throne.narr()));
        vm.stopBroadcast();
    }
}
