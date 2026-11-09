import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { pool, transaction } from '../db/client';
import { getSecret } from '../config/vault';
import { assertSafeOutboundHttpsUrl } from './outboundUrl';

const GENESIS_CHECKPOINT = '0'.repeat(64);
const MAX_RESPONSE_BYTES = 32_768;
const CHECKPOINT_LOCK = '752991884322002';

export interface AuditCheckpointPayload {
  version: 1;
  deploymentId: string;
  auditId: string;
  auditRowHash: string;
  previousCheckpointHash: string;
  createdAt: string;
}

export interface SignedAuditCheckpoint {
  payload: AuditCheckpointPayload;
  checkpointHash: string;
  signature: string;
  algorithm: 'Ed25519';
  publicKeyPem: string;
}

interface AuditCheckpointRow {
  id: string;
  audit_id: string;
  checkpoint_hash: string;
  payload: string;
  signature_base64: string;
  signing_public_key_pem: string;
  endpoint_url: string;
  delivery_status: 'pending' | 'delivered';
}

function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function privateSigningKey(value = getSecret('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM')): KeyObject {
  if (!value) throw new Error('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM is required');
  const key = createPrivateKey(normalizePem(value));
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM must be an Ed25519 key');
  }
  return key;
}

function publicSigningKey(value = getSecret('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM')): KeyObject {
  if (!value) throw new Error('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM is required');
  const key = createPublicKey(normalizePem(value));
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM must be an Ed25519 key');
  }
  return key;
}

export function assertAuditCheckpointSigningConfigured(
  privatePem = getSecret('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM'),
  publicPem = getSecret('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM')
): void {
  const privateKey = privateSigningKey(privatePem);
  const publicKey = publicSigningKey(publicPem);
  const probe = Buffer.from('dtg-audit-checkpoint-key-self-test-v1', 'utf8');
  const signature = sign(null, probe, privateKey);
  if (!verify(null, probe, publicKey, signature)) {
    throw new Error('Audit checkpoint keys do not form a matching Ed25519 pair');
  }
}

export function signAuditCheckpoint(
  payload: AuditCheckpointPayload,
  privatePem = getSecret('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM'),
  publicPem = getSecret('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM')
): SignedAuditCheckpoint {
  const canonicalPayload = JSON.stringify(payload);
  const checkpointHash = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  const signature = sign(null, Buffer.from(canonicalPayload, 'utf8'), privateSigningKey(privatePem));
  const publicKeyPem = publicSigningKey(publicPem)
    .export({ type: 'spki', format: 'pem' })
    .toString();
  return {
    payload,
    checkpointHash,
    signature: signature.toString('base64url'),
    algorithm: 'Ed25519',
    publicKeyPem,
  };
}

async function createPendingCheckpoint(endpointUrl: string): Promise<AuditCheckpointRow | null> {
  return transaction(async client => {
    await client.query(`SELECT pg_advisory_xact_lock(${CHECKPOINT_LOCK}::bigint)`);
    const pending = await client.query<AuditCheckpointRow>(
      `SELECT id, audit_id, checkpoint_hash, payload, signature_base64,
              signing_public_key_pem, endpoint_url, delivery_status
         FROM audit_checkpoints
        WHERE delivery_status = 'pending'
        ORDER BY id ASC LIMIT 1`
    );
    if (pending.rows[0]) return pending.rows[0];

    const auditHead = await client.query<{ id: string; row_hash: string }>(
      'SELECT id, row_hash FROM audit_log ORDER BY id DESC LIMIT 1'
    );
    if (!auditHead.rows[0]) return null;
    const previous = await client.query<{ audit_id: string; checkpoint_hash: string }>(
      'SELECT audit_id, checkpoint_hash FROM audit_checkpoints ORDER BY id DESC LIMIT 1'
    );
    if (previous.rows[0] && BigInt(previous.rows[0].audit_id) >= BigInt(auditHead.rows[0].id)) {
      return null;
    }

    const deploymentId = process.env.AUDIT_CHECKPOINT_DEPLOYMENT_ID?.trim();
    if (!deploymentId || !/^[A-Za-z0-9._:-]{3,128}$/.test(deploymentId)) {
      throw new Error('AUDIT_CHECKPOINT_DEPLOYMENT_ID is invalid');
    }
    const payload: AuditCheckpointPayload = {
      version: 1,
      deploymentId,
      auditId: String(auditHead.rows[0].id),
      auditRowHash: auditHead.rows[0].row_hash,
      previousCheckpointHash: previous.rows[0]?.checkpoint_hash ?? GENESIS_CHECKPOINT,
      createdAt: new Date().toISOString(),
    };
    const signed = signAuditCheckpoint(payload);
    const result = await client.query<AuditCheckpointRow>(
      `INSERT INTO audit_checkpoints
         (audit_id, audit_row_hash, previous_checkpoint_hash, checkpoint_hash,
          payload, signature_base64, signing_public_key_pem, endpoint_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, audit_id, checkpoint_hash, payload, signature_base64,
                 signing_public_key_pem, endpoint_url, delivery_status`,
      [
        payload.auditId,
        payload.auditRowHash,
        payload.previousCheckpointHash,
        signed.checkpointHash,
        JSON.stringify(payload),
        signed.signature,
        signed.publicKeyPem,
        endpointUrl,
      ]
    );
    return result.rows[0];
  });
}

async function readLimitedResponse(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    const value = chunk.value;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Audit checkpoint response exceeded the size limit');
    }
    chunks.push(Buffer.from(value));
    chunk = await reader.read();
  }
  return Buffer.concat(chunks);
}

export async function publishAuditCheckpoint(): Promise<string | null> {
  const rawEndpoint = process.env.AUDIT_CHECKPOINT_URL;
  const endpoint = await assertSafeOutboundHttpsUrl(
    rawEndpoint,
    'AUDIT_CHECKPOINT_ALLOWED_HOSTS',
    'Audit checkpoint URL'
  );
  const bearer = getSecret('AUDIT_CHECKPOINT_BEARER_TOKEN')?.trim();
  if (!bearer) throw new Error('AUDIT_CHECKPOINT_BEARER_TOKEN is required');

  const checkpoint = await createPendingCheckpoint(endpoint);
  if (!checkpoint) return null;

  try {
    const response = await fetch(checkpoint.endpoint_url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': checkpoint.checkpoint_hash,
      },
      body: JSON.stringify({
        payload: JSON.parse(checkpoint.payload),
        checkpointHash: checkpoint.checkpoint_hash,
        signature: checkpoint.signature_base64,
        algorithm: 'Ed25519',
        publicKeyPem: checkpoint.signing_public_key_pem,
      }),
    });
    const responseBody = await readLimitedResponse(response);
    if (!response.ok && response.status !== 409) {
      throw new Error(`Audit checkpoint endpoint returned HTTP ${response.status}`);
    }
    const responseHash = createHash('sha256').update(responseBody).digest('hex');
    await pool.query(
      `UPDATE audit_checkpoints
          SET delivery_status = 'delivered', delivery_attempts = delivery_attempts + 1,
              delivered_at = NOW(), response_hash = $2, last_error_hash = NULL
        WHERE id = $1 AND delivery_status = 'pending'`,
      [checkpoint.id, responseHash]
    );
    return checkpoint.checkpoint_hash;
  } catch (error) {
    const description = error instanceof Error
      ? `${error.name}:${error.message}`
      : 'unknown checkpoint delivery error';
    const errorHash = createHash('sha256').update(description, 'utf8').digest('hex');
    await pool.query(
      `UPDATE audit_checkpoints
          SET delivery_attempts = delivery_attempts + 1, last_error_hash = $2
        WHERE id = $1 AND delivery_status = 'pending'`,
      [checkpoint.id, errorHash]
    );
    throw error;
  }
}

export class AuditCheckpointService {
  private static interval: NodeJS.Timeout | null = null;
  private static running = false;

  static start(): void {
    if (this.interval) return;
    const seconds = Number.parseInt(process.env.AUDIT_CHECKPOINT_INTERVAL_SECONDS ?? '300', 10);
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86_400) {
      throw new Error('AUDIT_CHECKPOINT_INTERVAL_SECONDS must be between 60 and 86400');
    }
    const run = async () => {
      if (this.running) return;
      this.running = true;
      try {
        const hash = await publishAuditCheckpoint();
        if (hash) console.log(`[AuditCheckpoint] Published ${hash.slice(0, 16)}…`);
      } catch (error) {
        console.error('[AuditCheckpoint] Publication failed:',
          error instanceof Error ? error.message : 'unknown error');
      } finally {
        this.running = false;
      }
    };
    this.interval = setInterval(run, seconds * 1000);
    void run();
  }

  static stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }
}
