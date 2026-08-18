// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract NarrativeToken is ERC20, ERC20Permit {
    address public immutable minter;

    error NotMinter();

    constructor() ERC20("Narrative", "NARR") ERC20Permit("Narrative") { minter = msg.sender; }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
