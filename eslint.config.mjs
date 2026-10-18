import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';

const ENV_MESSAGE = 'Read configuration through src/infra/config (ADR 0004).';
const COPY_MESSAGE = 'User-facing text comes from the cs copy catalogue (src/ui/copy).';

/** `globalThis.process.env` — the one form no-restricted-properties cannot see. */
const GLOBAL_ENV = {
  selector: "MemberExpression[object.property.name='process'][property.name='env']",
  message: ENV_MESSAGE,
};

/** Attributes that screen readers or users see: their text must come from the catalogue. */
const TEXT_ATTRIBUTES =
  '/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|alt|title|placeholder|label)$/';
const UI_COPY_SYNTAX = [
  { selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > Literal`, message: COPY_MESSAGE },
  {
    selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > :matches(Literal, TemplateLiteral)`,
    message: COPY_MESSAGE,
  },
  {
    // {ok ? 'Uloženo' : 'Chyba'} and {busy && 'Ukládám…'} in element children
    selector:
      'JSXElement > JSXExpressionContainer :matches(ConditionalExpression, LogicalExpression) > Literal[raw=/^[\'"]/]',
    message: COPY_MESSAGE,
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      // Small files keep modules focused (ADR 0004).
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Configuration is read in exactly one place (ADR 0004).
    files: ['src/**/*.{ts,tsx,mts,cts,js,mjs}'],
    // instrumentation.ts reads only NEXT_RUNTIME, a constant Next inlines at build time.
    ignores: ['src/infra/config/**', 'src/instrumentation.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: ENV_MESSAGE },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'process', message: ENV_MESSAGE },
            { name: 'node:process', message: ENV_MESSAGE },
          ],
        },
      ],
      'no-restricted-syntax': ['error', GLOBAL_ENV],
    },
  },
  {
    // User-facing text comes from the Czech copy catalogue, never inline JSX.
    files: ['src/app/**/*.tsx', 'src/ui/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ['→', '←', '·', '–', '—', '/', '|', '*', ':', '(', ')', '„', '“'],
        },
      ],
      // Overrides the block above for these files, so it repeats GLOBAL_ENV.
      'no-restricted-syntax': ['error', GLOBAL_ENV, ...UI_COPY_SYNTAX],
    },
  },
  {
    // Command-line scripts and the CLI report to the terminal.
    files: ['scripts/**', 'src/cli/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Table-driven tests are long by nature.
    files: ['**/*.test.{ts,tsx}', 'test/**'],
    rules: { 'max-lines': 'off' },
  },
  prettier,
]);
