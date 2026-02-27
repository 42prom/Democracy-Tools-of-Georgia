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

import { submitVote } from '../src/services/voting';
import { query, transaction } from '../src/db/client';
import NonceService from '../src/services/nonce';

const mockedQuery = query as jest.Mock;
const mockedTransaction = transaction as jest.Mock;
const mockedNonce = NonceService.verifyAndConsume as jest.Mock;

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

    mockedTransaction.mockImplementation(async (cb) => {
      const client = { 
        query: jest.fn()
          .mockImplementation(async (q) => {
            if (q.includes('RETURNING id')) return { rows: [{ id: 'v1' }], rowCount: 1 };
            if (q.includes('FROM votes')) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: 1 };
          })
      };
      return await cb(client as any);
    });

    const res = await submitVote(validVote as any, userContext as any);
    expect(res).toBeDefined();
    expect(res.txHash).toBe('v1');
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
});
