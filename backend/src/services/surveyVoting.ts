import { createHash } from 'node:crypto';
import { transaction } from '../db/client';
import { createError } from '../middleware/errorHandler';
import { VotingCredential } from '../types/credentials';
import { AudienceRules } from '../types/polls';
import { QuestionResponse, QuestionType } from '../types/survey';
import { computeNullifier } from './nullifier';
import { SecurityService } from './security';
import { buildDemographicsSnapshot, enforceAudienceEligibility } from './voting';

const MAX_RESPONSES = 100;
const MAX_OPTIONS_PER_RESPONSE = 100;
const ABSOLUTE_MAX_TEXT_LENGTH = 4_000;
const ALLOWED_RESPONSE_KEYS = new Set([
  'questionId',
  'selectedOptionId',
  'selectedOptionIds',
  'textResponse',
  'ratingValue',
  'rankedOptionIds',
]);

interface QuestionRow {
  id: string;
  question_type: QuestionType;
  required: boolean;
  config: Record<string, unknown> | null;
}

interface PollRow {
  id: string;
  start_at: Date | string | null;
  end_at: Date | string | null;
  audience_rules: AudienceRules | null;
  rewards_enabled: boolean;
  reward_amount: string | number | null;
  reward_token: string | null;
}

export interface SurveySubmissionResult {
  txHash: string;
  responseCount: number;
  reward?: {
    issued: boolean;
    amount: number;
    tokenSymbol: string;
  };
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function canonicalSurveyResponse(response: QuestionResponse): unknown[] {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw createError('Every survey response must be an object', 400);
  }
  if (typeof response.questionId !== 'string' || response.questionId.length === 0) {
    throw createError('Survey question IDs must be present and unique', 400);
  }
  const unknownKeys = Object.keys(response).filter(key => !ALLOWED_RESPONSE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw createError(`Question ${response.questionId} contains unsupported response fields`, 400);
  }

  const answerFields: Array<keyof QuestionResponse> = [
    'selectedOptionId',
    'selectedOptionIds',
    'textResponse',
    'ratingValue',
    'rankedOptionIds',
  ];
  const populated = answerFields.filter(field => hasValue(response[field]));
  if (populated.length !== 1) {
    throw createError(`Question ${response.questionId} must contain exactly one answer`, 400);
  }

  const field = populated[0];
  const value = response[field];
  switch (field) {
    case 'selectedOptionId':
      if (typeof value !== 'string' || value.length === 0) {
        throw createError(`Question ${response.questionId} has an invalid selectedOptionId`, 400);
      }
      return [response.questionId, field, value];
    case 'selectedOptionIds': {
      const selected = requireStringArray(value, field, response.questionId);
      return [response.questionId, field, [...selected].sort()];
    }
    case 'textResponse':
      if (typeof value !== 'string') {
        throw createError(`Question ${response.questionId} has an invalid text response`, 400);
      }
      return [response.questionId, field, value];
    case 'ratingValue':
      if (!Number.isInteger(value)) {
        throw createError(`Question ${response.questionId} has an invalid rating`, 400);
      }
      return [response.questionId, field, value];
    case 'rankedOptionIds':
      return [
        response.questionId,
        field,
        requireStringArray(value, field, response.questionId),
      ];
    default:
      throw createError(`Question ${response.questionId} has an unsupported answer type`, 400);
  }
}

/**
 * Canonical, answer-bearing digest used only for device-attestation binding.
 * Multiple-choice order is normalized; ranked-choice order remains meaningful.
 */
export function buildSurveyResponseDigest(responses: QuestionResponse[]): string {
  if (!Array.isArray(responses) || responses.length > MAX_RESPONSES) {
    throw createError(`Survey responses must contain at most ${MAX_RESPONSES} answers`, 400);
  }
  const canonical = responses.map(canonicalSurveyResponse);
  canonical.sort((left, right) => {
    const leftId = left[0] as string;
    const rightId = right[0] as string;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  const questionIds = canonical.map(entry => entry[0]);
  if (new Set(questionIds).size !== questionIds.length) {
    throw createError('Survey question IDs must be present and unique', 400);
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
}

export function buildSurveyAttestationOption(responses: QuestionResponse[]): string {
  return `survey:${buildSurveyResponseDigest(responses)}`;
}

function requireOnlyField(
  response: QuestionResponse,
  expectedField: keyof QuestionResponse
): void {
  const answerFields: Array<keyof QuestionResponse> = [
    'selectedOptionId',
    'selectedOptionIds',
    'textResponse',
    'ratingValue',
    'rankedOptionIds',
  ];
  const populated = answerFields.filter(field => hasValue(response[field]));
  if (populated.length !== 1 || populated[0] !== expectedField) {
    throw createError(
      `Question ${response.questionId} must contain exactly one ${String(expectedField)} answer`,
      400
    );
  }
}

function requireStringArray(
  value: unknown,
  field: string,
  questionId: string
): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OPTIONS_PER_RESPONSE) {
    throw createError(`Question ${questionId} has an invalid ${field}`, 400);
  }
  if (value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw createError(`Question ${questionId} has an invalid ${field}`, 400);
  }
  if (new Set(value).size !== value.length) {
    throw createError(`Question ${questionId} contains duplicate option IDs`, 400);
  }
  return value;
}

function numericConfig(
  config: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function validateResponse(
  response: QuestionResponse,
  question: QuestionRow,
  validOptionIds: Set<string>
): void {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw createError('Every survey response must be an object', 400);
  }
  const unknownKeys = Object.keys(response).filter(key => !ALLOWED_RESPONSE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw createError(`Question ${question.id} contains unsupported response fields`, 400);
  }

  const config = question.config || {};
  switch (question.question_type) {
    case 'single_choice': {
      requireOnlyField(response, 'selectedOptionId');
      if (typeof response.selectedOptionId !== 'string' || !validOptionIds.has(response.selectedOptionId)) {
        throw createError(`Question ${question.id} contains an option from another question`, 400);
      }
      return;
    }
    case 'multiple_choice': {
      requireOnlyField(response, 'selectedOptionIds');
      const selected = requireStringArray(
        response.selectedOptionIds,
        'selectedOptionIds',
        question.id
      );
      if (selected.some(optionId => !validOptionIds.has(optionId))) {
        throw createError(`Question ${question.id} contains an option from another question`, 400);
      }
      return;
    }
    case 'text': {
      requireOnlyField(response, 'textResponse');
      if (typeof response.textResponse !== 'string') {
        throw createError(`Question ${question.id} has an invalid text response`, 400);
      }
      const configuredMax = Math.floor(numericConfig(config, 'maxLength', ABSOLUTE_MAX_TEXT_LENGTH));
      const maxLength = Math.max(1, Math.min(configuredMax, ABSOLUTE_MAX_TEXT_LENGTH));
      if (response.textResponse.trim().length === 0 || response.textResponse.length > maxLength) {
        throw createError(`Question ${question.id} text response is empty or too long`, 400);
      }
      return;
    }
    case 'rating_scale': {
      requireOnlyField(response, 'ratingValue');
      const min = Math.max(1, Math.ceil(numericConfig(config, 'min', 1)));
      const max = Math.min(10, Math.floor(numericConfig(config, 'max', 10)));
      if (
        !Number.isInteger(response.ratingValue) ||
        min > max ||
        response.ratingValue! < min ||
        response.ratingValue! > max
      ) {
        throw createError(`Question ${question.id} rating is outside the configured scale`, 400);
      }
      return;
    }
    case 'ranked_choice': {
      requireOnlyField(response, 'rankedOptionIds');
      const ranked = requireStringArray(
        response.rankedOptionIds,
        'rankedOptionIds',
        question.id
      );
      const configuredMax = Math.floor(numericConfig(config, 'maxRanks', validOptionIds.size));
      const maxRanks = Math.max(1, Math.min(configuredMax, validOptionIds.size));
      if (ranked.length > maxRanks || ranked.some(optionId => !validOptionIds.has(optionId))) {
        throw createError(`Question ${question.id} has an invalid ranking`, 400);
      }
      return;
    }
    default:
      throw createError(`Question ${question.id} has an unsupported type`, 400);
  }
}

export async function submitSurveyResponses(
  pollId: string,
  responses: QuestionResponse[],
  credential: VotingCredential
): Promise<SurveySubmissionResult> {
  buildSurveyResponseDigest(responses);

  const responseQuestionIds = responses.map(response => response?.questionId);
  if (
    responseQuestionIds.some(questionId => typeof questionId !== 'string' || questionId.length === 0) ||
    new Set(responseQuestionIds).size !== responseQuestionIds.length
  ) {
    throw createError('Survey question IDs must be present and unique', 400);
  }

  const serverNullifier = await computeNullifier(credential.sub, pollId);
  const demographics = buildDemographicsSnapshot(credential.data);

  try {
    return await transaction(async client => {
      const pollResult = await client.query<PollRow>(
        `SELECT id, start_at, end_at, audience_rules, rewards_enabled, reward_amount, reward_token
         FROM polls
         WHERE id = $1 AND status = 'active' AND type = 'survey'
         FOR SHARE`,
        [pollId]
      );
      if (pollResult.rows.length === 0) {
        throw createError('Active survey poll not found', 404);
      }

      const poll = pollResult.rows[0];
      const now = new Date();
      if (poll.start_at && new Date(poll.start_at) > now) {
        throw createError('Survey has not started yet', 403);
      }
      if (poll.end_at && new Date(poll.end_at) < now) {
        throw createError('Survey has already ended', 403);
      }
      await enforceAudienceEligibility(pollId, poll.audience_rules || {}, credential);

      const questionResult = await client.query<QuestionRow>(
        `SELECT id, question_type, required, config
         FROM survey_questions
         WHERE poll_id = $1
         ORDER BY display_order
         FOR SHARE`,
        [pollId]
      );
      const questionMap = new Map(questionResult.rows.map(question => [question.id, question]));
      const unknownQuestion = responseQuestionIds.find(questionId => !questionMap.has(questionId));
      if (unknownQuestion) {
        throw createError('Survey response contains a question from another poll', 400);
      }

      const answeredQuestionIds = new Set(responseQuestionIds);
      const missingRequired = questionResult.rows.find(
        question => question.required && !answeredQuestionIds.has(question.id)
      );
      if (missingRequired) {
        throw createError(`Required question ${missingRequired.id} is missing`, 400);
      }

      const optionResult = await client.query<{ question_id: string; id: string }>(
        `SELECT qo.question_id, qo.id
         FROM question_options qo
         INNER JOIN survey_questions sq ON sq.id = qo.question_id
         WHERE sq.poll_id = $1`,
        [pollId]
      );
      const optionsByQuestion = new Map<string, Set<string>>();
      for (const option of optionResult.rows) {
        const current = optionsByQuestion.get(option.question_id) || new Set<string>();
        current.add(option.id);
        optionsByQuestion.set(option.question_id, current);
      }

      for (const response of responses) {
        const question = questionMap.get(response.questionId)!;
        validateResponse(response, question, optionsByQuestion.get(question.id) || new Set());
      }

      const nullifierResult = await client.query<{ submission_id: string }>(
        `INSERT INTO survey_nullifiers (poll_id, nullifier_hash)
         VALUES ($1, $2)
         RETURNING submission_id`,
        [pollId, serverNullifier]
      );
      const submissionId = nullifierResult.rows[0].submission_id;

      for (const response of responses) {
        await client.query(
          `INSERT INTO survey_responses
           (poll_id, question_id, selected_option_id, selected_option_ids,
            text_response, rating_value, ranked_option_ids, demographics_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            pollId,
            response.questionId,
            response.selectedOptionId ?? null,
            response.selectedOptionIds ?? null,
            response.textResponse ?? null,
            response.ratingValue ?? null,
            response.rankedOptionIds ?? null,
            demographics,
          ]
        );
      }

      await client.query(
        `INSERT INTO poll_participants (poll_id, user_id, participated_at)
         VALUES ($1, $2, NOW())`,
        [pollId, credential.sub]
      );

      let reward: SurveySubmissionResult['reward'];
      const rewardAmount = Number(poll.reward_amount || 0);
      if (poll.rewards_enabled && Number.isFinite(rewardAmount) && rewardAmount > 0) {
        const rewardResult = await client.query(
          `INSERT INTO user_rewards (device_key_hash, poll_id, amount, token_symbol, status)
           VALUES ($1, $2, $3, $4, 'pending')
           ON CONFLICT (poll_id, device_key_hash)
             WHERE poll_id IS NOT NULL AND transfer_to IS NULL
           DO NOTHING
           RETURNING id`,
          [credential.sub, pollId, rewardAmount, poll.reward_token || 'DTG']
        );
        if (rewardResult.rows.length > 0) {
          reward = {
            issued: true,
            amount: rewardAmount,
            tokenSymbol: poll.reward_token || 'DTG',
          };
        }
      }

      await SecurityService.logAuditEventInTransaction(client, 'SURVEY_SUBMITTED', {
        submissionId,
        pollId,
        responseCount: responses.length,
      });

      return {
        txHash: submissionId,
        responseCount: responses.length,
        ...(reward ? { reward } : {}),
      };
    });
  } catch (error: any) {
    if (
      error?.code === '23505' &&
      ['survey_nullifiers_pkey', 'poll_participants_pkey'].includes(error.constraint)
    ) {
      throw createError('Already submitted response to this survey', 409);
    }
    throw error;
  }
}
