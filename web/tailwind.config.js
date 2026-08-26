import estiva, { estivaContent } from '@estiva-app/ui/tailwind-preset'

/**
 * Ship's Tailwind config: the shared preset and nothing of its own.
 *
 * The token NAMES are the contract with every Estiva app and come from
 * @estiva-app/ui (SHA-5, 2026-08-28); the VALUES are the package's `ship` theme,
 * Ship's own palette. Nothing here needs a Ship-specific edit — a new token
 * is added to the package, in every theme, never here.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [estiva],
  // The package's components are source; their classes must be scanned too.
  // `estivaContent` is the package's own files. Tailwind does not merge
  // `content` from a preset — verified — so without spreading it every class
  // used only by a shared component is purged, and the app builds and tests
  // clean while rendering at the wrong size.
  content: [...estivaContent, './index.html', './src/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
}
