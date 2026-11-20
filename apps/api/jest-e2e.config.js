/**
 * End-to-end tests: boot the real Nest app against Postgres (pgvector) + Redis.
 * Needs a migrated and seeded database: pnpm db:deploy && pnpm db:seed
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }] },
  setupFiles: ['<rootDir>/test/silence-logs.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
};
