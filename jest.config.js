/**
 * Enterprise-Grade Jest Configuration
 * Optimized for large-scale TypeScript projects with comprehensive testing requirements
 */

const baseConfig = {
  // Performance and Execution
  maxWorkers: '75%', // Use 75% of available CPU cores for better resource utilization
  maxConcurrency: 15, // Increased concurrency for faster test execution
  testTimeout: 30000, // Default 30 second timeout for enterprise environments
  verbose: true,
  bail: false, // Don't stop on first failure for comprehensive reporting

  // Test Isolation and Cleanup
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  resetModules: true,

  // Environment Setup
  detectOpenHandles: true,
  detectLeaks: false, // Disabled for performance in large test suites
  errorOnDeprecated: true,

  // Reporting and Coverage
  collectCoverage: true,
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'html-spa',
    'json',
    'json-summary',
    'teamcity'
  ],
  coverageDirectory: 'coverage',

  // Exclusions
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/\\.git/',
    '/\\.next/',
    '/\\.nuxt/',
    '/\\.vscode/',
    '/\\.idea/'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@algorand|@txnlab))'
  ],

  // Module Configuration
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],

  // Global Setup
  globalSetup: '<rootDir>/tests/setup/global-setup.ts',
  globalTeardown: '<rootDir>/tests/setup/global-teardown.ts',

  // Test Result Processors
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
      ancestorSeparator: ' › ',
      uniqueOutputName: 'false',
      suiteNameTemplate: '{filepath}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }],
    ['jest-html-reporters', {
      publicPath: './test-results',
      filename: 'report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Test Report',
      logoImgPath: undefined,
      inlineSource: false
    }]
  ],

  // Watch Configuration
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Performance Monitoring
  notify: false,
  notifyMode: 'failure-change',

  // Error Handling
  passWithNoTests: false,
  errorOnDeprecated: true
};

// Project-specific configurations
const projects = [
  // Gateway Service Tests
  {
    displayName: 'Gateway Service',
    testMatch: [
      '<rootDir>/apps/gateway/**/*.test.ts',
      '<rootDir>/apps/gateway/**/*.test.tsx'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/gateway-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'apps/gateway/src/**/*.{ts,tsx}',
      '!apps/gateway/src/**/*.d.ts',
      '!apps/gateway/src/**/*.stories.{ts,tsx}',
      '!apps/gateway/src/**/index.ts'
    ],
    coverageDirectory: 'coverage/gateway',
    coverageThreshold: {
      global: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    testTimeout: 45000, // Gateway tests may need more time
    moduleNameMapping: {
      '^@/(.*)$': '<rootDir>/apps/gateway/src/$1'
    }
  },

  // Orange Node Service Tests
  {
    displayName: 'Orange Node Service',
    testMatch: [
      '<rootDir>/apps/orange-node/**/*.test.ts',
      '<rootDir>/go-apps/orange-node/**/*.test.ts' // Go test wrappers
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/orange-node-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'apps/orange-node/src/**/*.ts',
      '!apps/orange-node/src/**/*.d.ts',
      '!apps/orange-node/src/**/*.stories.{ts,tsx}'
    ],
    coverageDirectory: 'coverage/orange-node',
    coverageThreshold: {
      global: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    testTimeout: 45000
  },

  // Orange SDK Tests
  {
    displayName: 'Orange SDK',
    testMatch: [
      '<rootDir>/packages/orange-sdk/**/*.test.ts',
      '<rootDir>/packages/orange-sdk/**/*.test.tsx'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/sdk-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'jsdom',
    collectCoverageFrom: [
      'packages/orange-sdk/src/**/*.{ts,tsx}',
      '!packages/orange-sdk/src/**/*.d.ts',
      '!packages/orange-sdk/src/**/*.stories.{ts,tsx}'
    ],
    coverageDirectory: 'coverage/orange-sdk',
    coverageThreshold: {
      global: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    moduleNameMapping: {
      '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      '^@orange-sdk/(.*)$': '<rootDir>/packages/orange-sdk/src/$1'
    }
  },

  // Orange React Components Tests
  {
    displayName: 'Orange React',
    testMatch: [
      '<rootDir>/packages/orange-react/**/*.test.tsx',
      '<rootDir>/packages/orange-react/**/*.test.ts'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/react-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts',
      '@testing-library/jest-dom'
    ],
    testEnvironment: 'jsdom',
    moduleNameMapping: {
      '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/tests/__mocks__/fileMock.js',
      '^@orange-react/(.*)$': '<rootDir>/packages/orange-react/src/$1'
    },
    collectCoverageFrom: [
      'packages/orange-react/src/**/*.{ts,tsx}',
      '!packages/orange-react/src/**/*.d.ts',
      '!packages/orange-react/src/**/*.stories.{ts,tsx}',
      '!packages/orange-react/src/**/index.ts'
    ],
    coverageDirectory: 'coverage/orange-react',
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  },

  // Smart Contracts Tests
  {
    displayName: 'Smart Contracts',
    testMatch: [
      '<rootDir>/smart-contracts/**/*.test.ts',
      '<rootDir>/contracts/**/*.test.ts'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/contracts-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'smart-contracts/src/**/*.ts',
      'contracts/src/**/*.ts',
      '!smart-contracts/src/**/*.d.ts',
      '!contracts/src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/contracts',
    coverageThreshold: {
      global: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85
      }
    }
  },

  // Trust Verification Tests
  {
    displayName: 'Trust Verification',
    testMatch: ['<rootDir>/tests/trust-verification/**/*.test.ts'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/trust-verification-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'tests/trust-verification/src/**/*.ts',
      '!tests/trust-verification/src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/trust-verification',
    coverageThreshold: {
      global: {
        branches: 95,
        functions: 95,
        lines: 95,
        statements: 95
      }
    },
    testTimeout: 60000 // Longer timeout for network verification tests
  },

  // Security Tests
  {
    displayName: 'Security Testing',
    testMatch: [
      '<rootDir>/tests/security/**/*.test.ts',
      '<rootDir>/apps/gateway/src/tests/security/**/*.test.ts'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/security-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'tests/security/src/**/*.ts',
      'apps/gateway/src/tests/security/**/*.ts',
      '!tests/security/src/**/*.d.ts',
      '!apps/gateway/src/tests/security/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/security',
    coverageThreshold: {
      global: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    testTimeout: 120000, // Extended timeout for security attack simulations
    maxWorkers: 1 // Run security tests sequentially to avoid interference
  },

  // Economic Model Tests
  {
    displayName: 'Economic Model',
    testMatch: ['<rootDir>/tests/economic/**/*.test.ts'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/economic-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'tests/economic/src/**/*.ts',
      '!tests/economic/src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/economic',
    coverageThreshold: {
      global: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    testTimeout: 90000 // Timeout for economic simulations
  },

  // Performance & Load Testing
  {
    displayName: 'Performance & Load Testing',
    testMatch: [
      '<rootDir>/tests/performance/**/*.test.ts',
      '<rootDir>/tests/chaos/**/*.test.ts'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/performance-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'tests/performance/src/**/*.ts',
      'tests/chaos/src/**/*.ts',
      '!tests/performance/src/**/*.d.ts',
      '!tests/chaos/src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/performance',
    coverageThreshold: {
      global: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85
      }
    },
    testTimeout: 300000, // 5 minutes for comprehensive load tests
    maxWorkers: 1 // Run performance tests sequentially for accurate measurements
  },

  // E2E Integration Tests
  {
    displayName: 'E2E Integration',
    testMatch: [
      '<rootDir>/tests/e2e/**/*.test.ts',
      '<rootDir>/tests/contract/**/*.test.ts'
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/setup/e2e-setup.ts',
      '<rootDir>/tests/setup/common-setup.ts'
    ],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'tests/e2e/src/**/*.ts',
      'tests/contract/src/**/*.ts',
      '!tests/e2e/src/**/*.d.ts',
      '!tests/contract/src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage/e2e',
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 600000, // 10 minutes for complex E2E scenarios
    maxWorkers: 1 // E2E tests should run sequentially
  },

  // Go Applications Tests
  {
    displayName: 'Go Applications',
    testMatch: [
      '<rootDir>/go-apps/**/*_test.go'
    ],
    runner: 'jest-runner-go',
    setupFilesAfterEnv: ['<rootDir>/tests/setup/go-setup.ts'],
    testEnvironment: 'node',
    collectCoverageFrom: [
      'go-apps/**/*.go',
      '!go-apps/**/*_test.go'
    ],
    coverageDirectory: 'coverage/go-apps',
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 120000
  }
];

module.exports = {
  ...baseConfig,
  projects,

  // Coverage aggregation for all projects
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'html-spa',
    'json',
    'json-summary',
    'cobertura'
  ],

  // Custom test environment variables
  testEnvironmentOptions: {
    url: 'http://localhost:3000'
  },

  // Performance monitoring
  logHeapUsage: true,

  // Git integration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // CI/CD Integration
  ci: process.env.CI === 'true',

  // Development vs Production modes
  ...(process.env.NODE_ENV === 'development' && {
    verbose: true,
    notify: true,
    watch: true
  }),

  ...(process.env.NODE_ENV === 'production' && {
    bail: true,
    maxWorkers: 4,
    runInBand: false,
    silent: false
  })
};