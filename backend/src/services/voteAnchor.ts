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
      // Fetch the current Merkle root for this poll.
      // The Merkle root is updated on every vote submission (voting.ts Step 10g).
      const pollRes = await pool.query(
        `SELECT merkle_root FROM polls WHERE id = $1`,
        [pollId]
      );

      if (pollRes.rows.length === 0) return;

      const merkleRoot = pollRes.rows[0].merkle_root;
      if (!merkleRoot) {
        console.log(`[VoteAnchor] Poll ${pollId} has no Merkle root yet (no votes cast).`);
        return;
      }

      // Fetch the head vote ID for this poll (for the anchor record)
      const headVote = await pool.query(
        `SELECT id FROM votes WHERE poll_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [pollId]
      );
      if (headVote.rows.length === 0) return;

      // Check if this exact Merkle root is already anchored on-chain
      const existingAnchor = await pool.query(
        `SELECT id FROM vote_anchors WHERE poll_id = $1 AND chain_hash = $2 AND status = 'confirmed'`,
        [pollId, merkleRoot]
      );

      if (existingAnchor.rows.length > 0) {
        console.log(`[VoteAnchor] Poll ${pollId} Merkle root already anchored.`);
        return;
      }

      console.log(`[VoteAnchor] Anchoring poll ${pollId} Merkle root ${merkleRoot.substring(0, 8)}...`);

      // WRITE MERKLE ROOT TO BLOCKCHAIN (self-send with merkleRoot as data payload)
      const result = await BlockchainService.writeAnchor(pollId, merkleRoot);

      if (result.success) {
        await pool.query(
          `INSERT INTO vote_anchors (poll_id, end_vote_id, chain_hash, tx_hash, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', NOW())`,
          [pollId, headVote.rows[0].id, merkleRoot, result.txHash]
        );
        console.log(`[VoteAnchor] Merkle root anchored successfully. Tx: ${result.txHash}`);
      } else {
        console.warn(`[VoteAnchor] Anchor failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`[VoteAnchor] Failed to anchor poll ${pollId}:`, error);
    }
  }
}
