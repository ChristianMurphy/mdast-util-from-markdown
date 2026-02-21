/**
 * @import {FlatXoConfig} from 'xo'
 */

/** @type {FlatXoConfig} */
const xoConfig = [
  {
    name: 'default',
    prettier: true,
    rules: {
      complexity: 'off',
      'max-depth': 'off',
      'prefer-destructuring': 'off',
      'prefer-object-spread': 'off',
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prefer-string-replace-all': 'off'
    },
    space: true
  },
  {
    files: ['test/**/*.js'],
    rules: {'no-await-in-loop': 'off'}
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/array-type': ['error', {default: 'generic'}],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-restricted-types': 'off',
      '@typescript-eslint/no-duplicate-type-constituents': 'off'
    }
  }
]

export default xoConfig
