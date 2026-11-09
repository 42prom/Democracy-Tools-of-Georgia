import { createError } from '../middleware/errorHandler';
import { assertSafeBlockchainRpcUrl } from './outboundUrl';

const TOP_LEVEL_KEYS = new Set([
  'nfc', 'documentScanner', 'liveness', 'faceMatch', 'security', 'push',
  'rewards_enabled_global', 'nft_payouts_enabled_global', 'chain_id', 'rpc_url',
  'nft_contract_address', 'dtg_token_address', 'reward_token_id',
  'required_confirmations', 'rate_limit_enrollment', 'rate_limit_login',
  'rate_limit_biometric', 'rate_limit_vote',
]);

function fail(message: string): never {
  throw createError(message, 400);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${field} must be an object`);
  return value;
}

function keys(value: Record<string, unknown>, field: string, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find(key => !allowedSet.has(key));
  if (unknown) fail(`${field}.${unknown} is not supported`);
}

function boolean(value: unknown, field: string): void {
  if (typeof value !== 'boolean') fail(`${field} must be a boolean`);
}

function string(value: unknown, field: string, maxLength = 4096): void {
  if (typeof value !== 'string' || value.length > maxLength) {
    fail(`${field} must be a string no longer than ${maxLength} characters`);
  }
}

function integer(value: unknown, field: string, min: number, max: number): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${field} must be an integer between ${min} and ${max}`);
  }
}

function number(value: unknown, field: string, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${field} must be a number between ${min} and ${max}`);
  }
}

function optionalBoolean(parent: Record<string, unknown>, name: string, prefix: string): void {
  if (name in parent) boolean(parent[name], `${prefix}.${name}`);
}

function optionalString(
  parent: Record<string, unknown>,
  name: string,
  prefix: string,
  maxLength = 4096
): void {
  if (name in parent) string(parent[name], `${prefix}.${name}`, maxLength);
}

function validateRateLimit(value: unknown, field: string): void {
  const config = object(value, field);
  keys(config, field, ['ip', 'device', 'pn', 'account', 'poll', 'window']);
  for (const name of ['ip', 'device', 'pn', 'account', 'poll']) {
    if (name in config) integer(config[name], `${field}.${name}`, 1, 100_000);
  }
  if (!('window' in config)) fail(`${field}.window is required`);
  integer(config.window, `${field}.window`, 1, 10_080);
}

export function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && (
    value.includes('\u2022') ||
    value.includes('â€¢') ||
    value === '[Decryption Failed]'
  );
}

export function validateFirebaseServiceAccount(value: unknown): void {
  string(value, 'push.serviceAccountJson', 100_000);
  if (value === '' || isMaskedSecret(value)) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    fail('push.serviceAccountJson must be valid JSON');
  }
  const credentials = object(parsed, 'push.serviceAccountJson');
  for (const name of ['project_id', 'private_key', 'client_email']) {
    if (typeof credentials[name] !== 'string' || !(credentials[name] as string).trim()) {
      fail(`push.serviceAccountJson is missing ${name}`);
    }
  }
  if (credentials.type !== 'service_account') {
    fail('push.serviceAccountJson must contain a service_account credential');
  }
}

export async function validateAdminSettingsPatch(value: unknown): Promise<void> {
  const body = object(value, 'settings');
  const unsupported = Object.keys(body).find(key => !TOP_LEVEL_KEYS.has(key));
  if (unsupported) fail(`settings.${unsupported} is not supported`);

  if ('nfc' in body) {
    const config = object(body.nfc, 'nfc');
    keys(config, 'nfc', ['provider', 'requireNfc', 'requireGeorgianCitizen', 'requirePersonalNumber', 'allowSkipDocument']);
    optionalString(config, 'provider', 'nfc', 64);
    for (const name of ['requireNfc', 'requireGeorgianCitizen', 'requirePersonalNumber', 'allowSkipDocument']) {
      optionalBoolean(config, name, 'nfc');
    }
  }

  if ('documentScanner' in body) {
    const config = object(body.documentScanner, 'documentScanner');
    keys(config, 'documentScanner', ['provider', 'apiKey', 'requireDocumentPhotoScan', 'strictness']);
    optionalString(config, 'provider', 'documentScanner', 64);
    optionalString(config, 'apiKey', 'documentScanner', 16_384);
    optionalBoolean(config, 'requireDocumentPhotoScan', 'documentScanner');
    if ('strictness' in config && !['strict', 'lenient'].includes(String(config.strictness))) {
      fail('documentScanner.strictness must be strict or lenient');
    }
  }

  if ('liveness' in body) {
    const config = object(body.liveness, 'liveness');
    keys(config, 'liveness', ['provider', 'apiKey', 'retryLimit', 'minScore']);
    optionalString(config, 'provider', 'liveness', 64);
    optionalString(config, 'apiKey', 'liveness', 16_384);
    if ('retryLimit' in config) integer(config.retryLimit, 'liveness.retryLimit', 1, 10);
    if ('minScore' in config) number(config.minScore, 'liveness.minScore', 0, 1);
  }

  if ('faceMatch' in body) {
    const config = object(body.faceMatch, 'faceMatch');
    keys(config, 'faceMatch', ['provider', 'apiKey', 'minScore']);
    optionalString(config, 'provider', 'faceMatch', 64);
    optionalString(config, 'apiKey', 'faceMatch', 16_384);
    if ('minScore' in config) number(config.minScore, 'faceMatch.minScore', 0, 1);
  }

  if ('security' in body) {
    const config = object(body.security, 'security');
    keys(config, 'security', [
      'maxDistinctVotersPerDevicePerPoll', 'requireDeviceAttestationForVote',
      'blockVpnAndProxy', 'vpnDetectionProvider', 'vpnDetectionApiKey',
      'maxBiometricAttemptsPerIP', 'biometricIPLimitWindowMinutes',
    ]);
    if ('maxDistinctVotersPerDevicePerPoll' in config) integer(config.maxDistinctVotersPerDevicePerPoll, 'security.maxDistinctVotersPerDevicePerPoll', 1, 100);
    optionalBoolean(config, 'requireDeviceAttestationForVote', 'security');
    optionalBoolean(config, 'blockVpnAndProxy', 'security');
    optionalString(config, 'vpnDetectionProvider', 'security', 64);
    optionalString(config, 'vpnDetectionApiKey', 'security', 16_384);
    if ('maxBiometricAttemptsPerIP' in config) integer(config.maxBiometricAttemptsPerIP, 'security.maxBiometricAttemptsPerIP', 1, 10_000);
    if ('biometricIPLimitWindowMinutes' in config) integer(config.biometricIPLimitWindowMinutes, 'security.biometricIPLimitWindowMinutes', 1, 10_080);
  }

  if ('push' in body) {
    const config = object(body.push, 'push');
    keys(config, 'push', ['enabledGlobal', 'enabledPolls', 'enabledMessages', 'serviceAccountJson', 'serviceAccountPath']);
    for (const name of ['enabledGlobal', 'enabledPolls', 'enabledMessages']) optionalBoolean(config, name, 'push');
    if ('serviceAccountJson' in config) validateFirebaseServiceAccount(config.serviceAccountJson);
    if ('serviceAccountPath' in config && config.serviceAccountPath !== '') {
      fail('push.serviceAccountPath is environment-only and cannot be set through the admin API');
    }
  }

  for (const name of ['rewards_enabled_global', 'nft_payouts_enabled_global']) {
    if (name in body) boolean(body[name], name);
  }
  if ('chain_id' in body) integer(body.chain_id, 'chain_id', 1, 2_147_483_647);
  if ('reward_token_id' in body) integer(body.reward_token_id, 'reward_token_id', 1, Number.MAX_SAFE_INTEGER);
  if ('required_confirmations' in body) integer(body.required_confirmations, 'required_confirmations', 1, 10_000);
  for (const name of ['nft_contract_address', 'dtg_token_address']) {
    if (name in body) {
      string(body[name], name, 42);
      if (body[name] !== '' && !/^0x[0-9a-fA-F]{40}$/.test(body[name] as string)) {
        fail(`${name} must be an Ethereum address`);
      }
    }
  }
  if ('rpc_url' in body && body.rpc_url !== '') {
    try {
      await assertSafeBlockchainRpcUrl(body.rpc_url);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'RPC URL is not allowed');
    }
  }

  for (const name of ['rate_limit_enrollment', 'rate_limit_login', 'rate_limit_biometric', 'rate_limit_vote']) {
    if (name in body) validateRateLimit(body[name], name);
  }
}

