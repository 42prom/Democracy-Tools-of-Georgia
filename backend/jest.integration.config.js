/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/tests/auth.test.ts',
    '<rootDir>/tests/health.test.ts',
    '<rootDir>/tests/nonce.test.ts',
    '<rootDir>/tests/sanity.test.ts',
    '<rootDir>/tests/survey-voting.integration.test.ts',
  ],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  maxWorkers: 1,
  detectOpenHandles: true,
};
