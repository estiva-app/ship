import estiva from '@estiva/ui/tailwind-preset'

/**
 * Ship's Tailwind config: the shared preset and nothing of its own.
 *
 * The token NAMES are the contract with every Estiva app and come from
 * @estiva/ui (SHA-5, 2026-08-28); the VALUES are the package's `ship` theme,
 * Ship's own palette. Nothing here needs a Ship-specific edit — a new token
 * is added to the package, in every theme, never here.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [estiva],
  content: ['./index.html', './src/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
}
