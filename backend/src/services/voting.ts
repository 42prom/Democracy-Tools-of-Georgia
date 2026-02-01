import { query, transaction, getClient } from '../db/client';
import { VoteSubmission } from '../types/polls';
import { VotingCredential } from '../types/credentials';
import NonceService from './nonce';
import { createError } from '../middleware/errorHandler';

/**
 * Submit a vote with full validation
 */
export async function submitVote(
  voteData: VoteSubmission,
  credential: VotingCredential
): Promise<{ txHash: string; receipt: string }> {
  // 1. Verify nonce (anti-replay)
  const nonceValid = await NonceService.verifyAndConsume(voteData.nonce, 'vote');
  if (!nonceValid) {
    throw createError('Invalid or expired nonce (replay detected)', 400);
  }

  // 2. Check poll exists and is active
  const pollResult = await query(
    `SELECT * FROM polls WHERE id = $1 AND status = 'active'`,
    [voteData.pollId]
  );

  if (pollResult.rows.length === 0) {
    throw createError('Poll not found or not active', 404);
  }

  const poll = pollResult.rows[0];

  // 3. Verify option exists for this poll
  const optionResult = await query(
    'SELECT * FROM poll_options WHERE id = $1 AND poll_id = $2',
    [voteData.optionId, voteData.pollId]
  );

  if (optionResult.rows.length === 0) {
    throw createError('Invalid option for this poll', 400);
  }

  // 4. Verify user eligibility based on demographics
  const rules = poll.audience_rules;

  if (rules.gender && rules.gender !== 'all' && credential.data.gender !== rules.gender) {
    throw createError('Not eligible for this poll (gender)', 403);
  }

  if (rules.regions && rules.regions.length > 0) {
    const hasMatchingRegion = credential.data.region_codes.some((r: string) =>
      rules.regions?.includes(r)
    );
    if (!hasMatchingRegion) {
      throw createError('Not eligible for this poll (region)', 403);
    }
  }

  // 5. Record vote in transaction (nullifier + vote)
  try {
    await transaction(async (client) => {
      // Insert nullifier (will fail if duplicate due to PRIMARY KEY constraint)
      await client.query(
        'INSERT INTO vote_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [voteData.pollId, voteData.nullifier]
      );

      // Insert vote with demographic snapshot
      await client.query(
        `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
         VALUES ($1, $2, $3)`,
        [
          voteData.pollId,
          voteData.optionId,
          JSON.stringify(credential.data),
        ]
      );
    });

    // Phase 0: Mock blockchain transaction
    // Phase 2: Actual blockchain submission
    return {
      txHash: 'mock_tx_' + Date.now(),
      receipt: 'Vote recorded successfully',
    };
  } catch (error: any) {
    // Check if duplicate nullifier
    if (error.code === '23505' && error.constraint === 'vote_nullifiers_pkey') {
      throw createError('Already voted in this poll', 409);
    }
    throw error;
  }
}
