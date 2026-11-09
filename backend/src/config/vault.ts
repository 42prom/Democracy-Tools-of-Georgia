import { readFile } from 'node:fs/promises';

const DEFAULT_SECRET_PATH = 'secret/data/dtg';
const MAX_TOKEN_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 1_048_576;
const PRODUCTION_VAULT_SECRETS = [
  'JWT_SECRET',
  'PN_HASH_SECRET',
  'API_KEY_ENCRYPTION_SECRET',
  'DEVICE_HASH_SECRET',
  'VOTER_HASH_SECRET',
  'NULLIFIER_SECRET',
  'RECEIPT_PRIVATE_KEY_PEM',
  'RECEIPT_PUBLIC_KEY_PEM',
  'METRICS_BEARER_TOKEN',
  'AUDIT_CHECKPOINT_PRIVATE_KEY_PEM',
  'AUDIT_CHECKPOINT_BEARER_TOKEN',
] as const;

let vaultCache: Record<string, string> | null = null;
let vaultEnabled = false;
let vaultAuthMethod: 'token' | 'token-file' | undefined;

function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.DEPLOYMENT_ENV === 'production';
}

function validateVaultAddress(rawAddress: string): string {
  let url: URL;
  try {
    url = new URL(rawAddress);
  } catch {
    throw new Error('[Vault] VAULT_ADDR must be an absolute URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('[Vault] VAULT_ADDR must not contain credentials, a query, or a fragment.');
  }
  if (isProductionDeployment() && url.protocol !== 'https:') {
    throw new Error('[Vault] Production VAULT_ADDR must use HTTPS.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('[Vault] VAULT_ADDR must use HTTP or HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

function validateSecretPath(value: string): string {
  const path = value.replace(/^\/+|\/+$/g, '');
  if (!path || path.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(path)) {
    throw new Error('[Vault] VAULT_SECRET_PATH is invalid.');
  }
  return path;
}

async function loadVaultToken(): Promise<{ token?: string; method?: 'token' | 'token-file' }> {
  const inlineToken = process.env.VAULT_TOKEN?.trim();
  const tokenFile = process.env.VAULT_TOKEN_FILE?.trim();
  if (inlineToken && tokenFile) {
    throw new Error('[Vault] Configure VAULT_TOKEN or VAULT_TOKEN_FILE, not both.');
  }
  if (inlineToken) return { token: inlineToken, method: 'token' };
  if (!tokenFile) return {};

  const tokenBuffer = await readFile(tokenFile);
  if (tokenBuffer.length === 0 || tokenBuffer.length > MAX_TOKEN_BYTES) {
    throw new Error('[Vault] Workload token file is empty or too large.');
  }
  const token = tokenBuffer.toString('utf8').trim();
  if (!token || /[\r\n]/.test(token)) {
    throw new Error('[Vault] Workload token file has an invalid format.');
  }
  return { token, method: 'token-file' };
}

function requiredProductionSecrets(): string[] {
  const additions = (process.env.VAULT_REQUIRED_SECRETS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^[A-Z][A-Z0-9_]+$/.test(value));
  return [...new Set([...PRODUCTION_VAULT_SECRETS, ...additions])];
}

/** Load the KV secret document before validating or serving any traffic. */
export async function initVault(): Promise<void> {
  vaultCache = null;
  vaultEnabled = false;
  vaultAuthMethod = undefined;

  const rawAddress = process.env.VAULT_ADDR?.trim();
  const required = process.env.VAULT_REQUIRED === 'true' || isProductionDeployment();
  const credentials = await loadVaultToken();

  if (!rawAddress && !credentials.token) {
    if (required) throw new Error('[Vault] Vault is required for this deployment.');
    console.log('[Vault] Vault not configured; using environment secrets for non-production use.');
    return;
  }
  if (!rawAddress || !credentials.token || !credentials.method) {
    throw new Error('[Vault] VAULT_ADDR and exactly one token source must be configured together.');
  }

  const address = validateVaultAddress(rawAddress);
  const secretPath = validateSecretPath(process.env.VAULT_SECRET_PATH ?? DEFAULT_SECRET_PATH);

  try {
    const response = await fetch(`${address}/v1/${secretPath}`, {
      headers: { 'X-Vault-Token': credentials.token },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Vault returned HTTP ${response.status}`);

    const responseText = await response.text();
    if (Buffer.byteLength(responseText, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('Vault response exceeded the size limit');
    }
    const body = JSON.parse(responseText) as { data?: { data?: unknown } | unknown };
    const candidate = body?.data && typeof body.data === 'object' && 'data' in body.data
      ? (body.data as { data?: unknown }).data
      : body?.data;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Vault response did not contain a KV secret object');
    }

    const loaded: Record<string, string> = {};
    for (const [key, value] of Object.entries(candidate)) {
      if (typeof value === 'string') loaded[key] = value;
    }
    if (isProductionDeployment()) {
      const missing = requiredProductionSecrets().filter(key => !loaded[key]?.trim());
      if (missing.length > 0) {
        throw new Error(`Vault is missing ${missing.length} required production secret(s)`);
      }
    }

    vaultCache = loaded;
    vaultEnabled = true;
    vaultAuthMethod = credentials.method;
    console.log(`[Vault] Loaded ${Object.keys(loaded).length} secret values using ${credentials.method}.`);
  } catch (error) {
    vaultCache = null;
    vaultEnabled = false;
    const message = error instanceof Error ? error.message : 'unknown Vault error';
    if (process.env.NODE_ENV === 'production' || required) {
      throw new Error(`[Vault] Startup aborted: ${message}`);
    }
    console.error(`[Vault] ${message}; falling back to environment secrets in non-production.`);
  }
}

export function getSecret(key: string): string | undefined {
  if (vaultEnabled && vaultCache && key in vaultCache) return vaultCache[key];
  return process.env[key];
}

export function requireSecret(key: string): string {
  const value = getSecret(key);
  if (!value) throw new Error(`[Vault] Required secret '${key}' is unavailable.`);
  return value;
}

export function isVaultEnabled(): boolean {
  return vaultEnabled;
}

export function isSecretFromVault(key: string): boolean {
  return Boolean(vaultEnabled && vaultCache && key in vaultCache);
}

export function getVaultStatus(): {
  enabled: boolean;
  authMethod?: 'token' | 'token-file';
  secretCount?: number;
} {
  return {
    enabled: vaultEnabled,
    authMethod: vaultEnabled ? vaultAuthMethod : undefined,
    secretCount: vaultEnabled ? Object.keys(vaultCache ?? {}).length : undefined,
  };
}
