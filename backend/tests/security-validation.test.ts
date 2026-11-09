import { generateKeyPairSync } from 'crypto';
import { assertProductionSecurityConfiguration } from '../src/config/securityValidation';

function validProductionEnvironment(): NodeJS.ProcessEnv {
  const receipt = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const apple = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    PN_HASH_SECRET: 'b'.repeat(64),
    API_KEY_ENCRYPTION_SECRET: 'c'.repeat(64),
    DEVICE_HASH_SECRET: 'd'.repeat(64),
    VOTER_HASH_SECRET: 'e'.repeat(64),
    NULLIFIER_SECRET: 'f'.repeat(64),
    RECEIPT_PRIVATE_KEY_PEM: receipt.privateKey,
    RECEIPT_PUBLIC_KEY_PEM: receipt.publicKey,
    REQUIRE_DEVICE_ATTESTATION: 'true',
    ADMIN_MFA_REQUIRED: 'true',
    ADMIN_SESSION_IDLE_SECONDS: '900',
    ADMIN_SESSION_ABSOLUTE_SECONDS: '28800',
    ADMIN_MAX_CONCURRENT_SESSIONS: '3',
    ENFORCE_RESTRICTED_DB_ROLE: 'true',
    METRICS_BEARER_TOKEN: 'metrics-' + 'm'.repeat(48),
    ALLOW_MOCK_LOGIN: 'false',
    BYPASS_ADMIN_AUTH: 'false',
    ENABLE_DEBUG_LOGGING: 'false',
    ALLOW_DEVELOPMENT_ATTESTATION_BYPASS: 'false',
    REWARD_PROCESSOR_ENABLED: 'false',
    POLL_STATUS_MONITOR_ENABLED: 'true',
    VOTE_ANCHOR_ENABLED: 'false',
    AUDIT_CHECKPOINT_ENABLED: 'false',
    CORS_ORIGIN: 'https://admin.example.ge',
    TRUST_PROXY_HOPS: '1',
    MIN_K_ANONYMITY: '30',
    ANDROID_PACKAGE_NAME: 'messaging.dtg',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'play-integrity@example.iam.gserviceaccount.com',
      private_key: 'injected-by-secret-manager',
    }),
    APPLE_DEVICECHECK_KEY_ID: 'ABC123DEFG',
    APPLE_DEVICECHECK_TEAM_ID: 'TEAM123456',
    APPLE_DEVICECHECK_PRIVATE_KEY: apple.privateKey,
    APPLE_APP_ID_PREFIX: 'TEAM123456',
    APPLE_BUNDLE_ID: 'ge.dtfg.mobile',
    APPLE_APP_ATTEST_ENVIRONMENT: 'development',
    APPLE_APP_ATTEST_REQUIRE_EXTENSIONS: 'true',
    APPLE_APP_ATTEST_ALLOWED_CATEGORIES: '2,3,4',
    APPLE_APP_BUNDLE_VERSION: '1',
  };
}

const resolverFor = (environment: NodeJS.ProcessEnv) => (key: string) => environment[key];

describe('production security validation', () => {
  it('does not impose production requirements on test or development', () => {
    expect(() =>
      assertProductionSecurityConfiguration({ NODE_ENV: 'test' }, () => undefined)
    ).not.toThrow();
  });

  it('accepts a complete production configuration', () => {
    const environment = validProductionEnvironment();
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).not.toThrow();
  });

  it('rejects placeholder secrets and insecure production flags', () => {
    const environment = validProductionEnvironment();
    environment.JWT_SECRET = 'CHANGE_ME_IN_PRODUCTION'.padEnd(64, 'x');
    environment.ALLOW_MOCK_LOGIN = 'true';
    environment.CORS_ORIGIN = 'http://localhost:5173';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/JWT_SECRET contains a development or placeholder value/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/ALLOW_MOCK_LOGIN must be false/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/unsafe production origin/);
  });

  it('rejects a mismatched receipt key pair', () => {
    const environment = validProductionEnvironment();
    const otherPublicKey = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).publicKey;
    environment.RECEIPT_PUBLIC_KEY_PEM = otherPublicKey;

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/do not form a matching key pair/);
  });

  it('requires production device attestation', () => {
    const environment = validProductionEnvironment();
    environment.REQUIRE_DEVICE_ATTESTATION = 'false';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/REQUIRE_DEVICE_ATTESTATION must be true/);
  });

  it('requires exact App Attest release identity and policy', () => {
    const environment = validProductionEnvironment();
    environment.APPLE_APP_ID_PREFIX = 'invalid';
    environment.APPLE_APP_ATTEST_REQUIRE_EXTENSIONS = 'false';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/APPLE_APP_ID_PREFIX/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/APPLE_APP_ATTEST_REQUIRE_EXTENSIONS/);
  });

  it('requires the production App Attest environment and strict category set at deployment', () => {
    const environment = validProductionEnvironment();
    environment.DEPLOYMENT_ENV = 'production';
    environment.APPLE_APP_ATTEST_ENVIRONMENT = 'development';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/must be production for a production deployment/);

    environment.APPLE_APP_ATTEST_ENVIRONMENT = 'production';
    environment.APPLE_APP_ATTEST_ALLOWED_CATEGORIES = '2,3,4';
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/must exclude category 3/);
  });

  it('requires MFA and bounded admin session policy in production', () => {
    const environment = validProductionEnvironment();
    environment.ADMIN_MFA_REQUIRED = 'false';
    environment.ADMIN_SESSION_IDLE_SECONDS = '7200';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/ADMIN_MFA_REQUIRED must be true/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/ADMIN_SESSION_IDLE_SECONDS must be an integer/);
  });

  it('requires a restricted runtime database role and protected metrics', () => {
    const environment = validProductionEnvironment();
    environment.ENFORCE_RESTRICTED_DB_ROLE = 'false';
    environment.METRICS_BEARER_TOKEN = 'short';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/ENFORCE_RESTRICTED_DB_ROLE/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/METRICS_BEARER_TOKEN/);
  });

  it('requires a workload token file for production Vault authentication', () => {
    const environment = validProductionEnvironment();
    environment.DEPLOYMENT_ENV = 'production';
    environment.APPLE_APP_ATTEST_ENVIRONMENT = 'production';
    environment.APPLE_APP_ATTEST_ALLOWED_CATEGORIES = '2,4';
    environment.VAULT_REQUIRED = 'false';
    environment.VAULT_TOKEN = 'long-lived-token';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/VAULT_REQUIRED/);
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/VAULT_TOKEN_FILE/);
  });

  it('requires explicit production worker decisions', () => {
    const environment = validProductionEnvironment();
    delete environment.REWARD_PROCESSOR_ENABLED;

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/REWARD_PROCESSOR_ENABLED must be explicitly set/);
  });

  it('requires an exact RPC hostname allow-list for blockchain workers', () => {
    const environment = validProductionEnvironment();
    environment.REWARD_PROCESSOR_ENABLED = 'true';

    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).toThrow(/BLOCKCHAIN_RPC_ALLOWED_HOSTS is required/);

    environment.BLOCKCHAIN_RPC_ALLOWED_HOSTS = 'rpc.example.ge';
    expect(() =>
      assertProductionSecurityConfiguration(environment, resolverFor(environment))
    ).not.toThrow();
  });
});
