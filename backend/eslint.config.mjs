import js from '@eslint/js';
import globals from 'globals';
import * as tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { 
    ignores: ['dist', 'coverage', 'eslint.config.mjs'] 
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript performs identifier resolution. The base JS no-undef rule
      // produces false positives for NodeJS and DOM type names.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Legacy debt is visible as warnings while newly introduced correctness
      // errors still fail `npm run lint -- --quiet`.
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-this-alias': 'warn'
    },
  },
];
