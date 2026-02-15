import { query, transaction } from '../db/client';
import { VoteSubmission } from '../types/polls';
import { VotingCredential } from '../types/credentials';
import NonceService from './nonce';
import { createError } from '../middleware/errorHandler';
import { SecurityService } from './security';
import { createHash } from 'crypto';

/**
 * Minimizes demographics to bucketed fields only (Privacy requirement)
 */
export function buildDemographicsSnapshot(data: any): any {
  return {
    region: data.region || (data.region_codes && data.region_codes.length > 0 ? data.region_codes[0] : 'unknown'),
    age_bucket: data.age_bucket || 'unknown',
    gender: data.gender || 'unknown'
  };
}

/**
 * Vote result with optional reward info
 */
export interface VoteResult {
  txHash: string;
  receipt: string;
  reward?: {
    issued: boolean;
    amount: number;
    tokenSymbol: string;
    rewardTxHash?: string;
  };
}

/**
 * Submit a vote with full validation
 */
export async function submitVote(
  voteData: VoteSubmission,
  credential: VotingCredential
): Promise<VoteResult> {
  // 1. Verify nonce (anti-replay)
  const nonceValid = await NonceService.verifyAndConsume(voteData.nonce, 'vote');
  if (!nonceValid) {
    await SecurityService.logSecurityEvent('REPLAY_ATTACK', {
      moment: 'submitVote',
      pollId: voteData.pollId,
      nonce: voteData.nonce,
      userId: credential.sub
    });
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
    await SecurityService.logSecurityEvent('ELIGIBILITY_FAIL', {
      reason: 'gender_mismatch',
      pollId: voteData.pollId,
      required: rules.gender,
      actual: credential.data.gender
    });
    throw createError('Not eligible for this poll (gender)', 403);
  }

  if (rules.regions && rules.regions.length > 0) {
    // CANONICAL KEY: Always use snapshot.region (single string), not region_codes array
    const snapshot = buildDemographicsSnapshot(credential.data);
    const userRegion = snapshot.region;

    if (!userRegion || userRegion === 'unknown') {
      await SecurityService.logSecurityEvent('ELIGIBILITY_FAIL', {
        reason: 'region_missing',
        pollId: voteData.pollId
      });
      throw createError('Not eligible for this poll (region) - no region data in credential', 403);
    }

    if (!rules.regions.includes(userRegion)) {
      await SecurityService.logSecurityEvent('ELIGIBILITY_FAIL', {
        reason: 'region_mismatch',
        pollId: voteData.pollId,
        required: rules.regions,
        actual: userRegion
      });
      throw createError('Not eligible for this poll (region)', 403);
    }
  }

  // 5. SECURITY POLICY ENFORCEMENT
  // A) Load Settings
  const settingsRes = await query("SELECT key, value FROM settings WHERE key LIKE 'security_%'");
  const settings = settingsRes.rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {} as any);
  
  const requireAttestation = settings.security_require_device_attestation_for_vote === 'true';

  // B) Optional Hardware Attestation Check
  if (requireAttestation) {
    if (!voteData.attestation?.token) {
        throw createError('Security Policy: Hardware device attestation is required to vote in this poll.', 403);
    }
    
    // NOTE: In the future, we would use the DeviceAttestationService to verify the token here.
  }

  // C) Device-Voter Limit Enforcement
  // We use the provided deviceId if available, otherwise fallback to credential.sub (better than nothing)
  const deviceId = voteData.device?.id || 'unknown_device_' + credential.sub.substring(0, 8);
  const deviceHash = SecurityService.getDeviceHash(deviceId);
  const voterHash = SecurityService.getVoterHash(credential.sub);

  await SecurityService.checkDeviceVoterLimit(voteData.pollId, deviceHash, voterHash);

  // 6. Record vote in transaction (nullifier + vote + security link)
  try {
    // 6a. Resolve User ID for Participation Tracking (Public "Who Voted")
    const userId = credential.sub; // credential.sub is consistently userId UUID

    // 6b. Check if already participated (using the new clean table)
    const partCheck = await query(
        'SELECT 1 FROM poll_participants WHERE poll_id = $1 AND user_id = $2',
        [voteData.pollId, userId]
    );
    if (partCheck.rows.length > 0) {
        await SecurityService.logSecurityEvent('DOUBLE_VOTE_ATTEMPT', {
          reason: 'already_participated',
          pollId: voteData.pollId,
          userId: userId
        });
        throw createError('Already voted in this poll', 409);
    }

    // 6c. Calculate Bucketed Timestamp (Privacy)
    // Round down to nearest 10 minutes to reduce timing correlation
    const now = new Date();
    const BUCKET_MINUTES = 10;
    const bucketTs = new Date(Math.floor(now.getTime() / (BUCKET_MINUTES * 60 * 1000)) * (BUCKET_MINUTES * 60 * 1000));

    // Track reward info for response
    let rewardInfo: VoteResult['reward'] | undefined;

    await transaction(async (client) => {
      // Record the device-voter link for enforcement (Rate limiting only, no vote link)
      await SecurityService.recordDeviceVoter(voteData.pollId, deviceHash, voterHash, client);

      // Insert participation record (The "Who Voted") - decoupled from vote
      // Use bucketed timestamp to reduce timing correlation with votes
      await client.query(
        'INSERT INTO poll_participants (poll_id, user_id, participated_at) VALUES ($1, $2, $3)',
        [voteData.pollId, userId, bucketTs]
      );

      // Insert nullifier (The "Double Vote Prevention" - Cryptographic)
      await client.query(
        'INSERT INTO vote_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [voteData.pollId, voteData.nullifier]
      );

      // Insert vote with demographic snapshot (The "What Voted") - ANONYMOUS
      // created_at is set to bucket_ts to hide exact timing
      const snapshot = buildDemographicsSnapshot(credential.data);
      const voteResult = await client.query(
        `INSERT INTO votes (poll_id, option_id, demographics_snapshot, bucket_ts, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          voteData.pollId,
          voteData.optionId,
          JSON.stringify(snapshot),
          bucketTs,
          bucketTs // Set created_at to bucket time primarily
        ]
      );
      const voteId = voteResult.rows[0].id;

      // Store attestation (Receipt) - UNLINKABLE
      // PRIVACY: We store the SHA256 hash of the signature, not the raw signature.
      // This allows the user to prove they voted (receipt) without allowing the
      // server to link the vote to the voter's public key via signature verification.
      const attestationHash = createHash('sha256').update(voteData.signature).digest('hex');

      await client.query(
        `INSERT INTO vote_attestations (vote_id, attestation_payload, nonce_used)
         VALUES ($1, $2, $3)`,
        [
          voteId,
          attestationHash,
          voteData.nonce
        ]
      );

      // 6d. Distribution Reward (only if poll has rewards enabled)
      if (poll.rewards_enabled && poll.reward_amount > 0) {
        // Check-then-insert to avoid ON CONFLICT constraint issues with partial unique index
        const existingReward = await client.query(
          'SELECT id FROM user_rewards WHERE poll_id = $1 AND device_key_hash = $2',
          [voteData.pollId, credential.sub]
        );

        if (existingReward.rows.length === 0) {
          const rewardResult = await client.query(
            `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id`,
            [
              credential.sub,
              voteData.pollId,
              poll.reward_amount,
              poll.reward_token || 'DTG'
            ]
          );

          if (rewardResult.rows.length > 0) {
            rewardInfo = {
              issued: true,
              amount: parseFloat(poll.reward_amount),
              tokenSymbol: poll.reward_token || 'DTG',
              rewardTxHash: 'reward_' + voteData.pollId + '_' + Date.now()
            };
          }
        }
      }
    });

    // Phase 0: Mock blockchain transaction
    // Phase 2: Actual blockchain submission
    const result: VoteResult = {
      txHash: 'mock_tx_' + Date.now(),
      receipt: 'Vote recorded successfully',
    };

    // Include reward info if issued
    if (rewardInfo) {
      result.reward = rewardInfo;
    }

    return result;
  } catch (error: any) {
    // Check if duplicate nullifier or participant
    if (
        (error.code === '23505' && error.constraint === 'vote_nullifiers_pkey') ||
        (error.code === '23505' && error.constraint === 'poll_participants_pkey')
    ) {
      throw createError('Already voted in this poll', 409);
    }
    throw error;
  }
}

