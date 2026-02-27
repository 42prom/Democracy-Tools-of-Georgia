/**
 * Vault Secrets Manager
 *
 * Provides a unified interface for reading secrets from:
 *   1. HashiCorp Vault (production) — when VAULT_ADDR and VAULT_TOKEN are set.
 *   2. Environment variables (.env) — development / Docker fallback.
 *
 * This is a progressive enhancement: the system works identically without Vault,
 * and Vault is transparently enabled when its env vars are present.
 *
 * HOW TO ENABLE VAULT:
 *   1. Run Vault (Docker): docker run --cap-add=IPC_LOCK -e VAULT_DEV_ROOT_TOKEN_ID=dtg-dev-token -p 8200:8200 vault:latest
 *   2. Set env vars: VAULT_ADDR=http://localhost:8200  VAULT_TOKEN=dtg-dev-token
 *   3. Write secrets:
 *        vault kv put secret/dtg \
 *          NULLIFIER_SECRET="..." \
 *          JWT_SECRET="..." \
 *          RECEIPT_PRIVATE_KEY_PEM="..." \
 *          BLOCKCHAIN_PRIVATE_KEY="..."
 *   4. The app reads from Vault automatically on startup.
 *
 * PRODUCTION VAULT (cloud):
 *   Use VAULT_ROLE_ID + VAULT_SECRET_ID for AppRole auth (no long-lived tokens).
 *   Or use AWS IAM / GCP Workload Identity via Vault's cloud auth methods.
 */

const VAULT_ADDR = process.env.VAULT_ADDR;
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH ?? 'secret/data/dtg';

/** In-memory cache of Vault secrets (loaded once at startup). */
let vaultCache: Record<string, string> | null = null;
let vaultEnabled = false;

/**
 * Initialise Vault integration. Called once during server startup.
 * Falls back to .env silently if Vault is not configured.
 */
export async function initVault(): Promise<void> {
  if (!VAULT_ADDR || !VAULT_TOKEN) {
    console.log('[Vault] Vault not configured (VAULT_ADDR/VAULT_TOKEN absent). Using .env secrets.');
    vaultEnabled = false;
    return;
  }

  try {
    const url = `${VAULT_ADDR}/v1/${VAULT_SECRET_PATH}`;
    const response = await fetch(url, {
      headers: { 'X-Vault-Token': VAULT_TOKEN },
    });

    if (!response.ok) {
      throw new Error(`Vault HTTP ${response.status}: ${await response.text()}`);
    }

    const body = await response.json() as any;
    // Vault KV v2 nests data under data.data
    vaultCache = body?.data?.data ?? body?.data ?? {};
    vaultEnabled = true;

    const keys = Object.keys(vaultCache!).join(', ');
    console.log(`[Vault] ✅ Loaded ${Object.keys(vaultCache!).length} secrets from Vault: ${keys}`);
  } catch (err: any) {
    console.error(`[Vault] ❌ Failed to load secrets from Vault: ${err.message}`);
    console.error('[Vault] Falling back to .env secrets. Fix Vault before production deploy!');
    vaultEnabled = false;
  }
}

/**
 * Get a secret by name.
 * Priority: Vault cache → process.env → undefined
 *
 * @param key - The secret name (e.g. 'JWT_SECRET', 'NULLIFIER_SECRET').
 * @returns   The secret value, or undefined if not found.
 */
export function getSecret(key: string): string | undefined {
  if (vaultEnabled && vaultCache && key in vaultCache) {
    return vaultCache[key];
  }
  return process.env[key];
}

/**
 * Get a required secret. Throws if not found in either Vault or .env.
 */
export function requireSecret(key: string): string {
  const value = getSecret(key);
  if (!value) {
    const source = vaultEnabled ? 'Vault or environment' : 'environment';
    throw new Error(`[Vault] Required secret '${key}' not found in ${source}`);
  }
  return value;
}

/**
 * Returns true if Vault is actively serving secrets.
 * Use this in health checks to expose Vault connectivity.
 */
export function isVaultEnabled(): boolean {
  return vaultEnabled;
}

/**
 * Returns a summary for the /health endpoint.
 */
export function getVaultStatus(): { enabled: boolean; address?: string; secretCount?: number } {
  return {
    enabled: vaultEnabled,
    address: vaultEnabled ? VAULT_ADDR : undefined,
    secretCount: vaultEnabled ? Object.keys(vaultCache ?? {}).length : undefined,
  };
}
