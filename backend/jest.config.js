/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // Exclude integration/e2e tests that require a live DB + Redis.
  // These are run separately in the ci.yml backend-test job.
  testPathIgnorePatterns: [
    '/node_modules/',
    'tests/enrollment-e2e.test.ts',
    'tests/auth.test.ts',
    'tests/nonce.test.ts',
    'tests/health.test.ts',
    'tests/sanity.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
  },
};
