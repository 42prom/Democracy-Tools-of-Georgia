import { pool } from '../db/client';
import { BlockchainService } from './blockchain';

/**
 * Reward Processor
 * Scans for pending rewards and distributes them via blockchain
 */
export class RewardProcessor {
  private static isRunning = false;
  private static interval: NodeJS.Timeout | null = null;
  private static BATCH_SIZE = 10;
  private static POLLING_INTERVAL = 30000; // 30 seconds

  /**
   * Start the background processor
   */
  static start() {
    if (this.interval) return;
    
    console.log('[RewardProcessor] Starting background worker...');
    this.interval = setInterval(() => this.processPendingRewards(), this.POLLING_INTERVAL);
    
    // Run immediately on start
    this.processPendingRewards();
  }

  /**
   * Stop the background processor
   */
  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[RewardProcessor] Background worker stopped.');
    }
  }

  /**
   * Process a batch of pending rewards
   */
  private static async processPendingRewards() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // 0. Check if blockchain is configured
      const cfg = await BlockchainService.loadConfig();
      if (!cfg.rpcUrl) {
        console.warn('[RewardProcessor] Blockchain RPC URL not configured. Skipping reward processing.');
        this.isRunning = false;
        return;
      }

      // 1. Fetch pending rewards that have a valid wallet address associated with the user
      // We join user_rewards with users on device_key_hash -> id (or thumbprint)
      // Note: In 009_user_rewards, device_key_hash stores req.credential.sub (userId)
      // Only process positive amounts - negative amounts are debits (transfers out)
      const pendingRewards = await pool.query(`
        SELECT r.id, r.amount, r.token_symbol, u.wallet_address, r.poll_id
        FROM user_rewards r
        JOIN users u ON r.device_key_hash = u.id::text
        WHERE r.status = 'pending'
        AND r.amount > 0
        AND u.wallet_address IS NOT NULL
        LIMIT $1
      `, [this.BATCH_SIZE]);

      if (pendingRewards.rows.length === 0) {
        this.isRunning = false;
        return;
      }

      console.log(`[RewardProcessor] Found ${pendingRewards.rows.length} pending rewards to process.`);

      for (const reward of pendingRewards.rows) {
          await this.processSingleReward(reward);
      }

    } catch (error) {
      console.error('[RewardProcessor] Error in processing loop:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single reward payout
   */
  private static async processSingleReward(reward: any) {
    const { id, amount, token_symbol, wallet_address } = reward;
    
    try {
      console.log(`[RewardProcessor] Paying out ${amount} ${token_symbol} to ${wallet_address} (ID: ${id})`);

      // Call blockchain service
      // We use transferDTG for now as it's the standard ERC-20 symbol we use
      const result = await BlockchainService.transferDTG(wallet_address, amount.toString());

      if (result.success) {
        await pool.query(
          `UPDATE user_rewards 
           SET status = 'processed', tx_hash = $1, updated_at = NOW(), error_message = NULL
           WHERE id = $2`,
          [result.txHash, id]
        );
        console.log(`[RewardProcessor] Successfully processed reward ${id}. Tx: ${result.txHash}`);
      } else {
        throw new Error(result.error || 'Unknown blockchain error');
      }

    } catch (error: any) {
      console.error(`[RewardProcessor] Failed to process reward ${id}:`, error.message);
      
      // Update with failure status and error message
      // We keep it 'pending' if it's a transient error, or mark 'failed' if we want to give up
      // For now, let's keep it 'pending' but record the error for diagnostics
      await pool.query(
        `UPDATE user_rewards 
         SET error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [error.message, id]
      );
    }
  }
}
