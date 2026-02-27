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
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    },
  },
];
