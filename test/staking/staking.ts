import { expect } from "chai";
import { ethers } from "hardhat";
import { Gold, Staking, StakingReserve } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Staking", function () {
    let admin: SignerWithAddress
    let staker: SignerWithAddress

    let goldContract: Gold
    let stakingReserveContract: StakingReserve
    let stakingContract: Staking
    let day = 86400
    let defaultMinStaking = ethers.utils.parseEther("100")
    let defaultStakeAmount = ethers.utils.parseEther("500")
    let decimal = 0
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

        await goldContract.transfer(staker.address, ethers.utils.parseEther("200"))
    })
    // describe("Add stake package", function () {
    //     it("should revert if rate <= 0", async function () {
    //         await expect(stakingContract.addStakePackage(0, decimal, defaultMinStaking, 30 * day)).to.be.revertedWith("Invalid package rate")
    //     })
    //     it("should revert if min staking <= 0", async function () {
    //         await expect(stakingContract.addStakePackage(3, decimal, 0, 30 * day)).to.be.revertedWith("Invalid min staking")
    //     })
    //     it("should revert if lock time <= 0", async function () {
    //         await expect(stakingContract.addStakePackage(3, decimal, defaultMinStaking, 0 * day)).to.be.revertedWith("Invalid lock time")
    //     })
    //     it("should add stake package correctly", async function () {
    //         await stakingContract.addStakePackage(3, 0, defaultMinStaking, 30 * day)
    //         const stakePackage = await stakingContract.stakePackages(1)
    //         expect(stakePackage.rate).to.be.equal(3)
    //         expect(stakePackage.decimal).to.be.equal(0)
    //         expect(stakePackage.minStaking).to.be.equal(defaultMinStaking)
    //         expect(stakePackage.lockTime).to.be.equal(30 * day)
    //         expect(stakePackage.isOffline).to.be.equal(false)
    //     });
    // })
    // describe("Remove stake package", function () {
    //     beforeEach(async () => {
    //         await stakingContract.addStakePackage(3, 0, defaultMinStaking, 30 * day)
    //     })
    //     it("should revert if package not exists", async function () {
    //         await expect(stakingContract.removeStakePackage(2)).to.be.revertedWith("Invalid package ID")
    //     })
    //     it("should remove stake package correctly", async function () {
    //         await stakingContract.removeStakePackage(1)
    //         const stakePackage = await stakingContract.stakePackages(1)
    //         expect(stakePackage.isOffline).to.be.equal(true)
    //     })
    //     it("should revert if package is already remove", async function () {
    //         await stakingContract.removeStakePackage(1)
    //         await expect(stakingContract.removeStakePackage(1)).to.be.revertedWith("This stake package is already remove")
    //     })
    // })
    describe("Stake", function () {
        beforeEach(async () => {
            await stakingContract.addStakePackage(3, 0, defaultMinStaking, 30 * day)
        })
        it("should revert if package not exists", async function () {
            await expect(stakingContract.stake(defaultStakeAmount, 2)).to.be.revertedWith("Invalid package ID")
        })
        it("should revert if package is already remove", async function () {
            await stakingContract.removeStakePackage(1)
            await expect(stakingContract.stake(defaultStakeAmount, 1)).to.be.revertedWith("Package is offline")
        })
        it("should revert if sender is null address", async function () {
            await expect(stakingContract.connect(nullAdress).stake(defaultStakeAmount, 1)).to.be.revertedWith("Sender must not be zero address")
        })
    })
})