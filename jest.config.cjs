module.exports = {
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!**/*.config.js',
  ],
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    '^[@|~]/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  coveragePathIgnorePatterns: ['<rootDir>/coverage'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest'],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    'node_modules/(?!@mylibrary/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}
