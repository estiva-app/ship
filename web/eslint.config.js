import { gateLint, TOKEN_LINT_IGNORES, tokenLint, tokenValues } from '@estiva-app/ui/gates'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Ship's lint: the token contract, one hooks rule, and the UI Guardrails'
 * rules, so an editor shows each of them where the class or the element is
 * typed.
 *
 * The token settings and the gate are the package's own pieces, imported
 * (UIG-32, estiva-ui docs/GATES.md §23). Until then this file carried them
 * itself — 145 lines that were, character for character, the block Peek
 * carried too, measured before the swap. What they do is unchanged:
 *
 * - `tokenLint` — a class Tailwind does not generate (`bg-bg-surface` doubled),
 *   Tailwind's own type ramp or palette, a raw colour, and an opacity modifier
 *   on a token colour (`bg-bg-inset/40` compiled to nothing — F17, D16).
 * - `tokenValues` — UIG-28: type, corners and shadows written by hand, and an
 *   inline `style` that sets a colour (errors); heights, spacing and border
 *   widths written by hand (warnings, never blocking). Tests are out.
 * - `gateLint` — a raw interactive element, behaviour a package part owns
 *   written by hand, a look passed into a part. `npm run lint:rules` runs these
 *   alone, and that is CI's job `gate`.
 *
 * Plus one hooks rule, `react-hooks/exhaustive-deps`, as a warning: three
 * hooks in `api/` already carried `eslint-disable-next-line` comments for it,
 * written for a lint that did not exist here, and ESLint refuses a directive
 * for an unknown rule. The rest of the set Peek runs waits for S17.
 */
export default defineConfig([
  globalIgnores(TOKEN_LINT_IGNORES),
  tokenLint(),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/exhaustive-deps': 'warn' },
  },
  tokenValues(),
  gateLint(),
])
