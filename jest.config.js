export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['<rootDir>/tests/test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(svelte|three)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '^\\$app/(.*)$': '<rootDir>/src/app/$1',
    '^svelte/store$': '<rootDir>/node_modules/svelte/store/index.js',
    '^svelte$': '<rootDir>/node_modules/svelte/index.js',
  },
};
