/** Unit tests: fast, no database needed. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json', diagnostics: false }] },
  setupFiles: ['<rootDir>/../test/silence-logs.ts'],
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.service.ts', '**/*.util.ts', '**/*.guard.ts', 'ai/*.ts'],
};
