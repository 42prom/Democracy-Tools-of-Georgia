import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import { pool } from '../db/client';
import { createError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/v1/rewards/balance
 * Get total reward balance for the authenticated user (device)
 */
router.get(
  '/balance',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const deviceKeyHash = req.credential.sub;

      const result = await pool.query(
        `SELECT token_symbol, SUM(amount) as total
         FROM user_rewards
         WHERE device_key_hash = $1
         GROUP BY token_symbol`,
        [deviceKeyHash]
      );

      // Return array of balances (multi-token support)
      // For MVP, likely just one item
      res.json({
        balances: result.rows.map(row => ({
          token: row.token_symbol,
          amount: parseFloat(row.total)
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/rewards/send
 * Transfer tokens from user's reward balance to another address
 */
router.post(
  '/send',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const { toAddress, amount } = req.body;
      const deviceKeyHash = req.credential.sub;

      // Validate inputs
      if (!toAddress || typeof toAddress !== 'string') {
        throw createError('Invalid recipient address', 400);
      }

      const transferAmount = parseFloat(amount);
      if (isNaN(transferAmount) || transferAmount <= 0) {
        throw createError('Invalid amount', 400);
      }

      // Start a transaction for the transfer
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Get current balance (within transaction)
        const balanceResult = await client.query(
          `SELECT COALESCE(SUM(amount), 0) as balance
           FROM user_rewards
           WHERE device_key_hash = $1 AND token_symbol = 'DTG'`,
          [deviceKeyHash]
        );

        const currentBalance = parseFloat(balanceResult.rows[0]?.balance || '0');

        if (currentBalance < transferAmount) {
          throw createError(
            `Insufficient balance. Available: ${currentBalance.toFixed(2)} DTG`,
            400
          );
        }

        const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 2. Record the outgoing transfer (debit sender)
        // Mark as 'processed' immediately as it's an internal movement
        await client.query(
          `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, tx_id, transfer_to, status)
           VALUES ($1, NULL, $2, 'DTG', $3, $4, 'processed')`,
          [deviceKeyHash, -transferAmount, txId, toAddress]
        );

        // 3. Look up recipient and credit if they exist
        const recipientResult = await client.query(
          'SELECT id FROM users WHERE wallet_address = $1',
          [toAddress]
        );

        const recipientId = recipientResult.rows[0]?.id;
        if (recipientId) {
          // Internal transfer - credit recipient
          // Status 'pending' allows RewardProcessor to pay it out to their wallet
          await client.query(
            `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, tx_id, transfer_to, status)
             VALUES ($1, NULL, $2, 'DTG', $3, $4, 'pending')`,
            [recipientId, transferAmount, txId, null]
          );
          console.log(`[Rewards] Internal transfer: Credited ${transferAmount} DTG to user ${recipientId} (pending payout)`);
        } else {
          console.log(`[Rewards] External transfer: ${transferAmount} DTG recorded as withdrawal to ${toAddress}`);
        }

        await client.query('COMMIT');

        // Get new balance for the sender
        const newBalanceResult = await client.query(
          `SELECT COALESCE(SUM(amount), 0) as balance
           FROM user_rewards
           WHERE device_key_hash = $1 AND token_symbol = 'DTG'`,
          [deviceKeyHash]
        );

        const newBalance = parseFloat(newBalanceResult.rows[0]?.balance || '0');

        console.log(`[Rewards] User ${deviceKeyHash.substring(0, 8)}... sent ${transferAmount} DTG to ${toAddress}`);

        res.json({
          success: true,
          txId,
          amount: transferAmount,
          toAddress,
          newBalance,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/rewards/transactions
 * Get all transactions (earnings and transfers)
 */
router.get(
  '/transactions',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const deviceKeyHash = req.credential.sub;

      const result = await pool.query(
        `SELECT r.id, r.poll_id, r.amount, r.token_symbol, r.created_at, r.tx_id, r.transfer_to,
                p.title
         FROM user_rewards r
         LEFT JOIN polls p ON r.poll_id = p.id
         WHERE r.device_key_hash = $1
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [deviceKeyHash]
      );

      const transactions = result.rows.map(row => ({
        id: row.tx_id || row.id,
        type: row.amount >= 0 ? 'receive' : 'send',
        amount: Math.abs(row.amount).toFixed(2),
        token: row.token_symbol,
        // For receives, show poll title; for sends, show recipient address
        address: row.amount >= 0 
          ? (row.title || 'Received Transfer') 
          : row.transfer_to,
        timestamp: row.created_at,
        status: 'confirmed',
      }));

      res.json({ transactions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/rewards/history
 * Get reward history
 */
router.get(
  '/history',
  requireCredential,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.credential) {
        throw createError('Credential missing', 401);
      }

      const deviceKeyHash = req.credential.sub;

      const result = await pool.query(
        `SELECT r.poll_id, r.amount, r.token_symbol, r.created_at as voted_at,
                p.title, p.type, p.end_at, p.status
         FROM user_rewards r
         JOIN polls p ON r.poll_id = p.id
         WHERE r.device_key_hash = $1 AND r.amount > 0
         ORDER BY r.created_at DESC`,
        [deviceKeyHash]
      );

      res.json({
        history: result.rows.map(row => ({
          pollId: row.poll_id,
          title: row.title,
          type: row.type,
          votedAt: row.voted_at,
          endsAt: row.end_at,
          status: row.status,
          reward: {
            amount: parseFloat(row.amount),
            token: row.token_symbol
          }
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
