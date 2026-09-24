// Shared ESLint flat config for TypeScript packages running on Node.js.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir: string }} options directory of the package's tsconfig.json
 */
export function nodeTypeScriptConfig({ tsconfigRootDir }) {
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
    prettier,
  );
}
