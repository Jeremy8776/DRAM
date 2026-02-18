/**
 * ESLint configuration for DRAM Desktop (Modern Flat Config)
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        __dirname: 'readonly',
        // Electron specific missing from globals.node/browser
        NodeJS: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Best practices
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console for Electron main/renderer
      'prefer-const': 'warn',
      'no-var': 'warn',

      // Style
      'semi': ['warn', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true }]
    }
  }
];
