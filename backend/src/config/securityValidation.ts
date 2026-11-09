import { existsSync } from 'fs';
import { createPrivateKey } from 'crypto';
import { getSecret } from './vault';
import { assertReceiptSigningConfigured } from '../services/receiptSigner';
import { assertAuditCheckpointSigningConfigured } from '../services/auditCheckpoint';

type Environment = NodeJS.ProcessEnv;
type SecretResolver = (key: string) => string | undefined;

const STRONG_SECRET_NAMES = [
  'JWT_SECRET',
  'PN_HASH_SECRET',
  'API_KEY_ENCRYPTION_SECRET',
  'DEVICE_HASH_SECRET',
  'VOTER_HASH_SECRET',
  'NULLIFIER_SECRET',
] as const;

const PLACEHOLDER_PATTERN =
  /(change[_-]?me|not[_-]?for[_-]?production|placeholder|example|dev[_-]|test[_-]|default[_-]?secret)/i;

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate the controls that must be present before a production process may
 * accept enrollment or voting traffic. Development and test remain usable, but
 * production never silently falls back to mock credentials or local defaults.
 */
export function assertProductionSecurityConfiguration(
  environment: Environment = process.env,
  resolveSecret: SecretResolver = getSecret
): void {
  if (environment.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  const secret = (key: string): string | undefined => resolveSecret(key) ?? environment[key];

  for (const name of STRONG_SECRET_NAMES) {
    const value = secret(name)?.trim();
    if (!value) {
      errors.push(`${name} is required`);
    } else if (value.length < 32) {
      errors.push(`${name} must contain at least 32 characters`);
    } else if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`${name} contains a development or placeholder value`);
    }
  }

  const forbiddenFlags = [
    'ALLOW_MOCK_LOGIN',
    'BYPASS_ADMIN_AUTH',
    'ENABLE_DEBUG_LOGGING',
    'ALLOW_DEVELOPMENT_ATTESTATION_BYPASS',
  ];
  for (const flag of forbiddenFlags) {
    if (isTrue(environment[flag])) errors.push(`${flag} must be false in production`);
  }

  if (!isTrue(environment.REQUIRE_DEVICE_ATTESTATION)) {
    errors.push('REQUIRE_DEVICE_ATTESTATION must be true in production');
  }

  if (!isTrue(environment.ADMIN_MFA_REQUIRED)) {
    errors.push('ADMIN_MFA_REQUIRED must be true in production');
  }

  if (!isTrue(environment.ENFORCE_RESTRICTED_DB_ROLE)) {
    errors.push('ENFORCE_RESTRICTED_DB_ROLE must be true in production');
  }

  const metricsToken = secret('METRICS_BEARER_TOKEN')?.trim();
  if (!metricsToken || metricsToken.length < 32 || PLACEHOLDER_PATTERN.test(metricsToken)) {
    errors.push('METRICS_BEARER_TOKEN must be a non-placeholder secret of at least 32 characters');
  }

  if (environment.DEPLOYMENT_ENV === 'production') {
    if (!isTrue(environment.VAULT_REQUIRED)) {
      errors.push('VAULT_REQUIRED must be true for a production deployment');
    }
    if (!environment.VAULT_TOKEN_FILE?.trim() || environment.VAULT_TOKEN?.trim()) {
      errors.push('Production Vault authentication must use VAULT_TOKEN_FILE, not VAULT_TOKEN');
    }
  }

  for (const [name, minimum, maximum] of [
    ['ADMIN_SESSION_IDLE_SECONDS', 300, 3600],
    ['ADMIN_SESSION_ABSOLUTE_SECONDS', 900, 86400],
    ['ADMIN_MAX_CONCURRENT_SESSIONS', 1, 10],
  ] as const) {
    const value = Number.parseInt(environment[name] ?? '', 10);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      errors.push(`${name} must be an integer from ${minimum} to ${maximum}`);
    }
  }

  for (const flag of [
    'REWARD_PROCESSOR_ENABLED',
    'POLL_STATUS_MONITOR_ENABLED',
    'VOTE_ANCHOR_ENABLED',
    'AUDIT_CHECKPOINT_ENABLED',
  ]) {
    if (!/^(true|false)$/i.test(environment[flag]?.trim() ?? '')) {
      errors.push(`${flag} must be explicitly set to true or false in production`);
    }
  }

  const blockchainNetworkEnabled = isTrue(environment.REWARD_PROCESSOR_ENABLED) ||
    isTrue(environment.VOTE_ANCHOR_ENABLED);
  const rpcAllowedHosts = (environment.BLOCKCHAIN_RPC_ALLOWED_HOSTS ?? '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean);
  if (blockchainNetworkEnabled && rpcAllowedHosts.length === 0) {
    errors.push('BLOCKCHAIN_RPC_ALLOWED_HOSTS is required when blockchain workers are enabled');
  }
  for (const host of rpcAllowedHosts) {
    if (host.includes('*') || host.includes('/') || host.includes(':') || /localhost/i.test(host)) {
      errors.push(`BLOCKCHAIN_RPC_ALLOWED_HOSTS contains an unsafe hostname: ${host}`);
    }
  }

  const checkpointEnabled = isTrue(environment.AUDIT_CHECKPOINT_ENABLED);
  if (environment.DEPLOYMENT_ENV === 'production' && !checkpointEnabled) {
    errors.push('AUDIT_CHECKPOINT_ENABLED must be true for a production deployment');
  }
  if (checkpointEnabled) {
    const checkpointUrl = environment.AUDIT_CHECKPOINT_URL?.trim();
    const checkpointHosts = (environment.AUDIT_CHECKPOINT_ALLOWED_HOSTS ?? '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean);
    try {
      const parsed = new URL(checkpointUrl ?? '');
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
        throw new Error('unsafe URL');
      }
      if (!checkpointHosts.includes(parsed.hostname.toLowerCase())) {
        errors.push('AUDIT_CHECKPOINT_URL hostname must be in AUDIT_CHECKPOINT_ALLOWED_HOSTS');
      }
    } catch {
      errors.push('AUDIT_CHECKPOINT_URL must be an absolute HTTPS URL without credentials');
    }
    if (checkpointHosts.length === 0 || checkpointHosts.some(host =>
      host.includes('*') || host.includes('/') || host.includes(':') || /localhost/i.test(host)
    )) {
      errors.push('AUDIT_CHECKPOINT_ALLOWED_HOSTS must contain exact public hostnames');
    }
    const checkpointToken = secret('AUDIT_CHECKPOINT_BEARER_TOKEN')?.trim();
    if (!checkpointToken || checkpointToken.length < 32 || PLACEHOLDER_PATTERN.test(checkpointToken)) {
      errors.push('AUDIT_CHECKPOINT_BEARER_TOKEN must be a strong non-placeholder secret');
    }
    const checkpointInterval = Number.parseInt(
      environment.AUDIT_CHECKPOINT_INTERVAL_SECONDS ?? '',
      10
    );
    if (!Number.isInteger(checkpointInterval) || checkpointInterval < 60 || checkpointInterval > 86400) {
      errors.push('AUDIT_CHECKPOINT_INTERVAL_SECONDS must be between 60 and 86400');
    }
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(environment.AUDIT_CHECKPOINT_DEPLOYMENT_ID ?? '')) {
      errors.push('AUDIT_CHECKPOINT_DEPLOYMENT_ID is invalid');
    }
    try {
      assertAuditCheckpointSigningConfigured(
        secret('AUDIT_CHECKPOINT_PRIVATE_KEY_PEM'),
        secret('AUDIT_CHECKPOINT_PUBLIC_KEY_PEM')
      );
    } catch (error) {
      errors.push(describeError(error));
    }
  }

  const corsOrigins = (environment.CORS_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0) {
    errors.push('CORS_ORIGIN must contain at least one explicit HTTPS origin');
  }
  for (const origin of corsOrigins) {
    if (!origin.startsWith('https://') || origin.includes('*') || /localhost|127\.0\.0\.1/i.test(origin)) {
      errors.push(`CORS_ORIGIN contains an unsafe production origin: ${origin}`);
    }
  }

  const trustedProxyHops = Number.parseInt(environment.TRUST_PROXY_HOPS ?? '', 10);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1 || trustedProxyHops > 5) {
    errors.push('TRUST_PROXY_HOPS must explicitly identify 1 to 5 production proxy hops');
  }

  const minimumK = Number.parseInt(environment.MIN_K_ANONYMITY ?? '', 10);
  if (!Number.isInteger(minimumK) || minimumK < 30) {
    errors.push('MIN_K_ANONYMITY must be an integer of at least 30');
  }

  if (!environment.ANDROID_PACKAGE_NAME?.trim()) {
    errors.push('ANDROID_PACKAGE_NAME is required for Play Integrity verification');
  }

  const googleCredentialsPath = environment.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const googleCredentialsJson = secret('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
  if (!googleCredentialsPath && !googleCredentialsJson) {
    errors.push('Google service-account credentials are required for Play Integrity');
  } else if (googleCredentialsPath && !existsSync(googleCredentialsPath)) {
    errors.push('GOOGLE_APPLICATION_CREDENTIALS does not point to a readable file');
  } else if (googleCredentialsJson) {
    try {
      const parsed = JSON.parse(googleCredentialsJson);
      if (!parsed.client_email || !parsed.private_key) {
        errors.push('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
      }
    } catch {
      errors.push('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  const appleAppIdPrefix = environment.APPLE_APP_ID_PREFIX?.trim();
  const appleBundleId = environment.APPLE_BUNDLE_ID?.trim();
  const appleAttestEnvironment = environment.APPLE_APP_ATTEST_ENVIRONMENT?.trim();
  const appleBundleVersion = environment.APPLE_APP_BUNDLE_VERSION?.trim();
  const appleAllowedCategories = (environment.APPLE_APP_ATTEST_ALLOWED_CATEGORIES ?? '')
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(Number.isInteger);

  if (!appleAppIdPrefix || !/^[A-Z0-9]{10}$/.test(appleAppIdPrefix)) {
    errors.push('APPLE_APP_ID_PREFIX must be the exact 10-character Apple App ID prefix');
  }
  if (!appleBundleId || !/^[A-Za-z0-9.-]+$/.test(appleBundleId)) {
    errors.push('APPLE_BUNDLE_ID is required for App Attest verification');
  }
  if (!['development', 'production'].includes(appleAttestEnvironment ?? '')) {
    errors.push('APPLE_APP_ATTEST_ENVIRONMENT must be development or production');
  }
  if (environment.DEPLOYMENT_ENV === 'production' && appleAttestEnvironment !== 'production') {
    errors.push('APPLE_APP_ATTEST_ENVIRONMENT must be production for a production deployment');
  }
  if (!isTrue(environment.APPLE_APP_ATTEST_REQUIRE_EXTENSIONS)) {
    errors.push('APPLE_APP_ATTEST_REQUIRE_EXTENSIONS must be true in production');
  }
  if (appleAllowedCategories.length === 0 || appleAllowedCategories.some(value => ![2, 3, 4].includes(value))) {
    errors.push('APPLE_APP_ATTEST_ALLOWED_CATEGORIES must contain only approved categories 2, 3, or 4');
  }
  if (environment.DEPLOYMENT_ENV === 'production' && appleAllowedCategories.includes(3)) {
    errors.push('APPLE_APP_ATTEST_ALLOWED_CATEGORIES must exclude category 3 in production');
  }
  if (!appleBundleVersion || appleBundleVersion.length > 64) {
    errors.push('APPLE_APP_BUNDLE_VERSION must match the released CFBundleVersion');
  }

  const appleKeyId = secret('APPLE_DEVICECHECK_KEY_ID')?.trim();
  const appleTeamId = secret('APPLE_DEVICECHECK_TEAM_ID')?.trim();
  const applePrivateKey = secret('APPLE_DEVICECHECK_PRIVATE_KEY')?.replace(/\\n/g, '\n').trim();
  if ([appleKeyId, appleTeamId, applePrivateKey].some(Boolean) &&
      ![appleKeyId, appleTeamId, applePrivateKey].every(Boolean)) {
    errors.push('Apple DeviceCheck fallback requires key ID, team ID, and private key together');
  } else if (applePrivateKey) {
    try {
      const key = createPrivateKey(applePrivateKey);
      if (key.asymmetricKeyType !== 'ec') {
        errors.push('APPLE_DEVICECHECK_PRIVATE_KEY must be an EC private key');
      }
    } catch (error) {
      errors.push(`APPLE_DEVICECHECK_PRIVATE_KEY is invalid: ${describeError(error)}`);
    }
  }

  try {
    assertReceiptSigningConfigured(
      secret('RECEIPT_PRIVATE_KEY_PEM'),
      secret('RECEIPT_PUBLIC_KEY_PEM')
    );
  } catch (error) {
    errors.push(describeError(error));
  }

  if (errors.length > 0) {
    throw new Error(
      `Production security configuration is invalid:\n${errors
        .map((error) => ` - ${error}`)
        .join('\n')}`
    );
  }
}
