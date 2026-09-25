import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const USE_THEME_TOKENS =
  'Use the theme tokens of src/app/globals.css (bg-surface, text-muted…), never colour codes (SPEC §23.1).';
const COLOUR_CODE = String.raw`/(#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\()/`;

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.spec.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${COLOUR_CODE}]`, message: USE_THEME_TOKENS },
        { selector: `TemplateElement[value.raw=${COLOUR_CODE}]`, message: USE_THEME_TOKENS },
        {
          selector: `JSXAttribute[name.name='style']`,
          message: 'Use Tailwind classes, not inline styles.',
        },
      ],
    },
  },
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
