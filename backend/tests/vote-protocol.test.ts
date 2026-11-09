/**
 * Vote Protocol Integration Tests - Comprehensive Suite
 */

process.env.NODE_ENV = 'test';
process.env.NULLIFIER_SECRET = 'test-secret';

jest.mock('../src/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../src/services/security', () => ({
  SecurityService: {
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    getDeviceHash: jest.fn().mockReturnValue('mock-hash'),
    getVoterHash: jest.fn().mockReturnValue('mock-hash'),
    checkDeviceVoterLimit: jest.fn().mockResolvedValue(undefined),
    recordDeviceVoter: jest.fn().mockResolvedValue(undefined),
    logAuditEvent: jest.fn().mockResolvedValue(undefined),
    logAuditEventInTransaction: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/nonce', () => {
  const m = { verifyAndConsume: jest.fn() };
  return {
    __esModule: true,
    default: m,
    ...m
  };
});

jest.mock('../src/services/nullifier', () => ({
  computeNullifier: jest.fn().mockResolvedValue('mock-nullifier-abcdef123456'),
}));

jest.mock('../src/services/receiptSigner', () => ({
  signReceipt: jest.fn().mockReturnValue({
    payload: { pollId: 'p1', leafHash: 'l1', merkleRoot: 'r1', ts: 't1' },
    signature: 'mock-sig', algorithm: 'Ed25519', version: 1
  }),
}));

import { buildVoteAttestationBinding, submitVote } from '../src/services/voting';
import { query, transaction } from '../src/db/client';
import NonceService from '../src/services/nonce';
import { signReceipt } from '../src/services/receiptSigner';

const mockedQuery = query as jest.Mock;
const mockedTransaction = transaction as jest.Mock;
const mockedNonce = NonceService.verifyAndConsume as jest.Mock;
const mockedSignReceipt = signReceipt as jest.Mock;

describe('Vote Protocol (Comprehensive)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNonce.mockResolvedValue(true);
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const validVote = {
    pollId: 'p1',
    optionId: 'o1',
    nonce: 'n1',
    signature: 'mock-client-signature',
    device: { id: 'd1', platform: 'ios' },
    attestation: { token: 't1' }
  };

  const userContext = { 
    sub: 'u1', 
    data: { 
      region: 'georgia',
      gender: 'male',
      age_bucket: '18-24'
    } 
  };

  it('cryptographically binds attestation to nonce, poll, option, and time bucket', () => {
    const base = {
      nonce: 'nonce-1',
      pollId: 'poll-1',
      optionId: 'option-1',
      timestampBucket: 123,
    };
    const binding = buildVoteAttestationBinding(base);
    expect(binding).toMatch(/^[a-f0-9]{64}$/);
    expect(buildVoteAttestationBinding(base)).toBe(binding);
    expect(buildVoteAttestationBinding({ ...base, optionId: 'option-2' })).not.toBe(binding);
    expect(buildVoteAttestationBinding({ ...base, timestampBucket: 124 })).not.toBe(binding);
  });

  it('should pass happy path (200 OK)', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) {
        return { rows: [{ id: 'p1', status: 'active', audience_rules: {}, rewards_enabled: false }], rowCount: 1 };
      }
      if (q.includes('FROM poll_options')) {
        return { rows: [{ id: 'o1' }], rowCount: 1 };
      }
      if (q.includes('FROM settings')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('FROM poll_participants')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    let transactionQuery: jest.Mock;
    mockedTransaction.mockImplementation(async (cb) => {
      transactionQuery = jest.fn()
          .mockImplementation(async (q) => {
            if (q.includes('RETURNING id')) return { rows: [{ id: 'v1' }], rowCount: 1 };
            if (q.includes('FROM polls')) {
              return {
                rows: [{ status: 'active', start_at: null, end_at: null, rewards_enabled: false }],
                rowCount: 1,
              };
            }
            if (q.includes('FROM votes')) {
              return { rows: [{ vote_hash: 'a'.repeat(64) }], rowCount: 1 };
            }
            return { rows: [], rowCount: 1 };
          });
      const client = { query: transactionQuery };
      return await cb(client as any);
    });

    const res = await submitVote(validVote as any, userContext as any);
    expect(res).toBeDefined();
    expect(res.txHash).toBe('v1');
    expect(transactionQuery!).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['p1']
    );
    expect(transactionQuery!.mock.calls.some(([sql]) =>
      sql.includes('ORDER BY bucket_ts ASC, id ASC')
    )).toBe(true);
  });

  it('should fail if nonce is used', async () => {
    mockedNonce.mockResolvedValue(false);
    await expect(submitVote(validVote as any, userContext as any)).rejects.toThrow();
  });

  it('should fail if poll not active', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await expect(submitVote(validVote as any, userContext as any)).rejects.toThrow();
  });

  it('should fail if region mismatch', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) {
        return { rows: [{ id: 'p1', status: 'active', audience_rules: { regions: ['tbilisi'] } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    await expect(submitVote(validVote as any, userContext as any)).rejects.toThrow();
  });

  it('should fail on double vote', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) return { rows: [{ id: 'p1', status: 'active', audience_rules: {} }], rowCount: 1 };
      if (q.includes('FROM poll_options')) return { rows: [{ id: 'o1' }], rowCount: 1 };
      if (q.includes('FROM settings')) return { rows: [], rowCount: 0 };
      if (q.includes('FROM poll_participants')) return { rows: [{ id: 'v1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(submitVote(validVote as any, userContext as any)).rejects.toThrow();
  });

  it('should fail on invalid option', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) return { rows: [{ id: 'p1', status: 'active', audience_rules: {} }], rowCount: 1 };
      if (q.includes('FROM poll_options')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await expect(submitVote(validVote as any, userContext as any)).rejects.toThrow();
  });

  it('should abort instead of returning an unsigned receipt when signing fails', async () => {
    mockedQuery.mockImplementation(async (q) => {
      if (q.includes('FROM polls')) {
        return { rows: [{ id: 'p1', status: 'active', audience_rules: {}, rewards_enabled: false }], rowCount: 1 };
      }
      if (q.includes('FROM poll_options')) return { rows: [{ id: 'o1' }], rowCount: 1 };
      if (q.includes('FROM settings')) return { rows: [], rowCount: 0 };
      if (q.includes('FROM poll_participants')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    mockedTransaction.mockImplementation(async (callback) => {
      const client = {
        query: jest.fn().mockImplementation(async (q) => {
          if (q.includes('RETURNING id')) return { rows: [{ id: 'v1' }], rowCount: 1 };
          if (q.includes('FROM polls')) {
            return {
              rows: [{ status: 'active', start_at: null, end_at: null, rewards_enabled: false }],
              rowCount: 1,
            };
          }
          if (q.includes('FROM votes')) {
            return { rows: [{ vote_hash: 'a'.repeat(64) }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        }),
      };
      return callback(client as any);
    });
    mockedSignReceipt.mockImplementationOnce(() => {
      throw new Error('signer unavailable');
    });

    await expect(submitVote(validVote as any, userContext as any))
      .rejects.toThrow('signer unavailable');
  });
});
