import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import { parser as typescriptParser } from 'typescript-eslint'

/**
 * The token contract as a machine rule — the package's `eslint.config.js`
 * (estiva-ui, stage 0) brought into Ship (ADOPTION S11, D36, 2026-09-08).
 * Ship had no ESLint at all before this; only the class rules run, so the
 * commit that adds the lint changes no component.
 *
 * Three things a class list may not do, each of which has shipped a silent
 * defect here:
 *
 * 1. Name a class Tailwind does not generate. The token names are doubled in
 *    the class (`bg-bg-surface`, not `bg-surface`); the shorter spelling
 *    compiles to nothing and is dropped without a word. The sign-in screen
 *    rendered transparent that way (COMPONENTS-SHIP F1). `no-unknown-classes`
 *    reads tailwind.config.js, so it knows exactly what the preset generates.
 * 2. Reach for Tailwind's own type ramp or palette (`text-sm`, `bg-gray-100`).
 *    Those are not tokens, so they do not follow the theme.
 * 3. Write a raw colour into an arbitrary value, or an opacity modifier on a
 *    token colour (`bg-bg-inset/40` compiled to nothing — F17, D16). A colour
 *    with no token is a missing token; it goes into the package's tokens.css.
 *
 * Where the plugin looks: every `className`, every `cn()` / `clsx()` argument,
 * and the values of a class map whose name ends in `Styles` / `_STYLES` or
 * `Classes` / `_CLASSES`. A class map named any other way is invisible to the
 * lint, so name it that way.
 *
 * Plus one hooks rule, `react-hooks/exhaustive-deps`, as a warning: three
 * hooks in `api/` already carried `eslint-disable-next-line` comments for it,
 * written for a lint that did not exist here, and ESLint refuses a directive
 * for an unknown rule. The rest of the set Peek runs waits for S17.
 */
export default defineConfig([
  globalIgnores(['dist/', 'storybook-static/', 'node_modules/']),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'better-tailwindcss': betterTailwindcss, 'react-hooks': reactHooks },
    settings: {
      'better-tailwindcss': {
        tailwindConfig: 'tailwind.config.js',
        selectors: [
          ...getDefaultSelectors(),
          {
            kind: 'variable',
            name: '^(?:[A-Z][A-Z0-9_]*_(?:STYLES|CLASSES)|[a-z][a-zA-Z0-9]*(?:Styles|Classes))$',
            match: [{ type: 'strings' }, { type: 'objectValues' }],
          },
        ],
      },
    },
    rules: {
      // The one hooks rule three hooks in `api/` already carry directives for,
      // as a warning. Peek runs the whole recommended set; here it found 30
      // things in Ship's own code (ADOPTION S17), which is a PR of its own.
      'react-hooks/exhaustive-deps': 'warn',
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: '^(?:[a-z0-9-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)$',
              message: "Tailwind's type ramp is not a token. Use the ramp from the package: text-body-2, text-caption, text-h3, text-btn-default...",
            },
            {
              pattern:
                '^(?:[a-z0-9-]+:)*(?:text|bg|border|ring|outline|fill|stroke|decoration|divide|placeholder|from|via|to|accent|caret|shadow)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[0-9]{2,3})?(?:/[0-9]{1,3})?$',
              message: "Tailwind's palette is not a token. Use a colour from the package (bg-bg-surface, text-text-primary, border-border-subtle...); a colour with no token is a missing token.",
            },
            {
              pattern: '^(?:[a-z0-9-]+:)*[a-z-]+-[[][^]]*(?:#[0-9a-fA-F]{3}|rgba?[(]|hsla?[(]|oklch[(])',
              message: 'A raw colour is a missing token: add it to the package (tokens.css in every theme block, and the preset), or say why not in an eslint-disable comment.',
            },
            {
              pattern: '^(?:[a-z0-9-]+:)*(?:text|bg|border|ring|outline|fill|stroke|decoration|divide|placeholder|from|via|to|accent|caret|shadow)-(?:bg|text|border|accent|info|warning|success|error)-[a-z-]+/[0-9]{1,3}$',
              message: 'An opacity modifier on a token colour compiles to nothing. A transparent colour is a token of its own (D16): add it to the package.',
            },
          ],
        },
      ],
    },
  },
])
