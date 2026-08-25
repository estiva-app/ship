import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import { addons } from 'storybook/preview-api'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import { themes } from 'storybook/theming'
import '../src/index.css'
import './preview.css'

/**
 * The themes this Storybook can render.
 *
 * Two: `ship`, the app's own provisional palette, and `dark`, Peek's dark
 * theme copied verbatim (2026-08-27) so the two can be compared from the
 * toolbar. A further candidate is another `[data-theme="<name>"]` block in
 * index.css plus one more entry here.
 *
 * Driven by the `data-theme` attribute on <html> — the same switch the app
 * uses (index.html) — so a story and the running app can never disagree
 * about how a theme is selected.
 */
const THEMES = ['ship', 'dark'] as const
const DEFAULT_THEME: (typeof THEMES)[number] = 'ship'

const applyTheme = (theme?: string) => {
  document.documentElement.dataset.theme = theme ?? DEFAULT_THEME
}

// Drive the theme from the toolbar for EVERY page — including standalone MDX
// docs (Introduction, Design Tokens), which don't run story decorators.
try {
  addons.getChannel().on(GLOBALS_UPDATED, ({ globals }: { globals: { theme?: string } }) => {
    applyTheme(globals?.theme)
  })
} catch {
  /* channel not ready at import — the decorator still covers story pages */
}

// Apply the default immediately so MDX pages render themed on first load.
applyTheme(DEFAULT_THEME)

const withTheme: Decorator = (Story, context) => {
  const theme = (context.parameters.forceTheme as string) ?? context.globals.theme ?? DEFAULT_THEME
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  return <Story />
}

const preview: Preview = {
  // Every component gets a Docs tab from its JSDoc + argTypes.
  tags: ['autodocs'],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [...THEMES],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: DEFAULT_THEME },
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
        order: ['Docs', ['Introduction', 'Design Tokens'], 'Primitives', 'Feedback', 'Inputs', 'Overlays', 'Issues', 'Projects', 'Conversations', 'Navigation', 'Views'],
      },
    },
  },
  decorators: [withTheme],
}

export default preview
