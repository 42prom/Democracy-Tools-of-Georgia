const mockedTransaction = jest.fn();

jest.mock('../src/db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
  transaction: mockedTransaction,
}));

import { SecurityService } from '../src/services/security';

describe('audit hash-chain locking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes standalone audit events inside a serialized transaction', async () => {
    const clientQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT row_hash')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });
    mockedTransaction.mockImplementation(async callback => callback({ query: clientQuery }));

    await SecurityService.logAuditEvent('TEST_EVENT', { safe: true });

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(clientQuery.mock.calls[1][0]).toContain('SELECT row_hash');
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO audit_log');
  });

  it('uses the same lock inside a caller-owned transaction', async () => {
    const clientQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT row_hash')) {
        return { rows: [{ row_hash: 'b'.repeat(64) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await SecurityService.logAuditEventInTransaction(
      { query: clientQuery },
      'VOTE_SUBMITTED',
      { voteId: 'vote-1' }
    );

    expect(clientQuery.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    const insertCall = clientQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_log'));
    expect(insertCall?.[1]?.[2]).toBe('b'.repeat(64));
  });
});
