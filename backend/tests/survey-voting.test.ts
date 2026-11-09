process.env.NODE_ENV = 'test';

jest.mock('../src/db/client', () => ({
  transaction: jest.fn(),
}));

jest.mock('../src/services/nullifier', () => ({
  computeNullifier: jest.fn().mockResolvedValue('a'.repeat(64)),
}));

jest.mock('../src/services/voting', () => ({
  buildDemographicsSnapshot: jest.fn().mockReturnValue({
    region: 'reg_tbilisi',
    age_bucket: '25-34',
    gender: 'M',
  }),
  enforceAudienceEligibility: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/security', () => ({
  SecurityService: {
    logAuditEventInTransaction: jest.fn().mockResolvedValue(undefined),
  },
}));

import { transaction } from '../src/db/client';
import {
  buildSurveyAttestationOption,
  buildSurveyResponseDigest,
  submitSurveyResponses,
} from '../src/services/surveyVoting';
import { VotingCredential } from '../src/types/credentials';

const mockedTransaction = transaction as jest.Mock;

const credential: VotingCredential = {
  iss: 'test',
  sub: '11111111-1111-4111-8111-111111111111',
  data: {
    age_bucket: '25-34',
    gender: 'M',
    region: 'reg_tbilisi',
    citizenship: 'GEO',
  },
  exp: Math.floor(Date.now() / 1000) + 60,
};

function buildClientQuery() {
  return jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM polls')) {
      return {
        rows: [{
          id: 'poll-1',
          start_at: null,
          end_at: null,
          audience_rules: {},
          rewards_enabled: false,
          reward_amount: null,
          reward_token: 'DTG',
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM survey_questions') && !sql.includes('INNER JOIN')) {
      return {
        rows: [
          { id: 'question-1', question_type: 'single_choice', required: true, config: {} },
          { id: 'question-2', question_type: 'text', required: true, config: { maxLength: 50 } },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('FROM question_options')) {
      return { rows: [{ question_id: 'question-1', id: 'option-1' }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO survey_nullifiers')) {
      return { rows: [{ submission_id: '22222222-2222-4222-8222-222222222222' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
}

describe('atomic survey submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates and records a complete survey through one transaction', async () => {
    const clientQuery = buildClientQuery();
    mockedTransaction.mockImplementation(async callback => callback({ query: clientQuery }));

    const result = await submitSurveyResponses(
      'poll-1',
      [
        { questionId: 'question-1', selectedOptionId: 'option-1' },
        { questionId: 'question-2', textResponse: 'A valid response' },
      ],
      credential
    );

    expect(result).toEqual({
      txHash: '22222222-2222-4222-8222-222222222222',
      responseCount: 2,
    });
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO survey_nullifiers'),
      ['poll-1', 'a'.repeat(64)]
    );
    expect(clientQuery.mock.calls.filter(([sql]) => sql.includes('INSERT INTO survey_responses')))
      .toHaveLength(2);
  });

  it('rejects an unknown question before reserving the nullifier', async () => {
    const clientQuery = buildClientQuery();
    mockedTransaction.mockImplementation(async callback => callback({ query: clientQuery }));

    await expect(submitSurveyResponses(
      'poll-1',
      [
        { questionId: 'question-1', selectedOptionId: 'option-1' },
        { questionId: 'question-from-another-poll', textResponse: 'invalid' },
      ],
      credential
    )).rejects.toMatchObject({ statusCode: 400 });

    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO survey_nullifiers')))
      .toBe(false);
  });

  it('rejects missing required questions and cross-question options', async () => {
    const missingClient = buildClientQuery();
    mockedTransaction.mockImplementationOnce(async callback => callback({ query: missingClient }));
    await expect(submitSurveyResponses(
      'poll-1',
      [{ questionId: 'question-1', selectedOptionId: 'option-1' }],
      credential
    )).rejects.toMatchObject({ statusCode: 400 });

    const invalidOptionClient = buildClientQuery();
    mockedTransaction.mockImplementationOnce(async callback => callback({ query: invalidOptionClient }));
    await expect(submitSurveyResponses(
      'poll-1',
      [
        { questionId: 'question-1', selectedOptionId: 'foreign-option' },
        { questionId: 'question-2', textResponse: 'valid' },
      ],
      credential
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps the database uniqueness barrier to an idempotent conflict', async () => {
    const normalQuery = buildClientQuery();
    mockedTransaction.mockImplementation(async callback => callback({
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO survey_nullifiers')) {
          throw { code: '23505', constraint: 'survey_nullifiers_pkey' };
        }
        return normalQuery(sql, params);
      }),
    }));

    await expect(submitSurveyResponses(
      'poll-1',
      [
        { questionId: 'question-1', selectedOptionId: 'option-1' },
        { questionId: 'question-2', textResponse: 'valid' },
      ],
      credential
    )).rejects.toMatchObject({ statusCode: 409 });
  });

  it('binds attestation to a canonical digest of every survey answer', () => {
    const first = [
      { questionId: 'q2', textResponse: 'გამარჯობა' },
      { questionId: 'q1', selectedOptionIds: ['b', 'a'] },
    ];
    const reordered = [
      { questionId: 'q1', selectedOptionIds: ['a', 'b'] },
      { questionId: 'q2', textResponse: 'გამარჯობა' },
    ];
    const changed = [
      { questionId: 'q1', selectedOptionIds: ['a', 'b'] },
      { questionId: 'q2', textResponse: 'შეცვლილი პასუხი' },
    ];

    const digest = buildSurveyResponseDigest(first);
    expect(digest).toBe('7fcb4aeaa04248ffb36c44da8f4a83a2853f3f048f98cdaf2a1685b061b0fa8d');
    expect(buildSurveyResponseDigest(reordered)).toBe(digest);
    expect(buildSurveyResponseDigest(changed)).not.toBe(digest);
    expect(buildSurveyAttestationOption(first)).toBe(`survey:${digest}`);
  });

  it('preserves ranked-choice order in the attestation digest', () => {
    const first = [{ questionId: 'rank', rankedOptionIds: ['a', 'b'] }];
    const changed = [{ questionId: 'rank', rankedOptionIds: ['b', 'a'] }];
    expect(buildSurveyResponseDigest(first)).not.toBe(buildSurveyResponseDigest(changed));
  });
});
