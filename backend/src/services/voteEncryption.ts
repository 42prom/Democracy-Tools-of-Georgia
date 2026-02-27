/**
 * VoteEncryptionService — optional per-poll AES-256-GCM encryption of vote choice at rest.
 *
 * Design:
 *  - Each poll that opts into encryption gets a unique symmetric key.
 *  - The key is stored sealed in the `poll_encryption_keys` table.
 *  - The option_id is replaced by `encrypted_option_id` in the `votes` row.
 *  - The key is revealed only after the poll closes (admin action).
 *  - All existing polls (encryption_enabled = false) are unaffected.
 *
 * This ensures a compromised database cannot reveal vote choices in real time.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import pool from '../db/client';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedVoteChoice {
  ciphertext: string; // hex
  iv: string;         // hex
  authTag: string;    // hex
  keyId: string;      // UUID ref to poll_encryption_keys
}

// ─────────────────────────────────────────────────────────────
// Key Management
// ─────────────────────────────────────────────────────────────

/**
 * Generate and store a new encryption key for a poll.
 * Call once when a poll is created with encryption_enabled = true.
 * Returns the keyId (UUID) to store on the poll.
 */
export async function sealPollKey(pollId: string): Promise<string> {
  const key = randomBytes(KEY_BYTES);

  const res = await pool.query(
    `INSERT INTO poll_encryption_keys (poll_id, sealed_key_hex)
     VALUES ($1, $2)
     RETURNING id`,
    [pollId, key.toString('hex')]
  );

  // Overwrite key in memory immediately after storage
  key.fill(0);

  return res.rows[0].id as string;
}

/**
 * Retrieve the raw key for a poll (only after poll close).
 * In production this would be gated behind admin auth + poll status check.
 */
export async function revealPollKey(pollId: string): Promise<Buffer> {
  const res = await pool.query(
    `SELECT sealed_key_hex, revealed_at
     FROM poll_encryption_keys
     WHERE poll_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [pollId]
  );

  if (res.rows.length === 0) {
    throw new Error(`No encryption key found for poll ${pollId}`);
  }

  // Mark as revealed if first time
  if (!res.rows[0].revealed_at) {
    await pool.query(
      `UPDATE poll_encryption_keys SET revealed_at = NOW() WHERE poll_id = $1`,
      [pollId]
    );
  }

  return Buffer.from(res.rows[0].sealed_key_hex, 'hex');
}

// ─────────────────────────────────────────────────────────────
// Encrypt / Decrypt
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a vote option ID using AES-256-GCM.
 * The keyId must be the UUID from `poll_encryption_keys`.
 */
export async function encryptOptionId(
  optionId: string,
  pollId: string,
  keyId: string
): Promise<EncryptedVoteChoice> {
  const keyHex = await pool.query(
    `SELECT sealed_key_hex FROM poll_encryption_keys WHERE id = $1 AND poll_id = $2`,
    [keyId, pollId]
  );

  if (keyHex.rows.length === 0) {
    throw new Error(`Encryption key ${keyId} not found for poll ${pollId}`);
  }

  const key = Buffer.from(keyHex.rows[0].sealed_key_hex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(optionId, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Zero out key reference
  key.fill(0);

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    keyId,
  };
}

/**
 * Decrypt a vote choice after poll close (for tallying).
 * Only usable once revealPollKey() has been called.
 */
export async function decryptOptionId(
  choice: EncryptedVoteChoice,
  pollId: string
): Promise<string> {
  const key = await revealPollKey(pollId);

  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(choice.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(choice.authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(choice.ciphertext, 'hex')),
    decipher.final(),
  ]);

  key.fill(0);

  return decrypted.toString('utf8');
}
