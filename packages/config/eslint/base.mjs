// Shared ESLint flat config for TypeScript packages running on Node.js.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const USE_DECIMAL =
  'Amounts, quantities and rates use Decimal from @veris/shared, never JavaScript numbers (SPEC rule 7).';

/**
 * Forbids the usual ways of turning amounts into floating-point numbers. Arithmetic operators on
 * Decimal/Money values are already rejected by TypeScript, since they are objects.
 */
const decimalSafetyRules = {
  'no-restricted-globals': ['error', { name: 'parseFloat', message: USE_DECIMAL }],
  'no-restricted-syntax': [
    'error',
    { selector: "CallExpression[callee.name='Number']", message: USE_DECIMAL },
    {
      selector: "MemberExpression[object.name='Number'][property.name='parseFloat']",
      message: USE_DECIMAL,
    },
    { selector: "MemberExpression[object.name='Math']", message: USE_DECIMAL },
    { selector: "UnaryExpression[operator='+']", message: USE_DECIMAL },
    {
      selector: "CallExpression[callee.object.name='z'][callee.property.name='number']",
      message:
        'Amounts and quantities travel as decimal strings in JSON (SPEC §21.2), not z.number().',
    },
  ],
};

/**
 * @param {{ tsconfigRootDir: string, decimalSafeFiles?: string[] }} options
 *   tsconfigRootDir: directory of the package's tsconfig.json;
 *   decimalSafeFiles: globs of business code where floating-point conversions are forbidden.
 */
export function nodeTypeScriptConfig({ tsconfigRootDir, decimalSafeFiles = [] }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      files: ['**/*.mjs', '**/*.js'],
      ...tseslint.configs.disableTypeChecked,
    },
    {
      // HTTP test clients return untyped JSON bodies; tests assert on them explicitly.
      files: ['**/*.spec.ts', '**/*.int-spec.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
    ...(decimalSafeFiles.length > 0
      ? [{ files: decimalSafeFiles, rules: decimalSafetyRules }]
      : []),
    prettier,
  );
}
