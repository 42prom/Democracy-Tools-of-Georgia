import { pool } from '../db/client';
import { BlockchainService } from './blockchain';

/**
 * Vote Anchor Service
 * Layer 2: Periodically anchors the internal hash chain to the public blockchain.
 */
export class VoteAnchorService {
  private static isRunning = false;
  private static interval: NodeJS.Timeout | null = null;
  private static POLLING_INTERVAL = 10 * 60 * 1000; // 10 minutes

  static start() {
    if (this.interval) return;
    console.log('[VoteAnchor] Starting Layer 2 anchor service...');
    this.interval = setInterval(() => this.anchorPendingVotes(), this.POLLING_INTERVAL);
    this.anchorPendingVotes(); // Run on startup
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private static async anchorPendingVotes() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // 1. Get active polls
      const polls = await pool.query(`SELECT id FROM polls WHERE status = 'active'`);
      
      for (const poll of polls.rows) {
        await this.processPollAnchor(poll.id);
      }

    } catch (error) {
      console.error('[VoteAnchor] Error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private static async processPollAnchor(pollId: string) {
    try {
      // Find the latest vote that hasn't been anchored yet
      // We look for the latest vote in the 'votes' table
      const headVote = await pool.query(
        `SELECT id, chain_hash, created_at FROM votes WHERE poll_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [pollId]
      );

      if (headVote.rows.length === 0) return; // No votes

      const currentChainHash = headVote.rows[0].chain_hash;
      if (!currentChainHash) return; // Should not happen if Layer 1 is working

      // Check if this hash is already anchored
      const existingAnchor = await pool.query(
        `SELECT id FROM vote_anchors WHERE poll_id = $1 AND chain_hash = $2 AND status = 'confirmed'`,
        [pollId, currentChainHash]
      );

      if (existingAnchor.rows.length > 0) return; // Already anchored

      console.log(`[VoteAnchor] Anchoring poll ${pollId} at hash ${currentChainHash.substring(0, 8)}...`);

      // WRITE TO BLOCKCHAIN
      // In a real implementation, we would call a specific 'anchor' method on the smart contract.
      // For now, we simulate this or reuse a generic data field if available, 
      // OR we can commit it as a "message" if the contract supports it.
      // Since we don't have a dedicated anchor method in the ABI in 'blockchain.ts', 
      // we will assume we can mint a zero-value token or log an event.
      // Phase 8 Plan said "Implement writeAnchor method".
      
      const result = await BlockchainService.writeAnchor(pollId, currentChainHash);

      if (result.success) {
        await pool.query(
          `INSERT INTO vote_anchors (poll_id, end_vote_id, chain_hash, tx_hash, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', NOW())`,
          [pollId, headVote.rows[0].id, currentChainHash, result.txHash]
        );
        console.log(`[VoteAnchor] Anchored successfully. Tx: ${result.txHash}`);
      } else {
        console.warn(`[VoteAnchor] Update failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`[VoteAnchor] Failed to anchor poll ${pollId}:`, error);
    }
  }
}
