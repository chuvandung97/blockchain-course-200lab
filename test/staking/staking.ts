import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Gold, Staking, StakingReserve } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Staking", function () {
    let admin: SignerWithAddress
    let staker: SignerWithAddress

    let goldContract: Gold
    let stakingReserveContract: StakingReserve
    let stakingContract: Staking
    let oneDay = 86400
    let defaultMinStaking = ethers.utils.parseEther("100")
    let defaultStakeAmount = ethers.utils.parseEther("500")
    let defaultRate = 3 // 3%/year
    let defaultDecimal = 0
    let stakingReserveBalance = ethers.utils.parseEther("10000")
    let defaultTokenAmountOfStaker = ethers.utils.parseEther("2000")
    let nullAdress = "0x0000000000000000000000000000000000000000"

    beforeEach(async () => {
        [admin, staker] = await ethers.getSigners();
        const gold = await ethers.getContractFactory("Gold");
        goldContract = await gold.deploy()
        await goldContract.deployed()

        const stakingReserve = await ethers.getContractFactory("StakingReserve");
        stakingReserveContract = await stakingReserve.deploy(goldContract.address)
        await stakingReserveContract.deployed()

        const staking = await ethers.getContractFactory("Staking");
        stakingContract = await staking.deploy(goldContract.address, stakingReserveContract.address)
        await stakingReserveContract.deployed()

        await stakingReserveContract.setStakeAddress(stakingContract.address)
        await goldContract.transfer(stakingReserveContract.address, stakingReserveBalance)
        await goldContract.transfer(staker.address, defaultTokenAmountOfStaker)
        await goldContract.connect(staker).approve(stakingContract.address, defaultTokenAmountOfStaker.div(2))
    })
    describe("Add stake package", function () {
        it("should revert if rate <= 0", async function () {
            await expect(stakingContract.addStakePackage(0, defaultDecimal, defaultMinStaking, 30 * oneDay)).to.be.revertedWith("Invalid package rate")
        })
        it("should revert if min staking <= 0", async function () {
            await expect(stakingContract.addStakePackage(3, defaultDecimal, 0, 30 * oneDay)).to.be.revertedWith("Invalid min staking")
        })
        it("should revert if lock time <= 0", async function () {
            await expect(stakingContract.addStakePackage(3, defaultDecimal, defaultMinStaking, 0 * oneDay)).to.be.revertedWith("Invalid lock time")
        })
        it("should add stake package correctly", async function () {
            await stakingContract.addStakePackage(3, 0, defaultMinStaking, 30 * oneDay)
            const stakePackage = await stakingContract.stakePackages(1)
            expect(stakePackage.rate).to.be.equal(3)
            expect(stakePackage.decimal).to.be.equal(0)
            expect(stakePackage.minStaking).to.be.equal(defaultMinStaking)
            expect(stakePackage.lockTime).to.be.equal(30 * oneDay)
            expect(stakePackage.isOffline).to.be.equal(false)
        });
    })
    describe("Remove stake package", function () {
        beforeEach(async () => {
            await stakingContract.addStakePackage(3, 0, defaultMinStaking, 30 * oneDay)
        })
        it("should revert if package not exists", async function () {
            await expect(stakingContract.removeStakePackage(2)).to.be.revertedWith("Invalid package ID")
        })
        it("should remove stake package correctly", async function () {
            await stakingContract.removeStakePackage(1)
            const stakePackage = await stakingContract.stakePackages(1)
            expect(stakePackage.isOffline).to.be.equal(true)
        })
        it("should revert if package is already remove", async function () {
            await stakingContract.removeStakePackage(1)
            await expect(stakingContract.removeStakePackage(1)).to.be.revertedWith("This stake package is already remove")
        })
    })
    describe("Stake", function () {
        beforeEach(async () => {
            await stakingContract.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, 30 * oneDay)
        })
        it("should revert if package not exists", async function () {
            await expect(stakingContract.connect(staker).stake(defaultStakeAmount, 2)).to.be.revertedWith("Invalid package ID")
        })
        it("should revert if package is already remove", async function () {
            await stakingContract.removeStakePackage(1)
            await expect(stakingContract.connect(staker).stake(defaultStakeAmount, 1)).to.be.revertedWith("Package is offline")
        })
        it("should revert if sender is null address", async function () {
            await expect(stakingContract.connect(nullAdress).stake(defaultStakeAmount, 1)).to.be.revertedWith("Sender must not be zero address.")
        })
        it("should revert if sender insufficient balance", async function () {
            await expect(stakingContract.connect(staker).stake(defaultTokenAmountOfStaker.mul(2), 1)).to.be.revertedWith("Insufficient balance.")
        })
        it("should revert if amount < min staking", async function () {
            await expect(stakingContract.connect(staker).stake(ethers.utils.parseEther("50"), 1)).to.be.revertedWith("Amount must be greater than min staking.")
        })
        it("should stake correctly when amount of staking info = 0", async function () {
            const stakeTx = await stakingContract.connect(staker).stake(defaultStakeAmount, 1)
            await expect(stakeTx).to.be.emit(stakingContract, "StakeUpdate").withArgs(staker.address, 1, defaultStakeAmount, 0)
            expect(await goldContract.balanceOf(staker.address)).to.be.equal(defaultTokenAmountOfStaker.sub(defaultStakeAmount))
            expect(await stakingReserveContract.getBalanceOfReserve()).to.be.equal(stakingReserveBalance.add(defaultStakeAmount))

            const stakeInfo = await stakingContract.connect(staker).stakes(staker.address, 1)
            const blockNum = await ethers.provider.getBlockNumber()
            const block = await ethers.provider.getBlock(blockNum)
            expect(stakeInfo.startTime).to.be.equal(block.timestamp)
            expect(stakeInfo.timePoint).to.be.equal(block.timestamp)
        })
        it("should stake correctly when amount of staking info > 0", async function () {
            await stakingContract.connect(staker).stake(defaultStakeAmount, 1)
            const startBlockNum = await ethers.provider.getBlockNumber()
            const startBlock = await ethers.provider.getBlock(startBlockNum)
            await network.provider.send("evm_increaseTime", [oneDay * 10])

            const stakeTx = await stakingContract.connect(staker).stake(defaultStakeAmount, 1)
            const stakeInfo = await stakingContract.stakes(staker.address, 1)
            const blockNum = await ethers.provider.getBlockNumber()
            const block = await ethers.provider.getBlock(blockNum)

            const totalProfit = defaultStakeAmount.mul(oneDay * 10).mul(defaultRate).div(oneDay * 365).div(10 ** (defaultDecimal + 2));

            expect(stakeInfo.startTime).to.be.equal(startBlock.timestamp)
            expect(stakeInfo.timePoint).to.be.equal(block.timestamp)
            expect(await goldContract.balanceOf(staker.address)).to.be.equal(defaultTokenAmountOfStaker.sub(defaultStakeAmount.mul(2)))
            expect(await stakingReserveContract.getBalanceOfReserve()).to.be.equal(stakingReserveBalance.add(defaultStakeAmount.mul(2)))

            await expect(stakeTx).to.be.emit(stakingContract, "StakeUpdate").withArgs(staker.address, 1, defaultStakeAmount.mul(2), totalProfit)
        })
    })
    describe("Unstake", function () {
        beforeEach(async () => {
            await stakingContract.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, 30 * oneDay)
            await stakingContract.connect(staker).stake(defaultStakeAmount, 1)
        })
        it("should revert if package not exists", async function () {
            await expect(stakingContract.connect(staker).stake(defaultStakeAmount, 2)).to.be.revertedWith("Invalid package ID")
        })
        it("should revert if it's not time to unstake", async function () {
            await network.provider.send("evm_increaseTime", [oneDay * 20])
            await expect(stakingContract.connect(staker).unStake(1)).to.be.revertedWith("It's not time to unstake")
        })
        it("should unstake correctly when only stake 1 time", async function () {
            await network.provider.send("evm_increaseTime", [oneDay * 30])
            const unstakeTx = await stakingContract.connect(staker).unStake(1)
            const stakeInfo = await stakingContract.stakes(staker.address, 1)

            expect(stakeInfo.startTime).to.be.equal(0)
            expect(stakeInfo.timePoint).to.be.equal(0)
            expect(stakeInfo.amount).to.be.equal(0)
            expect(stakeInfo.totalProfit).to.be.equal(0)

            const totalProfit = defaultStakeAmount.mul(oneDay * 30).mul(defaultRate).div(oneDay * 365).div(10 ** (defaultDecimal + 2));
            await expect(unstakeTx).to.be.emit(stakingContract, "StakeReleased").withArgs(staker.address, 1, defaultStakeAmount, totalProfit)
            expect(await goldContract.balanceOf(staker.address)).to.be.equal(defaultTokenAmountOfStaker.add(totalProfit))
            expect(await stakingReserveContract.getBalanceOfReserve()).to.be.equal(stakingReserveBalance.sub(totalProfit))
        })
        it("should unstake correctly when stake >= 2 times", async function () {
            await network.provider.send("evm_increaseTime", [oneDay * 10])
            await stakingContract.connect(staker).stake(defaultStakeAmount, 1)

            await network.provider.send("evm_increaseTime", [oneDay * 30])
            const unstakeTx = await stakingContract.connect(staker).unStake(1)
            const stakeInfo = await stakingContract.stakes(staker.address, 1)

            expect(stakeInfo.startTime).to.be.equal(0)
            expect(stakeInfo.timePoint).to.be.equal(0)
            expect(stakeInfo.amount).to.be.equal(0)
            expect(stakeInfo.totalProfit).to.be.equal(0)

            const firstProfit = defaultStakeAmount.mul(oneDay * 10).mul(defaultRate).div(oneDay * 365).div(10 ** (defaultDecimal + 2))
            const lastProfit = defaultStakeAmount.mul(2).mul(oneDay * 30).mul(defaultRate).div(oneDay * 365).div(10 ** (defaultDecimal + 2));
            const totalProfit = firstProfit.add(lastProfit)
            await expect(unstakeTx).to.be.emit(stakingContract, "StakeReleased").withArgs(staker.address, 1, defaultStakeAmount.mul(2), totalProfit)
            expect(await goldContract.balanceOf(staker.address)).to.be.equal(defaultTokenAmountOfStaker.add(totalProfit))
            expect(await stakingReserveContract.getBalanceOfReserve()).to.be.equal(stakingReserveBalance.sub(totalProfit))
        })
    })
})