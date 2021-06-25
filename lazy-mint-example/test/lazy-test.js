const { expect } = require("chai");
const { ethers } = require("hardhat");
const { LazyMinter } = require('../lib')

async function deploy() {
  const [minter, redeemer, _] = await ethers.getSigners()

  let factory = await ethers.getContractFactory("LazyNFT", minter)
  const contract = await factory.deploy(minter.address)

  // the redeemer 
  const redeemerFactory = factory.connect(redeemer)
  const redeemerContract = redeemerFactory.attach(contract.address)

  return {
    minter,
    redeemer,
    contract,
    redeemerContract,
  }
}

describe("LazyNFT", function() {
  it("Should deploy", async function() {
    const signers = await ethers.getSigners();
    const minter = signers[0].address;

    const LazyNFT = await ethers.getContractFactory("LazyNFT");
    const lazynft = await LazyNFT.deploy(minter);
    await lazynft.deployed();

  });

  it("Should redeem an NFT from a signed voucher", async function() {
    const { contract, redeemerContract, redeemer, minter } = await deploy()

    const lazyMinter = new LazyMinter({ contractAddress: contract.address, signer: minter })
    const { voucher, signature } = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(redeemerContract.redeem(redeemer.address, voucher, signature))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId);
  });

  it("Should fail to redeem an NFT that's already been claimed", async function() {
    const { contract, redeemerContract, redeemer, minter } = await deploy()

    const lazyMinter = new LazyMinter({ contractAddress: contract.address, signer: minter })
    const { voucher, signature } = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(redeemerContract.redeem(redeemer.address, voucher, signature))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId);

    await expect(redeemerContract.redeem(redeemer.address, voucher, signature))
      .to.be.revertedWith('ERC721: token already minted')
  });

  it("Should redeem if payment is >= minPrice", async function() {
    const { contract, redeemerContract, redeemer, minter } = await deploy()

    const lazyMinter = new LazyMinter({ contractAddress: contract.address, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const { voucher, signature } = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    await expect(redeemerContract.redeem(redeemer.address, voucher, signature, { value: minPrice }))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId)
  })

  it("Should make payments available to minter for withdrawal", async function() {
    const { contract, redeemerContract, redeemer, minter } = await deploy()

    const lazyMinter = new LazyMinter({ contractAddress: contract.address, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const { voucher, signature } = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)
    
    await expect(await redeemerContract.redeem(redeemer.address, voucher, signature, { value: minPrice }))
      .to.changeEtherBalances([redeemer, contract], [minPrice.mul(-1), minPrice]) // the payment should be sent to the contract address

    expect(await contract.availableToWithdraw()).to.equal(minPrice)

    await expect(await contract.withdraw())
      .to.changeEtherBalance(minter, minPrice)
  })

  it("Should fail to redeem if payment is < minPrice", async function() {
    const { contract, redeemerContract, redeemer, minter } = await deploy()

    const lazyMinter = new LazyMinter({ contractAddress: contract.address, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const { voucher, signature } = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    const payment = minPrice.sub(10000)
    await expect(redeemerContract.redeem(redeemer.address, voucher, signature, { value: payment }))
      .to.be.revertedWith('Insufficient funds to redeem')
  })
});