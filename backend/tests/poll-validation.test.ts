import { validatePollPayload, validateUuid } from '../src/services/pollValidation';

const validPoll = {
  title: 'Election',
  type: 'election',
  options: ['Candidate A', 'Candidate B'],
  audience_rules: { min_age: 18, max_age: 120, gender: 'all' },
  start_at: '2030-01-01T00:00:00.000Z',
  end_at: '2030-01-02T00:00:00.000Z',
};

describe('poll command validation', () => {
  test('accepts a bounded election draft', () => {
    expect(() => validatePollPayload(validPoll)).not.toThrow();
  });

  test('rejects state and privacy-threshold injection', () => {
    expect(() => validatePollPayload({ ...validPoll, status: 'active' })).toThrow('not supported');
    expect(() => validatePollPayload({ ...validPoll, min_k_anonymity: 1 })).toThrow('not supported');
  });

  test('rejects duplicate choices and invalid dates', () => {
    expect(() => validatePollPayload({ ...validPoll, options: ['Same', ' same '] }))
      .toThrow('duplicate');
    expect(() => validatePollPayload({
      ...validPoll,
      start_at: '2030-01-03T00:00:00.000Z',
    })).toThrow('after start_at');
  });

  test('validates nested survey questions', () => {
    expect(() => validatePollPayload({
      title: 'Survey',
      type: 'survey',
      questions: [{
        questionText: 'Choose',
        questionType: 'single_choice',
        required: true,
        config: {},
        options: [{ optionText: 'A' }, { optionText: 'B' }],
      }],
    })).not.toThrow();

    expect(() => validatePollPayload({
      title: 'Survey',
      type: 'survey',
      questions: [{ questionText: 'Rate', questionType: 'rating_scale', config: { min: 5, max: 1 } }],
    })).toThrow('greater than min');
  });

  test('requires full content whenever a draft changes type', () => {
    expect(() => validatePollPayload({ type: 'survey' }, true)).toThrow('requires questions');
  });

  test('rejects malformed UUID route parameters', () => {
    expect(() => validateUuid('not-a-uuid')).toThrow('must be a UUID');
    expect(validateUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });
});

