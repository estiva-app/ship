import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Ship's own Storybook, self-contained.
 *
 * It loads only this app's stories. The shared component library gets its own
 * Storybook inside the @estiva/ui package (SHA-5); Peek's instance loading
 * other repos' stories was a stopgap from before that package existed, and
 * somebody building Ship should need Ship and the installed package, nothing
 * else.
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/stories/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
}

export default config
