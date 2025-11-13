import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import nPlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';

export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'],
    ignores: ['dist/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        node: true,
        es2022: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
      'n': nPlugin,
      'promise': promisePlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-console': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];