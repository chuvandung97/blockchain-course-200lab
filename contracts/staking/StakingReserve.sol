// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Staking reserve is a contract that holds tokens from staking actions and allows
//  the staking contract to take the amount to interest their profit

contract StakingReserve is Ownable {
    IERC20 public mainToken;
    address public stakeAddress;

    constructor(address _mainToken) {
        mainToken = IERC20(_mainToken);
    }

    function setStakeAddress(address _stakeAddress) external onlyOwner {
        stakeAddress = _stakeAddress;
    }

    function getBalanceOfReserve() public view returns (uint256) {
        return mainToken.balanceOf(address(this));
    }

    function distributeGold(address _recipient, uint256 _amount) public {
        require(_msgSender() == stakeAddress);
        require(
            _amount <= getBalanceOfReserve(),
            "StakingReserve: Not enough token"
        );
        mainToken.transfer(_recipient, _amount);
    }
}
