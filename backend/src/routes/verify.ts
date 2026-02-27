import { Router, Request, Response } from 'express';
import { verifyReceipt, getPublicKeyPem, SignedReceipt } from '../services/receiptSigner';
import { verifyMerkleProof, MerkleProofStep } from '../services/merkle';
import { query } from '../db/client';

/**
 * Public Verification Routes
 *
 * These endpoints are unauthenticated and intended for any voter or
 * independent auditor to verify vote receipts and Merkle inclusion.
 *
 * GET  /api/v1/public/receipt-pubkey
 *   Returns the Ed25519 public key used to sign all vote receipts.
 *   Anyone can use this to verify receipt signatures.
 *
 * POST /api/v1/public/verify-receipt
 *   Accepts a signed receipt JSON and verifies its Ed25519 signature.
 *   Optionally also verifies Merkle inclusion if a proof is supplied.
 *
 * GET  /api/v1/public/merkle-root/:pollId
 *   Returns the current Merkle root for a poll from the DB, plus the
 *   latest on-chain anchor transaction hash.
 */

const router = Router();

/**
 * GET /api/v1/public/receipt-pubkey
 * Returns the Ed25519 public key PEM for receipt verification.
 */
router.get('/receipt-pubkey', (_req: Request, res: Response) => {
  try {
    const pem = getPublicKeyPem();
    res.json({
      algorithm: 'Ed25519',
      format: 'SPKI/PEM',
      publicKey: pem,
      usage: 'Verify vote receipt signatures issued by this server.',
    });
  } catch (err: any) {
    res.status(503).json({ error: 'Receipt signing key not configured on this server.' });
  }
});

/**
 * POST /api/v1/public/verify-receipt
 * Body: { receipt: SignedReceipt, merkleProof?: MerkleProofStep[], merkleRoot?: string }
 * Returns: { valid: boolean, details: {...} }
 */
router.post('/verify-receipt', async (req: Request, res: Response) => {
  try {
    const { receipt, merkleProof, merkleRoot } = req.body as {
      receipt: SignedReceipt;
      merkleProof?: MerkleProofStep[];
      merkleRoot?: string;
    };

    if (!receipt || !receipt.payload || !receipt.signature) {
      return res.status(400).json({ error: 'Missing receipt object in request body.' });
    }

    // 1. Verify Ed25519 signature
    const signatureValid = verifyReceipt(receipt);

    // 2. Optionally verify Merkle inclusion
    let merkleValid: boolean | null = null;
    let merkleDetails: string | null = null;

    if (merkleProof && merkleRoot) {
      merkleValid = verifyMerkleProof(receipt.payload.leafHash, merkleProof, merkleRoot);
      merkleDetails = merkleValid
        ? 'Leaf hash is included in the provided Merkle root.'
        : 'Leaf hash FAILED Merkle inclusion verification.';
    }

    // 3. Optionally cross-check root against DB anchor
    let onChainAnchor: string | null = null;
    if (merkleRoot) {
      const anchorRes = await query(
        `SELECT tx_hash, confirmed_at FROM vote_anchors
         WHERE chain_hash = $1 AND status = 'confirmed'
         ORDER BY confirmed_at DESC LIMIT 1`,
        [merkleRoot]
      );
      if (anchorRes.rows.length > 0) {
        onChainAnchor = anchorRes.rows[0].tx_hash;
      }
    }

    return res.json({
      valid: signatureValid && (merkleValid === null || merkleValid),
      signatureValid,
      merkleValid,
      merkleDetails,
      onChainAnchor,
      payload: receipt.payload,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
});

/**
 * GET /api/v1/public/merkle-root/:pollId
 * Returns the current Merkle root for a poll and its on-chain anchor.
 */
router.get('/merkle-root/:pollId', async (req: Request, res: Response) => {
  try {
    const { pollId } = req.params;

    // Fetch Merkle root from polls table
    const pollRes = await query(
      `SELECT id, merkle_root FROM polls WHERE id = $1`,
      [pollId]
    );

    if (pollRes.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const merkleRoot = pollRes.rows[0].merkle_root;

    // Fetch latest on-chain anchor for this poll
    const anchorRes = await query(
      `SELECT chain_hash, tx_hash, confirmed_at FROM vote_anchors
       WHERE poll_id = $1 AND status = 'confirmed'
       ORDER BY confirmed_at DESC LIMIT 1`,
      [pollId]
    );

    const anchor = anchorRes.rows[0] ?? null;

    return res.json({
      pollId,
      merkleRoot,
      onChainAnchor: anchor
        ? {
            anchoredMerkleRoot: anchor.chain_hash,
            txHash: anchor.tx_hash,
            confirmedAt: anchor.confirmed_at,
            matchesCurrentRoot: anchor.chain_hash === merkleRoot,
          }
        : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
