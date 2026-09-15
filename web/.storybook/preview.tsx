import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import { themes } from 'storybook/theming'
import '../src/index.css'
import './preview.css'

/**
 * The theme this Storybook renders — one, and there is no picker for it
 * (Katerina, 2026-09-11, D58).
 *
 * `ship`, the app's palette (her ruling, 2026-08-28). A toolbar also offered
 * `dark` — Peek's dark theme copied verbatim, 2026-08-27 — until 2026-09-11.
 * It was a choice the app cannot make: Ship ships one theme and cannot switch
 * at runtime, so a Ship component seen in `dark` was a component in a state
 * nobody can reach. Checking a *shared* component across themes is
 * estiva-ui's Storybook's job, and it has the picker.
 *
 * Driven by the `data-theme` attribute on <html> — the same switch the app
 * uses (index.html) — so a story and the running app can never disagree
 * about how a theme is selected. `forceTheme` on a story still overrides it.
 */
const DEFAULT_THEME = 'ship'

const applyTheme = (theme?: string) => {
  document.documentElement.dataset.theme = theme ?? DEFAULT_THEME
}

// Apply the theme once, for EVERY page — including standalone MDX docs
// (Introduction), which don't run story decorators. The
// toolbar listener that used to sit here went with the picker: nothing
// changes the theme global any more, so there is nothing to follow.
applyTheme(DEFAULT_THEME)

const withTheme: Decorator = (Story, context) => {
  const theme = (context.parameters.forceTheme as string) ?? DEFAULT_THEME
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  return <Story />
}

const preview: Preview = {
  // Every component gets a Docs tab from its JSDoc + argTypes.
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
    // Docs pages render in the dark chrome; the example blocks take the
    // app's canvas via .docs-story in preview.css.
    docs: { theme: themes.dark },
    options: {
      // Docs first; the rest follows Peek's taxonomy where the concepts match
      // (one component, not two that drift), Ship's own sections after.
      storySort: {
        order: ['Docs', ['Introduction'], 'Primitives', 'Feedback', 'Inputs', 'Overlays', 'Issues', 'Projects', 'Conversations', 'Navigation', 'Views'],
      },
    },
  },
  decorators: [withTheme],
}

export default preview
