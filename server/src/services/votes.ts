import { query, transaction } from '../db/client';
import { verifyAttestation, verifyVotePayloadHash, SessionAttestation } from './attestations';

/**
 * Submit vote with full security validation
 *
 * Requirements:
 * - Verify attestation signature and not expired
 * - Verify attestation votePayloadHash matches (pollId, optionId, timestampBucket)
 * - Enforce unique nullifier in DB
 * - Write vote row + security_events aggregate entry
 */
export async function submitVote(data: {
  pollId: string;
  optionId: string;
  nullifier: string;
  timestampBucket: number;
  attestation: string;
}) {
  // 1) Verify attestation signature and expiration
  let attestationData: SessionAttestation;
  try {
    attestationData = verifyAttestation(data.attestation);
  } catch (error: any) {
    await query(
      `INSERT INTO security_events (event_type, severity, meta)
       VALUES ($1, $2, $3)`,
      ['attestation_verification_failed', 'warning', JSON.stringify({ reason: String(error?.message || error) })]
    );
    throw new Error(`Attestation verification failed: ${String(error?.message || error)}`);
  }

  // 2) Verify attestation is for this poll
  if (attestationData.pollId !== data.pollId) {
    throw new Error('Attestation not valid for this poll');
  }

  // 3) Verify vote payload hash matches
  // attestation must include votePayloadHash; we compare it to hash(pollId|optionId|timestampBucket)
  const expectedHash = attestationData.votePayloadHash;
  const payloadValid = verifyVotePayloadHash(
    data.pollId,
    data.optionId,
    String(data.timestampBucket),
    expectedHash
  );

  if (!payloadValid) {
    await query(
      `INSERT INTO security_events (event_type, severity, meta)
       VALUES ($1, $2, $3)`,
      ['vote_payload_mismatch', 'warning', JSON.stringify({ pollId: data.pollId })]
    );
    throw new Error('Vote payload hash mismatch');
  }

  // 4) Check poll is active
  const pollResult = await query(
    `SELECT * FROM polls WHERE id = $1 AND status = 'active'`,
    [data.pollId]
  );

  if (pollResult.rows.length === 0) {
    throw new Error('Poll not found or not active');
  }

  const poll = pollResult.rows[0];

  // 5) Verify option exists
  const optionResult = await query(
    'SELECT * FROM poll_options WHERE id = $1 AND poll_id = $2',
    [data.optionId, data.pollId]
  );

  if (optionResult.rows.length === 0) {
    throw new Error('Invalid option for this poll');
  }

  // 6) Verify user eligibility based on demographics buckets from attestation data
  // Keep this defensive: allow missing fields in Phase 0
  const rules = poll.audience_rules || {};
  const att = (attestationData as any).data || {};

  // Gender check (if present)
  if (rules.gender && rules.gender !== 'all' && att.gender && att.gender !== rules.gender) {
    throw new Error('Not eligible for this poll (gender)');
  }

  // Region check (if present)
  if (rules.regions && Array.isArray(rules.regions) && rules.regions.length > 0) {
    const attRegions: string[] =
      Array.isArray(att.region_codes) ? att.region_codes :
      Array.isArray(att.regions) ? att.regions :
      att.region ? [att.region] :
      [];

    const hasMatchingRegion = attRegions.some((r) => rules.regions.includes(r));
    if (!hasMatchingRegion) {
      throw new Error('Not eligible for this poll (region)');
    }
  }

  // 7) Record vote in transaction (enforce nullifier uniqueness)
  try {
    await transaction(async (client) => {
      // Insert nullifier (fails if duplicate due to PK/unique constraint)
      await client.query(
        'INSERT INTO vote_nullifiers (poll_id, nullifier_hash) VALUES ($1, $2)',
        [data.pollId, data.nullifier]
      );

      // Insert vote with demographic snapshot (bucketed only)
      await client.query(
        `INSERT INTO votes (poll_id, option_id, demographics_snapshot)
         VALUES ($1, $2, $3)`,
        [data.pollId, data.optionId, JSON.stringify(att)]
      );

      // Log successful vote (aggregated)
      await client.query(
        `INSERT INTO security_events (event_type, severity, meta)
         VALUES ($1, $2, $3)`,
        ['vote_recorded', 'info', JSON.stringify({ pollId: data.pollId })]
      );
    });

    return {
      txHash: 'mock_tx_' + Date.now(),
      receipt: 'Vote recorded',
    };
  } catch (error: any) {
    // Duplicate nullifier (Postgres unique violation)
    if (error?.code === '23505') {
      await query(
        `INSERT INTO security_events (event_type, severity, meta)
         VALUES ($1, $2, $3)`,
        ['duplicate_vote_rejected', 'warning', JSON.stringify({ pollId: data.pollId })]
      );
      throw new Error('Already voted in this poll (duplicate nullifier)');
    }
    throw error;
  }
}
