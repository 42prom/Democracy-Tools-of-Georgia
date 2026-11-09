import { generateKeyPairSync, verify } from 'node:crypto';
import {
  assertAuditCheckpointSigningConfigured,
  signAuditCheckpoint,
  type AuditCheckpointPayload,
} from '../src/services/auditCheckpoint';

function keyPair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const payload: AuditCheckpointPayload = {
  version: 1,
  deploymentId: 'dtg-test',
  auditId: '42',
  auditRowHash: 'a'.repeat(64),
  previousCheckpointHash: 'b'.repeat(64),
  createdAt: '2026-09-04T00:00:00.000Z',
};

describe('signed external audit checkpoints', () => {
  it('creates an independently verifiable Ed25519 checkpoint', () => {
    const keys = keyPair();
    const checkpoint = signAuditCheckpoint(payload, keys.privateKey, keys.publicKey);
    expect(checkpoint.checkpointHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verify(
      null,
      Buffer.from(JSON.stringify(checkpoint.payload), 'utf8'),
      keys.publicKey,
      Buffer.from(checkpoint.signature, 'base64url')
    )).toBe(true);
  });

  it('rejects mismatched or non-Ed25519 checkpoint keys', () => {
    const first = keyPair();
    const second = keyPair();
    expect(() => assertAuditCheckpointSigningConfigured(
      first.privateKey,
      second.publicKey
    )).toThrow(/matching Ed25519 pair/);

    const ec = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    expect(() => assertAuditCheckpointSigningConfigured(
      ec.privateKey,
      ec.publicKey
    )).toThrow(/must be an Ed25519 key/);
  });
});
