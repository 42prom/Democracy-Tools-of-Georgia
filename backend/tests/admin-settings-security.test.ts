import {
  isMaskedSecret,
  validateAdminSettingsPatch,
  validateFirebaseServiceAccount,
} from '../src/services/adminSettingsValidation';
import { assertSafeBlockchainRpcUrl } from '../src/services/outboundUrl';

describe('admin settings security validation', () => {
  test('rejects server filesystem credential paths', async () => {
    await expect(
      validateAdminSettingsPatch({ push: { serviceAccountPath: 'C:\\secrets\\firebase.json' } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('validates the expected Firebase service account fields', () => {
    expect(() => validateFirebaseServiceAccount(JSON.stringify({ type: 'service_account' })))
      .toThrow('missing project_id');

    expect(() => validateFirebaseServiceAccount(JSON.stringify({
      type: 'service_account',
      project_id: 'project',
      private_key: 'private-key',
      client_email: 'firebase@example.test',
    }))).not.toThrow();
  });

  test('recognizes masked values and rejects unknown policy fields', async () => {
    expect(isMaskedSecret(`abcd${'\u2022'.repeat(8)}wxyz`)).toBe(true);
    await expect(validateAdminSettingsPatch({ unexpected: true }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects private, metadata and non-HTTPS RPC destinations', async () => {
    await expect(assertSafeBlockchainRpcUrl('https://127.0.0.1:8545')).rejects.toThrow('private');
    await expect(assertSafeBlockchainRpcUrl('https://169.254.169.254/latest/meta-data'))
      .rejects.toThrow('private');
    await expect(assertSafeBlockchainRpcUrl('http://8.8.8.8:8545')).rejects.toThrow('HTTPS');
  });

  test('accepts a syntactically safe public HTTPS IP endpoint outside production', async () => {
    await expect(assertSafeBlockchainRpcUrl('https://8.8.8.8/rpc'))
      .resolves.toBe('https://8.8.8.8/rpc');
  });

  test('rejects invalid bounds before persistence', async () => {
    await expect(validateAdminSettingsPatch({
      security: { maxBiometricAttemptsPerIP: 0 },
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(validateAdminSettingsPatch({
      rate_limit_vote: { poll: 1, account: 3, window: 0 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

