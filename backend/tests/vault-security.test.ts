const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

const requiredSecrets = {
  JWT_SECRET: 'j'.repeat(48),
  PN_HASH_SECRET: 'p'.repeat(48),
  API_KEY_ENCRYPTION_SECRET: 'a'.repeat(48),
  DEVICE_HASH_SECRET: 'd'.repeat(48),
  VOTER_HASH_SECRET: 'v'.repeat(48),
  NULLIFIER_SECRET: 'n'.repeat(48),
  RECEIPT_PRIVATE_KEY_PEM: 'private-key-fixture',
  RECEIPT_PUBLIC_KEY_PEM: 'public-key-fixture',
  METRICS_BEARER_TOKEN: 'm'.repeat(48),
  AUDIT_CHECKPOINT_PRIVATE_KEY_PEM: 'checkpoint-private-key-fixture',
  AUDIT_CHECKPOINT_BEARER_TOKEN: 'c'.repeat(48),
};

describe('Vault production boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.VAULT_TOKEN_FILE;
    delete process.env.VAULT_REQUIRED;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it('fails closed when production deployment has no Vault identity', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_ENV = 'production';
    const { initVault } = await import('../src/config/vault');
    await expect(initVault()).rejects.toThrow(/Vault is required/);
  });

  it('rejects plaintext Vault transport in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_ENV = 'production';
    process.env.VAULT_ADDR = 'http://vault.internal:8200';
    process.env.VAULT_TOKEN = 'test-token';
    const { initVault } = await import('../src/config/vault');
    await expect(initVault()).rejects.toThrow(/must use HTTPS/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads the complete critical secret set from an HTTPS KV endpoint', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_ENV = 'production';
    process.env.VAULT_ADDR = 'https://vault.example.invalid';
    process.env.VAULT_TOKEN = 'test-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: { data: requiredSecrets } })),
    });
    const { initVault, getSecret, isSecretFromVault } = await import('../src/config/vault');
    await expect(initVault()).resolves.toBeUndefined();
    expect(getSecret('JWT_SECRET')).toBe(requiredSecrets.JWT_SECRET);
    expect(isSecretFromVault('JWT_SECRET')).toBe(true);
  });
});
