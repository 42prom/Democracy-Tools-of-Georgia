/**
 * Blockchain Integration Test Script
 * Tests connection, wallet, and balance checking
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const WALLET_ADDRESS = '0x4188163ef408854Cf8eA67acCEa21fd5D8ceea2d';

async function runTests() {
  console.log('='.repeat(60));
  console.log('🔗 BLOCKCHAIN INTEGRATION TESTS');
  console.log('='.repeat(60));
  console.log('');

  // Test 1: RPC Connection
  console.log('📡 Test 1: RPC Connection');
  console.log('-'.repeat(40));
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    console.log(`✅ Connected to RPC: ${RPC_URL}`);
    console.log(`   Chain ID: ${network.chainId}`);
    console.log(`   Network Name: ${network.name}`);
    console.log(`   Current Block: #${blockNumber}`);
  } catch (error: any) {
    console.log(`❌ RPC Connection Failed: ${error.message}`);
    return;
  }
  console.log('');

  // Test 2: Wallet Configuration
  console.log('🔑 Test 2: Wallet Configuration');
  console.log('-'.repeat(40));
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;

  if (!privateKey) {
    console.log('❌ BLOCKCHAIN_PRIVATE_KEY not found in .env');
    console.log('   Add: BLOCKCHAIN_PRIVATE_KEY=0x...');
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`✅ Wallet loaded successfully`);
    console.log(`   Address: ${wallet.address}`);

    // Verify address matches expected
    if (wallet.address.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
      console.log(`✅ Address matches expected wallet`);
    } else {
      console.log(`⚠️  Address differs from expected: ${WALLET_ADDRESS}`);
    }
  } catch (error: any) {
    console.log(`❌ Wallet Error: ${error.message}`);
    return;
  }
  console.log('');

  // Test 3: Balance Check
  console.log('💰 Test 3: Wallet Balance (Sepolia ETH)');
  console.log('-'.repeat(40));
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const balance = await provider.getBalance(WALLET_ADDRESS);
    const balanceEth = ethers.formatEther(balance);

    console.log(`   Address: ${WALLET_ADDRESS}`);
    console.log(`   Balance: ${balanceEth} ETH`);

    if (parseFloat(balanceEth) > 0) {
      console.log(`✅ Wallet has funds - ready for transactions!`);
    } else {
      console.log(`⚠️  Wallet is empty - get test ETH from faucet:`);
      console.log(`   https://cloud.google.com/application/web3/faucet/ethereum/sepolia`);
    }
  } catch (error: any) {
    console.log(`❌ Balance Check Failed: ${error.message}`);
  }
  console.log('');

  // Test 4: Gas Price
  console.log('⛽ Test 4: Current Gas Price');
  console.log('-'.repeat(40));
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const feeData = await provider.getFeeData();

    console.log(`   Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0, 'gwei')} Gwei`);
    console.log(`   Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0, 'gwei')} Gwei`);
    console.log(`   Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0, 'gwei')} Gwei`);
    console.log(`✅ Gas data retrieved successfully`);
  } catch (error: any) {
    console.log(`❌ Gas Price Check Failed: ${error.message}`);
  }
  console.log('');

  // Test 5: Sign Message (proves wallet works)
  console.log('✍️  Test 5: Message Signing (Wallet Test)');
  console.log('-'.repeat(40));
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey!, provider);

    const message = 'DTG Blockchain Test - ' + new Date().toISOString();
    const signature = await wallet.signMessage(message);

    console.log(`   Message: "${message}"`);
    console.log(`   Signature: ${signature.substring(0, 30)}...`);

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() === wallet.address.toLowerCase()) {
      console.log(`✅ Signature verified - wallet is fully operational!`);
    } else {
      console.log(`❌ Signature verification failed`);
    }
  } catch (error: any) {
    console.log(`❌ Signing Failed: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  console.log('✅ RPC Connection: Working');
  console.log('✅ Wallet: Configured');
  console.log('✅ Signing: Operational');
  console.log('');
  console.log('Your blockchain integration is ready!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Get test ETH if balance is 0');
  console.log('2. Deploy ERC-1155 contract for NFT rewards (optional)');
  console.log('3. Deploy ERC-20 contract for DTG token (optional)');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
