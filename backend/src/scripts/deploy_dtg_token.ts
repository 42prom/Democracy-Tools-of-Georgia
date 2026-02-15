/**
 * Deploy DTG ERC-20 Token using solc compiler
 */

import { ethers } from 'ethers';
import * as solc from 'solc';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Solidity source code for DTG Token
const SOURCE_CODE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DTGToken {
    string public name = "DTG Token";
    string public symbol = "DTG";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
        uint256 initialSupply = 1000000 * 10**18; // 1 million tokens
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) public {
        require(msg.sender == owner, "Only owner can mint");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
`;

function compileSolidity() {
  const input = {
    language: 'Solidity',
    sources: {
      'DTGToken.sol': {
        content: SOURCE_CODE,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach((e: any) => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts['DTGToken.sol']['DTGToken'];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

async function deploy() {
  console.log('='.repeat(60));
  console.log('DTG TOKEN DEPLOYMENT');
  console.log('='.repeat(60));

  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error('BLOCKCHAIN_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Compile
  console.log('\nCompiling Solidity...');
  const { abi, bytecode } = compileSolidity();
  console.log('Compilation successful!');

  // Connect
  console.log('\nConnecting to Sepolia...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (parseFloat(ethers.formatEther(balance)) < 0.01) {
    console.error('Insufficient balance (need 0.01+ ETH)');
    process.exit(1);
  }

  // Deploy
  console.log('\nDeploying contract...');
  const factory = new ethers.ContractFactory(abi, '0x' + bytecode, wallet);

  try {
    const contract = (await factory.deploy({
      gasLimit: 2000000,
    })) as any;

    console.log(`Transaction: ${contract.deploymentTransaction()?.hash}`);
    console.log('Waiting for confirmation (this may take 15-30 seconds)...');

    await contract.waitForDeployment();
    const address = await contract.getAddress();

    // Verify
    const name = await contract.name();
    const symbol = await contract.symbol();
    const totalSupply = await contract.totalSupply();
    const ownerBalance = await contract.balanceOf(wallet.address);

    console.log('\n' + '='.repeat(60));
    console.log('DEPLOYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`Contract Address: ${address}`);
    console.log(`Token Name: ${name}`);
    console.log(`Token Symbol: ${symbol}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} DTG`);
    console.log(`Your Balance: ${ethers.formatEther(ownerBalance)} DTG`);
    console.log('');
    console.log(`View on Etherscan:`);
    console.log(`https://sepolia.etherscan.io/address/${address}`);
    console.log('');
    console.log('Next: Add this address to Admin > Blockchain > DTG Token Address');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\nDeployment failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

deploy();
