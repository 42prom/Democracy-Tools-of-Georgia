/**
 * Wallet Routes - DTG Token transfers and balance checking
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { BlockchainService } from '../services/blockchain';
import { pool } from '../db/client';

const router = Router();

// All wallet routes require authentication
router.use(requireCredential);

/**
 * GET /api/v1/wallet/balance
 * Get user's DTG token balance
 */
router.get('/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credential = (req as any).credential;

    if (!credential?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credential',
      });
    }

    // Look up user's wallet address from database
    const userResult = await pool.query(
      'SELECT wallet_address FROM users WHERE device_key_thumbprint = $1',
      [credential.sub]
    );

    const walletAddress = userResult.rows[0]?.wallet_address;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'No wallet address associated with this profile',
        balance: '0',
      });
    }

    const result = await BlockchainService.getDTGBalance(walletAddress);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
        balance: '0',
      });
    }

    return res.json({
      success: true,
      balance: result.balance,
      symbol: 'DTG',
      walletAddress: walletAddress,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/wallet/balance/:address
 * Get DTG balance for any address (public lookup)
 */
router.get('/balance/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = req.params.address as string;

    // Validate address format
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
      });
    }

    const result = await BlockchainService.getDTGBalance(address);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
        balance: '0',
      });
    }

    return res.json({
      success: true,
      balance: result.balance,
      symbol: 'DTG',
      walletAddress: address,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/wallet/transfer
 * Transfer DTG tokens to another address
 * Note: This uses the SERVER wallet to send tokens, not user's own wallet
 * For real P2P transfers, users would sign transactions on their own devices
 */
router.post('/transfer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credential = (req as any).credential;
    const { toAddress, amount } = req.body;

    // Validate inputs
    if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient wallet address',
      });
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
    }

    // For now, this transfers from the server's wallet (reward distribution)
    // In production, you'd want users to sign their own transactions
    const result = await BlockchainService.transferDTG(toAddress, amount);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Transfer failed',
      });
    }

    // Log the transfer
    await pool.query(
      `INSERT INTO wallet_transactions (from_address, to_address, amount, tx_hash, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      ['server', toAddress, amount, result.txHash, credential?.sub]
    ).catch(() => {
      // Table might not exist yet, that's ok
      console.log('[Wallet] Transaction log table not found, skipping log');
    });

    return res.json({
      success: true,
      txHash: result.txHash,
      amount,
      toAddress,
      explorerUrl: `https://sepolia.etherscan.io/tx/${result.txHash}`,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/wallet/mint
 * Mint DTG tokens to a user (admin/reward distribution)
 */
router.post('/mint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { toAddress, amount } = req.body;

    // Validate inputs
    if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address',
      });
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
    }

    const result = await BlockchainService.mintDTG(toAddress, amount);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Mint failed',
      });
    }

    return res.json({
      success: true,
      txHash: result.txHash,
      amount,
      toAddress,
      explorerUrl: `https://sepolia.etherscan.io/tx/${result.txHash}`,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/wallet/config
 * Get blockchain configuration (for mobile app)
 */
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await BlockchainService.loadConfig();

    return res.json({
      success: true,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      dtgTokenAddress: config.dtgTokenAddress,
      dtgSymbol: 'DTG',
      dtgDecimals: 18,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
