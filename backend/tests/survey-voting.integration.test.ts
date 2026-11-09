import { randomUUID } from 'node:crypto';
import { CryptoRegistry } from '../src/crypto/CryptoRegistry';
import { close, query } from '../src/db/client';
import { submitSurveyResponses } from '../src/services/surveyVoting';
import { VotingCredential } from '../src/types/credentials';

describe('survey voting concurrency (real PostgreSQL)', () => {
  const userId = randomUUID();
  const pollId = randomUUID();
  const questionOneId = randomUUID();
  const questionTwoId = randomUUID();
  const optionOneId = randomUUID();
  const optionTwoId = randomUUID();

  const credential: VotingCredential = {
    iss: 'integration-test',
    sub: userId,
    data: {
      age_bucket: '25-34',
      gender: 'M',
      region: 'reg_tbilisi',
      citizenship: 'GEO',
    },
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  beforeAll(async () => {
    await CryptoRegistry.init();
    const database = await query<{ current_database: string }>('SELECT current_database()');
    if (!/test/i.test(database.rows[0].current_database)) {
      throw new Error('Refusing to run destructive integration setup outside a test database');
    }

    await query('INSERT INTO users (id) VALUES ($1)', [userId]);
    await query(
      `INSERT INTO polls
       (id, title, type, status, audience_rules, rewards_enabled)
       VALUES ($1, 'Atomic survey integration test', 'survey', 'active', '{}', false)`,
      [pollId]
    );
    await query(
      `INSERT INTO survey_questions
       (id, poll_id, question_text, question_type, required, display_order, config)
       VALUES
       ($1, $3, 'First', 'single_choice', true, 0, '{}'),
       ($2, $3, 'Second', 'single_choice', false, 1, '{}')`,
      [questionOneId, questionTwoId, pollId]
    );
    await query(
      `INSERT INTO question_options (id, question_id, option_text, display_order)
       VALUES ($1, $3, 'One', 0), ($2, $4, 'Two', 0)`,
      [optionOneId, optionTwoId, questionOneId, questionTwoId]
    );
  });

  afterAll(async () => {
    // Keep committed fixtures and append-only evidence intact. The CI runner
    // disposes of this dedicated test database; production lifecycle guards
    // must not be disabled or bypassed merely to clean up a test fixture.
    await close();
  });

  it('rolls back invalid options without reserving a nullifier', async () => {
    await expect(submitSurveyResponses(
      pollId,
      [{ questionId: questionOneId, selectedOptionId: optionTwoId }],
      credential
    )).rejects.toMatchObject({ statusCode: 400 });

    const counts = await query<{ nullifiers: string; responses: string }>(
      `SELECT
         (SELECT COUNT(*) FROM survey_nullifiers WHERE poll_id = $1) AS nullifiers,
         (SELECT COUNT(*) FROM survey_responses WHERE poll_id = $1) AS responses`,
      [pollId]
    );
    expect(counts.rows[0]).toEqual({ nullifiers: '0', responses: '0' });
  });

  it('commits exactly one of two concurrent submissions', async () => {
    const responses = [
      { questionId: questionOneId, selectedOptionId: optionOneId },
      { questionId: questionTwoId, selectedOptionId: optionTwoId },
    ];
    const results = await Promise.allSettled([
      submitSurveyResponses(pollId, responses, credential),
      submitSurveyResponses(pollId, responses, credential),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof submitSurveyResponses>>> =>
        result.status === 'fulfilled'
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.txHash).toMatch(/^[0-9a-f-]{36}$/i);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409 });

    const counts = await query<{
      nullifiers: string;
      responses: string;
      participants: string;
      rewards: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM survey_nullifiers WHERE poll_id = $1) AS nullifiers,
         (SELECT COUNT(*) FROM survey_responses WHERE poll_id = $1) AS responses,
         (SELECT COUNT(*) FROM poll_participants WHERE poll_id = $1) AS participants,
         (SELECT COUNT(*) FROM user_rewards WHERE poll_id = $1) AS rewards`,
      [pollId]
    );
    expect(counts.rows[0]).toEqual({
      nullifiers: '1',
      responses: '2',
      participants: '1',
      rewards: '0',
    });
  });

  it('preserves an active poll against deletion after a committed submission', async () => {
    await expect(query('DELETE FROM polls WHERE id = $1', [pollId]))
      .rejects.toThrow('only draft polls may be deleted');
    const result = await query('SELECT id FROM polls WHERE id = $1', [pollId]);
    expect(result.rows).toHaveLength(1);
  });
});
