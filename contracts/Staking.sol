// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Reserve.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Staking is Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint;

    StakingReserve public immutable reserve;
    IERC20 public immutable gold;
    event StakeUpdate(
        address account,
        uint256 packageId,
        uint256 amount,
        uint256 totalProfit
    );
    event StakeReleased(
        address account,
        uint256 packageId,
        uint256 amount,
        uint256 totalProfit
    );
    struct StakePackage {
        uint256 rate;
        uint256 decimal;
        uint256 minStaking;
        uint256 lockTime;
        bool isOffline;
    }
    struct StakingInfo {
        uint256 startTime;
        uint256 timePoint;
        uint256 amount;
        uint256 totalProfit;
    }
    Counters.Counter private _stakePackageCount;
    mapping(uint256 => StakePackage) public stakePackages;
    mapping(address => mapping(uint256 => StakingInfo)) public stakes;

    /**
     * @dev Initialize
     * @notice This is the initialize function, run on deploy event
     * @param tokenAddr_ address of main token
     * @param reserveAddress_ address of reserve contract
     */
    constructor(address tokenAddr_, address reserveAddress_) {
        gold = IERC20(tokenAddr_);
        reserve = StakingReserve(reserveAddress_);
    }

    /**
     * @dev Add new staking package
     * @notice New package will be added with an id
     */
    function addStakePackage(
        uint256 rate_,
        uint256 decimal_,
        uint256 minStaking_,
        uint256 lockTime_
    ) public onlyOwner {
        require(rate_ > 0, "Invalid package rate");
        require(minStaking_ > 0, "Invalid min staking");
        require(lockTime_ > 0, "Invalid lock time");
        uint256 _packageId = _stakePackageCount.current();
        stakePackages[_packageId] = StakePackage(
            rate_,
            decimal_,
            minStaking_,
            lockTime_,
            false
        );
        _stakePackageCount.increment();
    }

    /**
     * @dev Remove an stake package
     * @notice A stake package with packageId will be set to offline
     * so none of new staker can stake to an offine stake package
     */
    function removeStakePackage(uint256 packageId_) public onlyOwner checkExistsStakePackage(packageId_) {
        require(!stakePackages[packageId_].isOffline, "This stake package is already remove.");
        stakePackages[packageId_].isOffline = true;
    }

    /**
     * @dev User stake amount of gold to stakes[address][packageId]
     * @notice if is there any amount of gold left in the stake package,
     * calculate the profit and add it to total Profit,
     * otherwise just add completely new stake. 
     */
    function stake(uint256 amount_, uint256 packageId_) external {
        require(stakePackages[packageId_].isOffline, "Package is offiline");
        require(_msgSender() != address(0), "Sender must not be zero address.");
        require(gold.allowance(_msgSender(), address(this)) >= amount_, "Insufficient balance.");
        require(amount_ >= stakePackages[packageId_].minStaking, "Amount must be greater than min staking.");

        gold.transferFrom(_msgSender(), address(this), amount_);

        if(stakes[_msgSender()][packageId_].amount > 0) {
            stakes[_msgSender()][packageId_].amount.add(amount_);
            stakes[_msgSender()][packageId_].timePoint = block.timestamp;
            stakes[_msgSender()][packageId_].totalProfit = calculateProfit(packageId_);
        } else {
            stakes[_msgSender()][packageId_] = StakingInfo(
                block.timestamp,
                block.timestamp,
                amount_,
                0
            );   
        } 
        emit StakeUpdate(
            _msgSender(), 
            packageId_, 
            stakes[_msgSender()][packageId_].amount, 
            stakes[_msgSender()][packageId_].totalProfit
        );
    }
    /**
     * @dev Take out all the stake amount and profit of account's stake from reserve contract
     */
    function unStake(uint256 packageId_) external checkExistsStakePackage(packageId_) {

        reserve.distributeGold(_msgSender(), stakes[_msgSender()][packageId_].amount + calculateProfit(packageId_));
    }
    /**
     * @dev calculate current profit of an package of user known packageId
     */

    function calculateProfit(uint256 packageId_)
        public
        view
        checkExistsStakePackage(packageId_) returns (uint256)
    { 
        return (block.timestamp - stakes[_msgSender()][packageId_].timePoint)
            .mul(stakes[_msgSender()][packageId_].amount)
            .mul(getAprOfPackage(packageId_))
            .div(100)
            .div(365);
    }

    function getAprOfPackage(uint256 packageId_)
        public
        view
        returns (uint256)
    {
        return stakePackages[packageId_].rate;
    }

    modifier checkExistsStakePackage(uint256 packageId_) {
        require(stakePackages[packageId_].rate > 0, "Invalid package ID"); 
        _;
    }
}
