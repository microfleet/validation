module.exports = {
  testEnvironment: 'node',
  coverageProvider: 'v8',
  verbose: true,
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': '@swc-node/jest'
  }
};
