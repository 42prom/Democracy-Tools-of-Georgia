process.env.NODE_ENV = 'test';

import { assertAnonymousBallotEnvelope } from '../src/routes/polls';

describe('anonymous ballot envelope', () => {
  it.each([
    'nullifier',
    'userId',
    'user_id',
    'name',
    'firstName',
    'lastName',
    'personalNumber',
    'pnHash',
    'walletAddress',
    'pushToken',
  ])('rejects forbidden top-level field %s', field => {
    expect(() =>
      assertAnonymousBallotEnvelope({
        pollId: 'poll-1',
        optionId: 'option-1',
        [field]: 'identity-bearing-value',
      })
    ).toThrow(`Forbidden identity-bearing ballot field: ${field}`);
  });

  it('accepts the minimal vote and survey transport envelopes', () => {
    expect(() =>
      assertAnonymousBallotEnvelope({
        pollId: 'poll-1',
        optionId: 'option-1',
        nonce: 'nonce',
        timestampBucket: 1,
        signature: 'signature',
      })
    ).not.toThrow();
    expect(() =>
      assertAnonymousBallotEnvelope({
        responses: [{ questionId: 'q1', textResponse: 'answer' }],
        nonce: 'nonce',
        timestampBucket: 1,
        signature: 'signature',
      })
    ).not.toThrow();
  });
});
