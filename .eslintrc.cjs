module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json']
  },
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'standard-with-typescript'
  ],
  rules: {
    'no-console': 'error'
  },
  ignorePatterns: ['dist/**']
}
