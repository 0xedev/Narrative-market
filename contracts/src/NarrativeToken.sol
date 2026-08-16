// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract NarrativeToken is ERC20, ERC20Permit, Ownable {
    address public minter;

    error NotMinter();
    error ZeroAddress();

    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    constructor() ERC20("Narrative", "NARR") ERC20Permit("Narrative") Ownable(msg.sender) {}

    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
