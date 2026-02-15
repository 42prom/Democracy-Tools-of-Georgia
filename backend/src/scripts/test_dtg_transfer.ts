/**
 * Test DTG Token Transfer
 * Tests transferring DTG tokens to another address
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const DTG_TOKEN_ADDRESS = '0x418B7d64e99FE1DD3B042d30E39581D0DcE8d479'; // Deployed contract

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

async function testTransfer() {
  console.log('='.repeat(60));
  console.log('DTG TOKEN TRANSFER TEST');
  console.log('='.repeat(60));

  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error('BLOCKCHAIN_PRIVATE_KEY not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(DTG_TOKEN_ADDRESS, ERC20_ABI, wallet);

  // Get token info
  const name = await contract.name();
  const symbol = await contract.symbol();
  console.log(`\nToken: ${name} (${symbol})`);
  console.log(`Contract: ${DTG_TOKEN_ADDRESS}`);

  // Check sender balance
  const senderBalance = await contract.balanceOf(wallet.address);
  console.log(`\nSender: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(senderBalance)} DTG`);

  // Create a test recipient address (random)
  const testRecipient = ethers.Wallet.createRandom().address;
  console.log(`\nTest Recipient: ${testRecipient}`);

  // Check recipient balance before
  const recipientBalanceBefore = await contract.balanceOf(testRecipient);
  console.log(`Recipient Balance Before: ${ethers.formatEther(recipientBalanceBefore)} DTG`);

  // Transfer 10 DTG
  const amount = '10';
  console.log(`\nTransferring ${amount} DTG...`);

  try {
    const tx = await contract.transfer(testRecipient, ethers.parseEther(amount));
    console.log(`Transaction: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`Confirmed in block ${receipt?.blockNumber}`);

    // Check balances after
    const senderBalanceAfter = await contract.balanceOf(wallet.address);
    const recipientBalanceAfter = await contract.balanceOf(testRecipient);

    console.log('\n' + '='.repeat(60));
    console.log('TRANSFER SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`Sender Balance: ${ethers.formatEther(senderBalanceAfter)} DTG`);
    console.log(`Recipient Balance: ${ethers.formatEther(recipientBalanceAfter)} DTG`);
    console.log(`\nView on Etherscan:`);
    console.log(`https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('Transfer failed:', error.message);
    process.exit(1);
  }
}

testTransfer();
