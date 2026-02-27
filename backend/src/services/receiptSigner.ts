import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  KeyObject,
} from 'crypto';

/**
 * Receipt Signer Service
 *
 * Issues Ed25519-signed cryptographic receipts to voters after a successful vote.
 * The receipt payload commits to: voteId, pollId, Merkle leaf hash, and timestamp.
 * The corresponding public key is published at GET /api/v1/public/receipt-pubkey
 * so any third party can independently verify the receipt.
 *
 * Environment variables required:
 *   RECEIPT_PRIVATE_KEY_PEM — Ed25519 private key in PEM format
 *   RECEIPT_PUBLIC_KEY_PEM  — Matching public key in PEM format
 *
 * Generate a keypair once with:
 *   node -e "
 *     const {generateKeyPairSync} = require('crypto');
 *     const {privateKey, publicKey} = generateKeyPairSync('ed25519', {
 *       privateKeyEncoding: {type:'pkcs8', format:'pem'},
 *       publicKeyEncoding:  {type:'spki',  format:'pem'},
 *     });
 *     console.log('PRIVATE:\n', privateKey);
 *     console.log('PUBLIC:\n', publicKey);
 *   "
 */

export interface ReceiptPayload {
  voteId: string;
  pollId: string;
  leafHash: string;
  merkleRoot: string;
  ts: string; // ISO timestamp (bucketed, not exact)
}

export interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string; // base64url Ed25519 signature
  algorithm: 'Ed25519';
  version: 1;
}

/** Load and validate the private key from environment. */
function getPrivateKey(): KeyObject {
  const pem = process.env.RECEIPT_PRIVATE_KEY_PEM;
  if (!pem) {
    throw new Error(
      '[ReceiptSigner] RECEIPT_PRIVATE_KEY_PEM environment variable is required.'
    );
  }
  return createPrivateKey(pem);
}

/** Load and validate the public key from environment. */
function getPublicKey(): KeyObject {
  const pem = process.env.RECEIPT_PUBLIC_KEY_PEM;
  if (!pem) {
    throw new Error(
      '[ReceiptSigner] RECEIPT_PUBLIC_KEY_PEM environment variable is required.'
    );
  }
  return createPublicKey(pem);
}

/**
 * Sign a vote receipt.
 *
 * @param payload - The receipt payload to sign.
 * @returns A SignedReceipt object containing payload + base64url signature.
 */
export function signReceipt(payload: ReceiptPayload): SignedReceipt {
  const privateKey = getPrivateKey();
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  // Ed25519 uses no message digest — pass null
  const sig = sign(null, data, privateKey);

  return {
    payload,
    signature: sig.toString('base64url'),
    algorithm: 'Ed25519',
    version: 1,
  };
}

/**
 * Verify a signed receipt.
 *
 * @param receipt - The full SignedReceipt object.
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyReceipt(receipt: SignedReceipt): boolean {
  try {
    if (receipt.version !== 1 || receipt.algorithm !== 'Ed25519') return false;
    const publicKey = getPublicKey();
    const data = Buffer.from(JSON.stringify(receipt.payload), 'utf8');
    const sig = Buffer.from(receipt.signature, 'base64url');
    return verify(null, data, publicKey, sig);
  } catch {
    return false;
  }
}

/**
 * Get public key in PEM format for publication at the well-known endpoint.
 */
export function getPublicKeyPem(): string {
  const pem = process.env.RECEIPT_PUBLIC_KEY_PEM;
  if (!pem) {
    throw new Error(
      '[ReceiptSigner] RECEIPT_PUBLIC_KEY_PEM environment variable is required.'
    );
  }
  return pem;
}

/**
 * Generate a new Ed25519 keypair (utility — run once to bootstrap keys).
 * Output both keys to stdout in PEM format.
 */
export function generateReceiptKeypair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}
