process.env.NODE_ENV = 'test';
process.env.NULLIFIER_SECRET = 'idempotency-test-secret-at-least-thirty-two-bytes';

jest.mock('../src/db/client', () => ({ query: jest.fn() }));

import { query } from '../src/db/client';
import {
  buildIdempotencyRequestFingerprint,
  buildIdempotencyStorageKey,
  checkIdempotency,
} from '../src/middleware/idempotency';

const mockedQuery = query as jest.Mock;

function request(body: unknown, key = 'vote-poll-1-client-key') {
  return {
    get: (name: string) =>
      ['Idempotency-Key', 'X-Idempotency-Key'].includes(name) ? key : undefined,
    credential: { sub: '11111111-1111-4111-8111-111111111111' },
    originalUrl: '/api/v1/polls/poll-1/vote',
    body,
  } as any;
}

function response() {
  const res: any = {
    statusCode: 200,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(() => res),
  };
  return res;
}

describe('privacy-safe idempotency middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores no identity, ballot body, raw key, or receipt metadata', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ key: 'stored' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const ballot = {
      pollId: 'poll-1',
      optionId: 'secret-option',
      responses: [{ questionId: 'q1', textResponse: 'secret response' }],
    };
    const next = jest.fn();
    const res = response();
    await checkIdempotency(request(ballot), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const insertCall = mockedQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    const [storageKey, userId, path, params] = insertCall![1];
    expect(storageKey).toMatch(/^[a-f0-9]{64}$/);
    expect(storageKey).not.toContain('client-key');
    expect(userId).toBeNull();
    expect(path).toBe('/api/v1/polls/poll-1/vote');
    expect(params).toEqual({ requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(params)).not.toContain('secret-option');
    expect(JSON.stringify(params)).not.toContain('secret response');

    res.json({
      receipt: { voteId: 'identity-linking-vote-id' },
      merkleRoot: 'secret-merkle-root',
    });
    await Promise.resolve();
    const updateCall = mockedQuery.mock.calls.find(([sql]) => sql.includes('UPDATE idempotency_keys'));
    expect(updateCall?.[1]).toEqual([
      200,
      { success: true, duplicate: true },
      storageKey,
    ]);
    expect(JSON.stringify(updateCall?.[1])).not.toContain('identity-linking-vote-id');
    expect(JSON.stringify(updateCall?.[1])).not.toContain('secret-merkle-root');
  });

  it('rejects reuse of a key with a different request body', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          response_code: 200,
          response_body: { success: true },
          params: { requestFingerprint: '0'.repeat(64) },
        }],
        rowCount: 1,
      });
    const res = response();
    const next = jest.fn();

    await checkIdempotency(request({ optionId: 'different-option' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Idempotency-Key was already used for a different request',
    });
  });

  it('scopes storage keys by user and path and fingerprints body changes', () => {
    const base = buildIdempotencyStorageKey('user-1', '/vote', 'client-key');
    expect(buildIdempotencyStorageKey('user-2', '/vote', 'client-key')).not.toBe(base);
    expect(buildIdempotencyStorageKey('user-1', '/survey', 'client-key')).not.toBe(base);
    expect(buildIdempotencyRequestFingerprint({ optionId: 'a' })).not.toBe(
      buildIdempotencyRequestFingerprint({ optionId: 'b' })
    );
  });

  it('rejects oversized or unsafe client keys before touching storage', async () => {
    const res = response();
    const next = jest.fn();
    await checkIdempotency(request({}, 'unsafe key with spaces'), res, next);
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
