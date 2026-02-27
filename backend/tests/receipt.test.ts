import { signReceipt, verifyReceipt, generateReceiptKeypair, SignedReceipt, ReceiptPayload } from '../src/services/receiptSigner';

/**
 * Unit tests for the Ed25519 cryptographic receipt signer.
 */

// Generate a fresh test keypair for each test run
const { privateKeyPem, publicKeyPem } = generateReceiptKeypair();

// Set env before tests
beforeAll(() => {
  process.env.RECEIPT_PRIVATE_KEY_PEM = privateKeyPem;
  process.env.RECEIPT_PUBLIC_KEY_PEM = publicKeyPem;
});

afterAll(() => {
  delete process.env.RECEIPT_PRIVATE_KEY_PEM;
  delete process.env.RECEIPT_PUBLIC_KEY_PEM;
});

const samplePayload: ReceiptPayload = {
  voteId: 'vote-uuid-001',
  pollId: 'poll-uuid-001',
  leafHash: 'a1b2c3d4e5f6'.repeat(4) + 'aabb',
  merkleRoot: 'deadbeef'.repeat(8),
  ts: '2025-01-01T12:00:00.000Z',
};

describe('ReceiptSigner', () => {

  describe('signReceipt', () => {
    it('should return a SignedReceipt with algorithm Ed25519 and version 1', () => {
      const receipt = signReceipt(samplePayload);
      expect(receipt.algorithm).toBe('Ed25519');
      expect(receipt.version).toBe(1);
    });

    it('should produce a non-empty base64url signature', () => {
      const receipt = signReceipt(samplePayload);
      expect(receipt.signature).toBeTruthy();
      expect(receipt.signature.length).toBeGreaterThan(0);
      // Ed25519 sig is 64 bytes → 86 base64url chars
      expect(receipt.signature.length).toBeGreaterThanOrEqual(80);
    });

    it('should embed the payload unchanged in the receipt', () => {
      const receipt = signReceipt(samplePayload);
      expect(receipt.payload).toEqual(samplePayload);
    });

    it('should produce different signatures for different payloads', () => {
      const r1 = signReceipt({ ...samplePayload, voteId: 'vote-A' });
      const r2 = signReceipt({ ...samplePayload, voteId: 'vote-B' });
      expect(r1.signature).not.toBe(r2.signature);
    });
  });

  describe('verifyReceipt', () => {
    it('should verify a legitimately signed receipt', () => {
      const receipt = signReceipt(samplePayload);
      expect(verifyReceipt(receipt)).toBe(true);
    });

    it('should reject a receipt with a tampered payload', () => {
      const receipt = signReceipt(samplePayload);
      const tampered: SignedReceipt = {
        ...receipt,
        payload: { ...receipt.payload, pollId: 'attacker-controlled-poll' },
      };
      expect(verifyReceipt(tampered)).toBe(false);
    });

    it('should reject a receipt with a corrupted signature', () => {
      const receipt = signReceipt(samplePayload);
      const corrupted: SignedReceipt = {
        ...receipt,
        signature: receipt.signature.slice(0, -4) + 'AAAA',
      };
      expect(verifyReceipt(corrupted)).toBe(false);
    });

    it('should reject a receipt with an empty signature', () => {
      const receipt = signReceipt(samplePayload);
      expect(verifyReceipt({ ...receipt, signature: '' })).toBe(false);
    });

    it('should reject a receipt with wrong version', () => {
      const receipt = signReceipt(samplePayload);
      // Cast to bypass TS type guard
      expect(verifyReceipt({ ...receipt, version: 2 as any })).toBe(false);
    });

    it('should reject a receipt with wrong algorithm', () => {
      const receipt = signReceipt(samplePayload);
      expect(verifyReceipt({ ...receipt, algorithm: 'RSA' as any })).toBe(false);
    });

    it('should verify receipts for 50 distinct payloads (stability test)', () => {
      for (let i = 0; i < 50; i++) {
        const payload: ReceiptPayload = {
          ...samplePayload,
          voteId: `vote-${i}`,
          ts: new Date(Date.now() + i * 1000).toISOString(),
        };
        const receipt = signReceipt(payload);
        expect(verifyReceipt(receipt)).toBe(true);
      }
    });
  });
});
