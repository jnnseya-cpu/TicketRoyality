import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Layer boundaries are enforced here, not by convention. The dependency direction is:
 *
 *     app  ──▶  frontend  ──▶  shared
 *      └───▶  backend    ──▶  shared
 *
 * shared depends on nothing. frontend never reaches into backend — it goes through a
 * route handler in app/api. Breaking either rule is a lint error, not a code review
 * argument.
 */
const layerBoundaries = [
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/frontend/*', '@/backend/*', '@/app/*'],
            message:
              'shared/ is the bottom layer — it must not import frontend, backend or app. ' +
              'Move the dependency down into shared, or move this code up a layer.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/frontend/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/backend/*'],
            message:
              'frontend/ must not import backend/ — server-only code would leak into the ' +
              'client bundle. Call a route handler in app/api instead.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/backend/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/frontend/*'],
            message:
              'backend/ must not import frontend/. Shared contracts belong in shared/.',
          },
        ],
      }],
    },
  },
];

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  ...layerBoundaries,
  {
    rules: {
      // A leading underscore marks a parameter that is deliberately unused — the
      // service stubs keep their full signature so callers compile against the real
      // contract before the Admin SDK wiring lands.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'out/**'] },
];
