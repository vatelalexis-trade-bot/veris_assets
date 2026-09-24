// Lints repository tooling (scripts and root config files). Each package has its own config.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['apps/**', 'packages/**', 'node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  prettier,
];
