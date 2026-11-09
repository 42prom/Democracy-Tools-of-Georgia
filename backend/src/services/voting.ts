import { query, transaction } from '../db/client';
import { AudienceRules, VoteSubmission } from '../types/polls';
import { VotingCredential } from '../types/credentials';
import NonceService from './nonce';
import { createError } from '../middleware/errorHandler';
import { SecurityService } from './security';
import { computeNullifier } from './nullifier';
import { computeVoteLeaf, buildMerkleRoot } from './merkle';
import { signReceipt, SignedReceipt } from './receiptSigner';
import { createHash } from 'node:crypto';

export function buildVoteAttestationBinding(
  voteData: Pick<VoteSubmission, 'nonce' | 'pollId' | 'optionId' | 'timestampBucket'>
): string {
  const canonical =
    `dtg-vote-v1|${voteData.nonce}|${voteData.pollId}|` +
    `${voteData.optionId}|${voteData.timestampBucket}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Enforce the shared device-integrity policy for votes and surveys. */
export async function enforceDeviceAttestation(
  voteData: VoteSubmission,
  credentialSubject?: string
): Promise<void> {
  const settingsResult = await query(
    "SELECT key, value FROM settings WHERE key LIKE 'security_%'"
  );
  const settings = settingsResult.rows.reduce(
    (accumulator, row) => ({ ...accumulator, [row.key]: row.value }),
    {} as Record<string, string>
  );
  const requireAttestation =
    process.env.REQUIRE_DEVICE_ATTESTATION === 'true' ||
    settings.security_require_device_attestation_for_vote === 'true';

  if (!requireAttestation) return;
  if (!voteData.attestation?.token) {
    throw createError('Security Policy: Hardware device attestation is required to vote.', 403);
  }

  const currentTimestampBucket = Math.floor(Date.now() / 60_000);
  if (
    !Number.isInteger(voteData.timestampBucket) ||
    Math.abs(currentTimestampBucket - voteData.timestampBucket) > 2
  ) {
    throw createError('Security Policy: Attestation timestamp is stale or invalid.', 403);
  }

  const { DeviceAttestationService } = await import('./deviceAttestation');
  const platform = voteData.device?.platform || 'unknown';
  const attestationResult = await DeviceAttestationService.verify(
    platform,
    voteData.device?.provider || 'auto',
    voteData.attestation.token,
    buildVoteAttestationBinding(voteData),
    credentialSubject
  );
  if (!attestationResult.success) {
    await SecurityService.logSecurityEvent('SIGNATURE_FAIL', {
      reason: 'attestation_failed',
      verdict: attestationResult.verdict,
      detail: attestationResult.reason,
      pollId: voteData.pollId,
      platform,
    });
    throw createError(
      `Security Policy: Device integrity check failed (${attestationResult.verdict}).`,
      403
    );
  }

  const minimumVerdict = await DeviceAttestationService.getMinimumRequiredVerdict();
  if (!DeviceAttestationService.meetsMinimum(attestationResult.verdict, minimumVerdict)) {
    throw createError(
      `Security Policy: Device does not meet minimum integrity requirement (required: ${minimumVerdict}, got: ${attestationResult.verdict}).`,
      403
    );
  }
  console.log(
    `[Voting] Attestation passed: platform=${platform}, verdict=${attestationResult.verdict}`
  );
}

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

/** Enforce the same audience policy at submission time that is used for poll discovery. */
export async function enforceAudienceEligibility(
  pollId: string,
  rules: AudienceRules,
  credential: VotingCredential
): Promise<void> {
  const reject = async (reason: string, message: string, details: Record<string, unknown> = {}) => {
    await SecurityService.logSecurityEvent('ELIGIBILITY_FAIL', {
      reason,
      pollId,
      ...details,
    });
    throw createError(message, 403);
  };

  if (rules.min_age || rules.max_age) {
    const bucket = credential.data.age_bucket;
    const match = bucket?.match(/^(\d+)-(\d+)$/);
    const userMinAge = bucket === '65+' ? 65 : match ? Number(match[1]) : undefined;
    const userMaxAge = bucket === '65+' ? Number.POSITIVE_INFINITY : match ? Number(match[2]) : undefined;
    if (userMinAge === undefined || userMaxAge === undefined) {
      await reject('age_missing', 'Not eligible for this poll (age)');
    }
    if (rules.min_age && userMaxAge! < rules.min_age) {
      await reject('age_below_minimum', 'Not eligible for this poll (age)', {
        requiredMinimum: rules.min_age,
        actualBucket: bucket,
      });
    }
    if (rules.max_age && userMinAge! > rules.max_age) {
      await reject('age_above_maximum', 'Not eligible for this poll (age)', {
        requiredMaximum: rules.max_age,
        actualBucket: bucket,
      });
    }
  }

  if (rules.gender && rules.gender !== 'all' && credential.data.gender !== rules.gender) {
    await reject('gender_mismatch', 'Not eligible for this poll (gender)', {
      required: rules.gender,
      actual: credential.data.gender,
    });
  }

  if (rules.regions?.length) {
    const regionCandidates = new Set([
      ...(credential.data.region ? [credential.data.region] : []),
      ...(credential.data.region_codes || []),
    ]);
    const hasMatch = rules.regions.some(region => regionCandidates.has(region));
    if (!hasMatch) {
      await reject('region_mismatch', 'Not eligible for this poll (region)', {
        required: rules.regions,
      });
    }
  }
}

/**
 * Vote result with cryptographic receipt and optional reward info
 */
export interface VoteResult {
  txHash: string;
  receipt: SignedReceipt;
  merkleRoot: string;
  reward?: {
    issued: boolean;
    amount: number;
    tokenSymbol: string;
    rewardTxHash?: string;
  };
}

/**
 * Submit a vote — formal 13-step election-grade protocol.
 *
 * VOTE SUBMISSION PROTOCOL:
 *  Step  1: Nonce validation (anti-replay)
 *  Step  2: Poll existence + active status check
 *  Step  3: Time-based eligibility (start_at / end_at)
 *  Step  4: Option validity for this poll
 *  Step  5: Audience rules (gender, region)
 *  Step  6: Security policy enforcement (device attestation)
 *  Step  7: Device-voter rate limit check
 *  Step  8: SERVER-COMPUTED nullifier (replaces client-supplied value)
 *  Step  9: Double-vote check via poll_participants (user-level)
 *  Step 10: DB transaction:
 *            a. Record device-voter link
 *            b. Insert poll_participants record (bucketed timestamp)
 *            c. Insert server-computed nullifier into vote_nullifiers
 *            d. Insert anonymous vote record
 *            e. Compute Merkle leaf hash
 *            f. Fetch all leaves for poll → recompute Merkle root
 *            g. Update polls.merkle_root
 *            h. Store Ed25519 server signature on vote_attestations
 *            i. Optionally issue reward
 *  Step 11: Build and sign cryptographic receipt (Ed25519)
 *  Step 12: Return signed receipt + Merkle root to voter
 *  Step 13: Async: VoteAnchorService will periodically anchor Merkle root to blockchain
 */
export async function submitVote(
  voteData: VoteSubmission,
  credential: VotingCredential
): Promise<VoteResult> {

  // ─────────────────────────────────────────────────────────
  // STEP 1 — Nonce validation (anti-replay)
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // STEP 2 — Poll existence + active status
  // ─────────────────────────────────────────────────────────
  const pollResult = await query(
    `SELECT * FROM polls WHERE id = $1 AND status = 'active'`,
    [voteData.pollId]
  );
  if (pollResult.rows.length === 0) {
    throw createError('Poll not found or not active', 404);
  }
  const poll = pollResult.rows[0];

  // ─────────────────────────────────────────────────────────
  // STEP 3 — Time-based eligibility
  // ─────────────────────────────────────────────────────────
  const nowUtc = new Date();
  if (poll.start_at && new Date(poll.start_at) > nowUtc) {
    throw createError('Poll has not started yet', 403);
  }
  if (poll.end_at && new Date(poll.end_at) < nowUtc) {
    throw createError('Poll has already ended', 403);
  }

  // ─────────────────────────────────────────────────────────
  // STEP 4 — Option validity
  // ─────────────────────────────────────────────────────────
  const optionResult = await query(
    'SELECT * FROM poll_options WHERE id = $1 AND poll_id = $2',
    [voteData.optionId, voteData.pollId]
  );
  if (optionResult.rows.length === 0) {
    throw createError('Invalid option for this poll', 400);
  }

  // ─────────────────────────────────────────────────────────
  // STEP 5 — Audience rules (gender, region)
  // ─────────────────────────────────────────────────────────
  await enforceAudienceEligibility(voteData.pollId, poll.audience_rules || {}, credential);

  // ─────────────────────────────────────────────────────────
  // STEP 6 — Security policy enforcement (device attestation)
  // ─────────────────────────────────────────────────────────
  await enforceDeviceAttestation(voteData, credential.sub);

  // ─────────────────────────────────────────────────────────
  // STEP 7 — Device-voter rate limit
  // ─────────────────────────────────────────────────────────
  const deviceId = voteData.device?.id || 'unknown_device_' + credential.sub.substring(0, 8);
  const deviceHash = SecurityService.getDeviceHash(deviceId);
  const voterHash = SecurityService.getVoterHash(credential.sub);
  await SecurityService.checkDeviceVoterLimit(voteData.pollId, deviceHash, voterHash);

  // ─────────────────────────────────────────────────────────
  // STEP 8 — SERVER-COMPUTED nullifier
  // The client never supplies the nullifier or its source material.
  // The nullifier is deterministic: HMAC-SHA256(NULLIFIER_SECRET, voterSub|pollId).
  // ─────────────────────────────────────────────────────────
  const serverNullifier = await computeNullifier(credential.sub, voteData.pollId);

  // ─────────────────────────────────────────────────────────
  // STEP 9 — Double-vote check (user-level via poll_participants)
  // ─────────────────────────────────────────────────────────
  const userId = credential.sub;
  const partCheck = await query(
    'SELECT 1 FROM poll_participants WHERE poll_id = $1 AND user_id = $2',
    [voteData.pollId, userId]
  );
  if (partCheck.rows.length > 0) {
    await SecurityService.logSecurityEvent('DOUBLE_VOTE_ATTEMPT', {
      reason: 'already_participated',
      pollId: voteData.pollId,
      userId
    });
    throw createError('Already voted in this poll', 409);
  }

  // ─────────────────────────────────────────────────────────
  // Bucketed timestamp (Privacy — 10-minute granularity)
  // ─────────────────────────────────────────────────────────
  const now = new Date();
  const BUCKET_MINUTES = 10;
  const bucketTs = new Date(
    Math.floor(now.getTime() / (BUCKET_MINUTES * 60 * 1000)) * (BUCKET_MINUTES * 60 * 1000)
  );

  // ─────────────────────────────────────────────────────────
  // STEP 10 — Atomic DB transaction
  // ─────────────────────────────────────────────────────────
  let finalVoteId = '';
  let finalMerkleRoot = '';
  let signedReceipt: SignedReceipt | undefined;
  let rewardInfo: VoteResult['reward'] | undefined;

  try {
    await transaction(async (client) => {

      // Serialize all votes for the same poll. This is required because the
      // Merkle root is a read/modify/write aggregate over every committed leaf.
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('dtg-vote-v1'),
           hashtext($1::text)
         )`,
        [voteData.pollId]
      );

      // Re-check mutable poll state inside the serialized transaction. The
      // earlier checks provide fast rejection; these are the commit barrier.
      const lockedPollResult = await client.query(
        `SELECT status, start_at, end_at, rewards_enabled, reward_amount, reward_token
         FROM polls
         WHERE id = $1
         FOR SHARE`,
        [voteData.pollId]
      );
      if (lockedPollResult.rows.length === 0 || lockedPollResult.rows[0].status !== 'active') {
        throw createError('Poll not found or not active', 404);
      }
      const lockedPoll = lockedPollResult.rows[0];
      const commitTime = new Date();
      if (lockedPoll.start_at && new Date(lockedPoll.start_at) > commitTime) {
        throw createError('Poll has not started yet', 403);
      }
      if (lockedPoll.end_at && new Date(lockedPoll.end_at) < commitTime) {
        throw createError('Poll has already ended', 403);
      }

      // 10a. Record device-voter link (rate limiting only; not linked to vote)
      await SecurityService.recordDeviceVoter(voteData.pollId, deviceHash, voterHash, client);

      // 10b. Insert participation record (Who Voted) — bucketed timestamp
      await client.query(
        'INSERT INTO poll_participants (poll_id, user_id, participated_at) VALUES ($1, $2, $3)',
        [voteData.pollId, userId, bucketTs]
      );

      // 10c. Insert server-computed nullifier (Double Vote Prevention — Cryptographic)
      await client.query(
        'INSERT INTO vote_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [voteData.pollId, serverNullifier]
      );

      // 10d. Insert anonymous vote record (What Voted)
      // Note: Pass object directly - pg driver handles object->jsonb conversion correctly
      const snapshot = buildDemographicsSnapshot(credential.data);
      const voteResult = await client.query(
        `INSERT INTO votes (poll_id, option_id, demographics_snapshot, bucket_ts, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [voteData.pollId, voteData.optionId, snapshot, bucketTs, bucketTs]
      );
      finalVoteId = voteResult.rows[0].id;

      // 10e. Compute Merkle leaf hash for this vote
      const leafHash = computeVoteLeaf({
        pollId: voteData.pollId,
        optionId: voteData.optionId,
        nullifier: serverNullifier,
        bucketTs,
      });

      // Persist the current leaf before reading the canonical leaf set.
      await client.query(
        `UPDATE votes SET vote_hash = $1 WHERE id = $2`,
        [leafHash, finalVoteId]
      );

      // 10f. Fetch ALL leaf hashes in deterministic order. UUID tie-breaking is
      // required because privacy-bucketed timestamps are intentionally shared.
      const leavesRes = await client.query(
        `SELECT vote_hash FROM votes
         WHERE poll_id = $1 AND vote_hash IS NOT NULL
         ORDER BY bucket_ts ASC, id ASC`,
        [voteData.pollId]
      );
      const allLeaves: string[] = leavesRes.rows.map((r: any) => r.vote_hash as string);

      // 10g. Compute new Merkle root and update polls.merkle_root
      const newMerkleRoot = buildMerkleRoot(allLeaves);
      finalMerkleRoot = newMerkleRoot;

      await client.query(
        `UPDATE polls SET merkle_root = $1 WHERE id = $2`,
        [newMerkleRoot, voteData.pollId]
      );

      // Store leaf hash + legacy chain fields in votes row for audit
      // Keep previous_hash / chain_hash for backward compatibility (deprecation path)
      const prevVoteRes = await client.query(
        `SELECT chain_hash FROM votes WHERE poll_id = $1 AND id != $2
         ORDER BY bucket_ts DESC, id DESC LIMIT 1`,
        [voteData.pollId, finalVoteId]
      );
      const prevHash = prevVoteRes.rows[0]?.chain_hash
        ?? '0000000000000000000000000000000000000000000000000000000000000000';

      // vote_hash now stores the Merkle leaf hash
      await client.query(
        `UPDATE votes
         SET vote_hash = $1, previous_hash = $2, chain_hash = $3
         WHERE id = $4`,
        [leafHash, prevHash, newMerkleRoot, finalVoteId]
      );

      // Receipt signing is part of the transaction boundary. If the key is
      // missing, invalid, or unavailable, the vote transaction must roll back.
      signedReceipt = signReceipt({
        voteId: finalVoteId,
        pollId: voteData.pollId,
        leafHash,
        merkleRoot: newMerkleRoot,
        ts: bucketTs.toISOString(),
      });

      // 10h. Store attestation receipt — SHA256 of signature (unlinkable)
      // Also store Ed25519 server signature of (voteId|pollId|leafHash) for audit
      const attestationHash = createHash('sha256').update(voteData.signature).digest('hex');

      await client.query(
        `INSERT INTO vote_attestations (vote_id, attestation_payload, nonce_used)
         VALUES ($1, $2, $3)`,
        [finalVoteId, attestationHash, voteData.nonce]
      );

      // 10h2. Write immutable audit log entry INSIDE the transaction (H2 — atomic).
      // If the transaction rolls back, this audit entry is automatically discarded.
      await SecurityService.logAuditEventInTransaction(client, 'VOTE_SUBMITTED', {
        voteId: finalVoteId,
        pollId: voteData.pollId,
        leafHash,
        merkleRoot: newMerkleRoot,
        attestationHash, // unlinkable hash of the attestation
      });

      // 10i. Optional reward
      if (lockedPoll.rewards_enabled && lockedPoll.reward_amount > 0) {
        const existingReward = await client.query(
          'SELECT id FROM user_rewards WHERE poll_id = $1 AND device_key_hash = $2',
          [voteData.pollId, credential.sub]
        );
        if (existingReward.rows.length === 0) {
          const rewardResult = await client.query(
            `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id`,
            [credential.sub, voteData.pollId, lockedPoll.reward_amount, lockedPoll.reward_token || 'DTG']
          );
          if (rewardResult.rows.length > 0) {
            rewardInfo = {
              issued: true,
              amount: parseFloat(lockedPoll.reward_amount),
              tokenSymbol: lockedPoll.reward_token || 'DTG',
              rewardTxHash: 'reward_' + voteData.pollId + '_' + Date.now(),
            };
          }
        }
      }
    });

  } catch (error: any) {
    if (
      (error.code === '23505' && error.constraint === 'vote_nullifiers_pkey') ||
      (error.code === '23505' && error.constraint === 'poll_participants_pkey')
    ) {
      throw createError('Already voted in this poll', 409);
    }
    throw error;
  }

  // ─────────────────────────────────────────────────────────
  // STEP 11 — Confirm the transaction produced a signed receipt
  // ─────────────────────────────────────────────────────────
  if (!signedReceipt) {
    throw new Error('[Voting] Transaction completed without a signed receipt.');
  }

  // ─────────────────────────────────────────────────────────
  // STEP 12 — Return signed receipt + Merkle root to voter
  // ─────────────────────────────────────────────────────────
  // STEP 13 — VoteAnchorService will asynchronously anchor the Merkle root
  //           to the blockchain (runs every 10 minutes).
  const result: VoteResult = {
    txHash: finalVoteId, // voteId as the internal transaction identifier
    receipt: signedReceipt,
    merkleRoot: finalMerkleRoot,
  };

  if (rewardInfo) {
    result.reward = rewardInfo;
  }

  return result;
}
