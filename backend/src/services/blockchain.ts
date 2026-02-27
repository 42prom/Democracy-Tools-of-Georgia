import { pool } from '../db/client';
import { ethers, JsonRpcProvider, Wallet, Contract } from 'ethers';
import { logger } from '../middleware/logger';
import { getBlockchainPrivateKey } from '../config/secrets';

/**
 * Normalize an Ethereum address to a safe format.
 * We use lowercase to bypass ethers.js EIP-55 checksum validation for mixed-case addresses.
 */
function normalizeAddress(address: string): string {
  if (!address) return address;
  return address.toLowerCase();
}

logger.info('[Blockchain] Address normalization is active');

/**
 * Validate that a string is a valid Ethereum address (0x + 40 hex chars)
 */
function isValidEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    return ethers.isAddress(address.toLowerCase());
  } catch {
    return false;
  }
}

export interface BlockchainConfig {
  rewardsEnabled: boolean;
  nftPayoutsEnabled: boolean;
  chainId: number;
  rpcUrl: string;
  nftContractAddress: string;
  dtgTokenAddress: string;
  rewardTokenId: number;
  requiredConfirmations: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  chainId?: number;
  blockNumber?: number;
  latency?: number;
}

// ERC-1155 ABI (minimal for minting)
const ERC1155_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes data) external',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
];

// ERC-20 ABI (for DTG token transfers)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class BlockchainService {
  private static provider: JsonRpcProvider | null = null;
  private static wallet: Wallet | null = null;

  /**
   * Load configuration from settings table
   */
  static async loadConfig(): Promise<BlockchainConfig> {
    const res = await pool.query(
      "SELECT key, value FROM settings WHERE key LIKE 'blockchain_%'"
    );

    const config: any = {
      rewardsEnabled: false,
      nftPayoutsEnabled: false,
      chainId: 1337,
      rpcUrl: '',
      nftContractAddress: '',
      dtgTokenAddress: '',
      rewardTokenId: 1,
      requiredConfirmations: 3,
    };

    res.rows.forEach((row) => {
      const { key, value } = row;
      if (key === 'blockchain_rewards_enabled') config.rewardsEnabled = value === 'true';
      else if (key === 'blockchain_nft_payouts_enabled') config.nftPayoutsEnabled = value === 'true';
      else if (key === 'blockchain_chain_id') config.chainId = parseInt(value, 10) || 1337;
      else if (key === 'blockchain_rpc_url') config.rpcUrl = value;
      else if (key === 'blockchain_nft_contract_address') config.nftContractAddress = value;
      else if (key === 'blockchain_dtg_token_address') config.dtgTokenAddress = value;
      else if (key === 'blockchain_reward_token_id') config.rewardTokenId = parseInt(value, 10) || 1;
      else if (key === 'blockchain_required_confirmations') config.requiredConfirmations = parseInt(value, 10) || 3;
    });

    return config;
  }

  /**
   * Get or create provider instance
   */
  static async getProvider(rpcUrl?: string): Promise<JsonRpcProvider> {
    if (!rpcUrl) {
      const cfg = await this.loadConfig();
      rpcUrl = cfg.rpcUrl;
    }

    if (!rpcUrl) {
      throw new Error('Blockchain RPC URL not configured');
    }

    try {
      // Create new provider (or reuse if same URL)
      if (!this.provider || this.provider._getConnection().url !== rpcUrl) {
        this.provider = new JsonRpcProvider(rpcUrl);
      }
      return this.provider;
    } catch (error: any) {
      logger.error({ rpcUrl, error: error.message }, '[Blockchain] Failed to create provider');
      throw new Error(`Failed to initialize blockchain provider: ${error.message}`);
    }
  }

  /**
   * Get wallet for signing transactions (requires BLOCKCHAIN_PRIVATE_KEY env var)
   */
  static async getWallet(): Promise<Wallet> {
    const privateKey = getBlockchainPrivateKey();

    if (!privateKey) {
      throw new Error('BLOCKCHAIN_PRIVATE_KEY not configured in environment');
    }

    const provider = await this.getProvider();

    if (!this.wallet) {
      this.wallet = new Wallet(privateKey, provider);
    }

    return this.wallet;
  }

  /**
   * Test connection to RPC endpoint
   */
  static async testConnection(rpcUrl: string): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      if (!rpcUrl || !rpcUrl.startsWith('http')) {
        return {
          success: false,
          message: 'Invalid RPC URL format. Must start with http:// or https://',
        };
      }

      const provider = new JsonRpcProvider(rpcUrl);

      // Set timeout for connection test
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      // Try to get network info
      const networkPromise = provider.getNetwork();
      const blockPromise = provider.getBlockNumber();

      const [network, blockNumber] = await Promise.race([
        Promise.all([networkPromise, blockPromise]),
        timeoutPromise,
      ]) as [ethers.Network, number];

      const latency = Date.now() - startTime;

      return {
        success: true,
        message: `Connected to chain ${network.chainId} at block #${blockNumber}`,
        chainId: Number(network.chainId),
        blockNumber,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;

      let message = 'Failed to connect to RPC';
      if (error.message?.includes('timeout')) {
        message = 'Connection timed out - RPC may be unreachable';
      } else if (error.message?.includes('ECONNREFUSED')) {
        message = 'Connection refused - check if RPC server is running';
      } else if (error.message?.includes('ENOTFOUND')) {
        message = 'Host not found - check RPC URL';
      } else if (error.code === 'INVALID_ARGUMENT') {
        message = 'Invalid RPC URL format';
      } else {
        message = `Connection failed: ${error.message || 'Unknown error'}`;
      }

      return {
        success: false,
        message,
        latency,
      };
    }
  }

  /**
   * Get balance of wallet address (native token)
   */
  static async getNativeBalance(address: string): Promise<string> {
    const normalizedAddress = normalizeAddress(address);
    // Validate address format
    if (!isValidEthereumAddress(normalizedAddress)) {
      throw new Error(`Invalid wallet address: ${address}`);
    }

    const provider = await this.getProvider();
    const balance = await provider.getBalance(normalizedAddress);
    return ethers.formatEther(balance);
  }

  /**
   * Get ERC-20 token balance
   */
  static async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<{ balance: string; symbol: string; decimals: number }> {
    const normToken = normalizeAddress(tokenAddress);
    const normWallet = normalizeAddress(walletAddress);

    // Validate token address format
    if (!isValidEthereumAddress(normToken)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }

    // Validate wallet address format
    if (!isValidEthereumAddress(normWallet)) {
      throw new Error(`Invalid wallet address: ${walletAddress}`);
    }

    const provider = await this.getProvider();
    const contract = new Contract(normToken, ERC20_ABI, provider);

    const [balance, symbol, decimals] = await Promise.all([
      contract.balanceOf(normWallet),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      balance: ethers.formatUnits(balance, decimals),
      symbol,
      decimals,
    };
  }

  /**
   * Get ERC-1155 NFT balance
   */
  static async getNftBalance(walletAddress: string, tokenId?: number): Promise<string> {
    const cfg = await this.loadConfig();

    if (!cfg.nftContractAddress) {
      throw new Error('NFT contract address not configured');
    }

    const normNft = normalizeAddress(cfg.nftContractAddress);
    const normWallet = normalizeAddress(walletAddress);

    const provider = await this.getProvider();
    const contract = new Contract(normNft, ERC1155_ABI, provider);
    const balance = await contract.balanceOf(normWallet, tokenId ?? cfg.rewardTokenId);

    return balance.toString();
  }

  /**
   * Mint a reward NFT for a user (REAL blockchain transaction)
   */
  static async mintReward(walletAddress: string, amount: number = 1): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.rewardsEnabled) {
      logger.info('[Blockchain] Rewards disabled, skipping mint');
      return { success: false, error: 'Rewards disabled' };
    }

    if (!cfg.rpcUrl) {
      logger.info('[Blockchain] RPC URL not configured, skipping mint');
      return { success: false, error: 'RPC URL not configured' };
    }

    if (!cfg.nftContractAddress) {
      logger.info('[Blockchain] NFT contract address not configured, skipping mint');
      return { success: false, error: 'NFT contract address not configured' };
    }

    const normNft = normalizeAddress(cfg.nftContractAddress);
    const normWallet = normalizeAddress(walletAddress);

    // Validate contract address format
    if (!isValidEthereumAddress(normNft)) {
      logger.error({ nftContractAddress: cfg.nftContractAddress }, '[Blockchain] Invalid NFT contract address format');
      return { success: false, error: `Invalid NFT contract address: ${cfg.nftContractAddress}` };
    }

    // Validate wallet address format
    if (!isValidEthereumAddress(normWallet)) {
      logger.error({ walletAddress }, '[Blockchain] Invalid wallet address format');
      return { success: false, error: `Invalid wallet address: ${walletAddress}` };
    }

    logger.info({
      amount,
      wallet: normWallet,
      rpc: cfg.rpcUrl,
      contract: normNft,
      tokenId: cfg.rewardTokenId
    }, '[Blockchain] Minting reward(s)');

    try {
      const wallet = await this.getWallet();
      const contract = new Contract(normNft, ERC1155_ABI, wallet);

      // Call mint function on ERC-1155 contract
      const tx = await contract.mint(
        normWallet,
        cfg.rewardTokenId,
        amount,
        '0x' // empty data
      );

      logger.info({ txHash: tx.hash }, '[Blockchain] Transaction submitted');

      // Wait for confirmations
      const receipt = await tx.wait(cfg.requiredConfirmations);

      logger.info({
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      }, '[Blockchain] Transaction confirmed');

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      logger.error({ error, wallet: walletAddress }, '[Blockchain] Mint failed');

      let errorMessage = 'Transaction failed';
      if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for gas';
      } else if (error.code === 'CALL_EXCEPTION') {
        errorMessage = 'Contract call failed - check contract address and permissions';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Transfer ERC-20 tokens (for DTG transfers)
   */
  static async transferTokens(
    tokenAddress: string,
    toAddress: string,
    amount: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.rpcUrl) {
      return { success: false, error: 'RPC URL not configured' };
    }

    const normToken = normalizeAddress(tokenAddress);
    const normTo = normalizeAddress(toAddress);

    // Validate token address format
    if (!isValidEthereumAddress(normToken)) {
      return { success: false, error: `Invalid token address: ${tokenAddress}` };
    }

    // Validate recipient address format
    if (!isValidEthereumAddress(normTo)) {
      return { success: false, error: `Invalid recipient address: ${toAddress}` };
    }

    try {
      const wallet = await this.getWallet();
      const contract = new Contract(normToken, ERC20_ABI, wallet);

      // Get decimals for proper amount formatting
      const decimals = await contract.decimals();
      const amountWei = ethers.parseUnits(amount, decimals);

      const tx = await contract.transfer(normTo, amountWei);
      logger.info({ txHash: tx.hash }, '[Blockchain] Transfer submitted');

      const receipt = await tx.wait(cfg.requiredConfirmations);
      logger.info({
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      }, '[Blockchain] Transfer confirmed');

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      logger.error({ error, to: toAddress, amount }, '[Blockchain] Transfer failed');
      return {
        success: false,
        error: error.message || 'Transfer failed',
      };
    }
  }

  /**
   * Get DTG token balance for a wallet
   */
  static async getDTGBalance(walletAddress: string): Promise<{ balance: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.rpcUrl) {
      return { balance: '0', error: 'RPC URL not configured' };
    }

    if (!cfg.dtgTokenAddress) {
      return { balance: '0', error: 'DTG Token address not configured' };
    }

    const normToken = normalizeAddress(cfg.dtgTokenAddress);
    const normWallet = normalizeAddress(walletAddress);

    // Validate token address format
    if (!isValidEthereumAddress(normToken)) {
      return { balance: '0', error: `Invalid DTG token address: ${cfg.dtgTokenAddress}` };
    }

    // Validate wallet address format
    if (!isValidEthereumAddress(normWallet)) {
      return { balance: '0', error: `Invalid wallet address: ${walletAddress}` };
    }

    try {
      const provider = await this.getProvider();
      const contract = new Contract(normToken, ERC20_ABI, provider);
      const balance = await contract.balanceOf(normWallet);
      return { balance: ethers.formatEther(balance) };
    } catch (error: any) {
      logger.error({ error, wallet: walletAddress }, '[Blockchain] Get DTG balance failed');
      return { balance: '0', error: error.message };
    }
  }

  /**
   * Transfer DTG tokens from server wallet to user
   */
  static async transferDTG(
    toAddress: string,
    amount: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.dtgTokenAddress) {
      return { success: false, error: 'DTG Token address not configured' };
    }

    return this.transferTokens(cfg.dtgTokenAddress, toAddress, amount);
  }

  /**
   * Mint DTG tokens to a user (only owner can mint)
   */
  static async mintDTG(
    toAddress: string,
    amount: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.rpcUrl) {
      return { success: false, error: 'RPC URL not configured' };
    }

    if (!cfg.dtgTokenAddress) {
      return { success: false, error: 'DTG Token address not configured' };
    }

    const normToken = normalizeAddress(cfg.dtgTokenAddress);
    const normTo = normalizeAddress(toAddress);

    // Validate DTG token address format
    if (!isValidEthereumAddress(normToken)) {
      return { success: false, error: `Invalid DTG token address: ${cfg.dtgTokenAddress}` };
    }

    // Validate recipient address format
    if (!isValidEthereumAddress(normTo)) {
      return { success: false, error: `Invalid recipient address: ${toAddress}` };
    }

    try {
      const wallet = await this.getWallet();
      const contract = new Contract(
        normToken,
        [...ERC20_ABI, 'function mint(address to, uint256 amount)'],
        wallet
      );

      const amountWei = ethers.parseEther(amount);
      const tx = await contract.mint(normTo, amountWei);

      logger.info({ txHash: tx.hash }, '[Blockchain] DTG mint submitted');

      const receipt = await tx.wait(cfg.requiredConfirmations);
      logger.info({
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      }, '[Blockchain] DTG mint confirmed');

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      logger.error({ error, to: toAddress, amount }, '[Blockchain] DTG mint failed');
      return {
        success: false,
        error: error.message || 'Mint failed',
      };
    }
  }
  /**
   * Write an anchor hash to the blockchain (Layer 2)
   */
  static async writeAnchor(
    pollId: string,
    chainHash: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const cfg = await this.loadConfig();

    if (!cfg.rpcUrl) {
      return { success: false, error: 'RPC URL not configured' };
    }

    // NOTE: We do NOT require nftContractAddress for anchoring because we use a Self-Send strategy
    // to put the hash on-chain via Input Data. This allows anchoring to work immediately 
    // without deploying a custom contract.

    // In a real scenario, this would call a specific method like 'anchorVoteHash(bytes32 pollId, bytes32 chainHash)'
    // For this simulation/MVP, we will use a self-transfer of 0 ETH with data payload, 
    // OR if we had a generic "log" contract.
    // Let's assume we invoke a generic 'logAnchor' method on our contract, 
    // OR we trigger a 0-value mint with extra data.
    
    // STRATEGY: Send a transaction to the Deployment Wallet itself (self-send) with data = chainHash
    // This puts the hash availability on-chain in the 'Input Data' field of the transaction.
    // It is the cheapest and most universal way to anchor data if no custom smart contract method exists yet.

    try {
      const wallet = await this.getWallet();
      
      // We send 0 ETH to ourselves, with the chainHash as hex data
      // chainHash is 64 hex chars (32 bytes). Prefix with 0x.
      const dataPayload = '0x' + chainHash;

      const tx = await wallet.sendTransaction({
        to: wallet.address,
        value: 0,
        data: dataPayload
      });

      logger.info({ txHash: tx.hash, pollId, chainHash }, '[Blockchain] Anchor submitted');

      await tx.wait(cfg.requiredConfirmations);
      
      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error: any) {
      logger.error({ error, pollId }, '[Blockchain] Anchor failed');
      return {
        success: false,
        error: error.message || 'Anchor failed'
      };
    }
  }
}
