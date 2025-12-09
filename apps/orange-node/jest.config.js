/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/tests/**',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
    }]
  },
  // Setup files if needed
  // setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
};
