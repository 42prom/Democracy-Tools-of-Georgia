import { createError } from '../middleware/errorHandler';

const POLL_TYPES = new Set(['election', 'referendum', 'survey']);
const QUESTION_TYPES = new Set([
  'single_choice', 'multiple_choice', 'text', 'rating_scale', 'ranked_choice',
]);
const POLL_FIELDS = new Set([
  'title', 'description', 'type', 'options', 'questions', 'referendum_question',
  'referendum_threshold', 'election_question', 'audience_rules', 'start_at', 'end_at',
  'rewards_enabled', 'reward_amount', 'reward_token',
]);

function fail(message: string): never {
  throw createError(message, 400);
}

function plainObject(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${field} must be a plain object`);
  return value as Record<string, any>;
}

function text(value: unknown, field: string, min: number, max: number): void {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    fail(`${field} must contain ${min}-${max} characters`);
  }
}

function integer(value: unknown, field: string, min: number, max: number): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${field} must be an integer between ${min} and ${max}`);
  }
}

function date(value: unknown, field: string): number {
  if (typeof value !== 'string' || value.length > 64) fail(`${field} must be an ISO date`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${field} must be an ISO date`);
  return timestamp;
}

function validateOptions(value: unknown, field = 'options'): void {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) {
    fail(`${field} must contain 2-100 options`);
  }
  const normalized = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const option = value[index];
    const optionText = typeof option === 'string' ? option : plainObject(option, `${field}[${index}]`).optionText;
    text(optionText, `${field}[${index}]`, 1, 500);
    const key = optionText.trim().toLocaleLowerCase('en-US');
    if (normalized.has(key)) fail(`${field} contains duplicate options`);
    normalized.add(key);
  }
}

function validateQuestion(value: unknown, index: number): void {
  const field = `questions[${index}]`;
  const question = plainObject(value, field);
  const allowed = new Set(['id', 'questionText', 'questionType', 'required', 'displayOrder', 'config', 'options']);
  const unsupported = Object.keys(question).find(key => !allowed.has(key));
  if (unsupported) fail(`${field}.${unsupported} is not supported`);

  text(question.questionText, `${field}.questionText`, 1, 1000);
  if (!QUESTION_TYPES.has(question.questionType)) fail(`${field}.questionType is invalid`);
  if ('required' in question && typeof question.required !== 'boolean') fail(`${field}.required must be a boolean`);
  if ('displayOrder' in question) integer(question.displayOrder, `${field}.displayOrder`, 0, 99);

  const config = 'config' in question ? plainObject(question.config, `${field}.config`) : {};
  if (JSON.stringify(config).length > 4096) fail(`${field}.config is too large`);

  if (['single_choice', 'multiple_choice', 'ranked_choice'].includes(question.questionType)) {
    validateOptions(question.options, `${field}.options`);
  } else if ('options' in question && question.options !== undefined && question.options.length > 0) {
    fail(`${field}.options is not allowed for ${question.questionType}`);
  }

  if (question.questionType === 'rating_scale') {
    integer(config.min, `${field}.config.min`, 1, 10);
    integer(config.max, `${field}.config.max`, 1, 10);
    if (config.min >= config.max) fail(`${field}.config.max must be greater than min`);
  }
  if (question.questionType === 'text' && 'maxLength' in config) {
    integer(config.maxLength, `${field}.config.maxLength`, 50, 2000);
  }
  for (const name of ['minLabel', 'maxLabel', 'placeholder']) {
    if (name in config && (typeof config[name] !== 'string' || config[name].length > 200)) {
      fail(`${field}.config.${name} must be a short string`);
    }
  }
}

export function validateAudienceRules(value: unknown): void {
  const rules = plainObject(value ?? {}, 'audience_rules');
  const allowed = new Set(['min_age', 'max_age', 'regions', 'gender']);
  const unsupported = Object.keys(rules).find(key => !allowed.has(key));
  if (unsupported) fail(`audience_rules.${unsupported} is not supported`);
  if ('min_age' in rules) integer(rules.min_age, 'audience_rules.min_age', 0, 150);
  if ('max_age' in rules) integer(rules.max_age, 'audience_rules.max_age', 0, 150);
  if ('min_age' in rules && 'max_age' in rules && rules.min_age > rules.max_age) {
    fail('audience_rules.min_age cannot exceed max_age');
  }
  if ('gender' in rules && !['M', 'F', 'all'].includes(rules.gender)) {
    fail('audience_rules.gender is invalid');
  }
  if ('regions' in rules) {
    if (!Array.isArray(rules.regions) || rules.regions.length > 100) fail('audience_rules.regions is invalid');
    for (const region of rules.regions) text(region, 'audience_rules.regions[]', 1, 100);
  }
}

export function validatePollPayload(value: unknown, partial = false): void {
  const poll = plainObject(value, 'poll');
  if (Object.keys(poll).length === 0) fail('Poll update cannot be empty');
  const unsupported = Object.keys(poll).find(key => !POLL_FIELDS.has(key));
  if (unsupported) fail(`poll.${unsupported} is not supported`);

  if (!partial || 'title' in poll) text(poll.title, 'title', 1, 200);
  if ('description' in poll && poll.description !== undefined && poll.description !== '') {
    text(poll.description, 'description', 1, 5000);
  }
  if (!partial || 'type' in poll) {
    if (!POLL_TYPES.has(poll.type)) fail('type must be election, referendum, or survey');
  }
  if ('audience_rules' in poll) validateAudienceRules(poll.audience_rules);

  const start = 'start_at' in poll && poll.start_at ? date(poll.start_at, 'start_at') : undefined;
  const end = 'end_at' in poll && poll.end_at ? date(poll.end_at, 'end_at') : undefined;
  if (start !== undefined && end !== undefined && start >= end) fail('end_at must be after start_at');

  if ('options' in poll) validateOptions(poll.options);
  if ('questions' in poll) {
    if (!Array.isArray(poll.questions) || poll.questions.length < 1 || poll.questions.length > 100) {
      fail('questions must contain 1-100 questions');
    }
    poll.questions.forEach(validateQuestion);
  }

  if (!partial) {
    if (poll.type === 'survey' && !poll.questions && !poll.options) {
      fail('Survey requires questions');
    }
    if (poll.type !== 'survey' && !poll.options) fail('Poll requires options');
  } else if ('type' in poll) {
    if (poll.type === 'survey' && !poll.questions) fail('Changing to survey requires questions');
    if (poll.type !== 'survey' && !poll.options) fail('Changing poll type requires options');
  }

  if ('referendum_threshold' in poll) {
    if (typeof poll.referendum_threshold !== 'number' || !Number.isFinite(poll.referendum_threshold) || poll.referendum_threshold < 1 || poll.referendum_threshold > 100) {
      fail('referendum_threshold must be between 1 and 100');
    }
  }
  for (const name of ['referendum_question', 'election_question']) {
    if (name in poll && poll[name] !== undefined && poll[name] !== '') text(poll[name], name, 1, 1000);
  }
  if ('rewards_enabled' in poll && typeof poll.rewards_enabled !== 'boolean') {
    fail('rewards_enabled must be a boolean');
  }
  if ('reward_amount' in poll && poll.reward_amount !== undefined) {
    if (typeof poll.reward_amount !== 'number' || !Number.isFinite(poll.reward_amount) || poll.reward_amount <= 0 || poll.reward_amount > 1_000_000_000) {
      fail('reward_amount must be a positive bounded number');
    }
  }
  if ('reward_token' in poll && poll.reward_token !== undefined) {
    if (typeof poll.reward_token !== 'string' || !/^[A-Z0-9_-]{1,16}$/.test(poll.reward_token)) {
      fail('reward_token is invalid');
    }
  }
}

export function validateUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail(`${field} must be a UUID`);
  }
  return value;
}
