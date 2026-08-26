import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Files Vite may serve. Setting `allow` replaces Vite's default (this app's
 * root), so the app's own directories are named again beside the two that
 * are outside it: the repo (the data layer in ../src and ../lib) and
 * @estiva/ui, consumed as source through its file: link.
 */
const webRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const estivaUiRoot = fileURLToPath(new URL('../../../estiva-ui', import.meta.url))

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
  viteFinal: (viteConfig) => {
    // Stories must be deterministic and must never touch production: the
    // build-time values are pinned to the local relay and to "no sign-in",
    // whatever the shell environment says. Same three names as the app build
    // (vite.config.ts), so a component reading src/config.ts works here too.
    viteConfig.define = {
      ...viteConfig.define,
      __RELAY_URL__: JSON.stringify('http://localhost:3000'),
      __ID_BASE__: JSON.stringify(''),
      __CLIENT_ID__: JSON.stringify('estiva-ship'),
    }
    viteConfig.resolve = { ...viteConfig.resolve, dedupe: [...(viteConfig.resolve?.dedupe ?? []), 'react', 'react-dom'] }
    viteConfig.server = { ...viteConfig.server, fs: { ...viteConfig.server?.fs, allow: [...(viteConfig.server?.fs?.allow ?? []), webRoot, repoRoot, estivaUiRoot] } }
    return viteConfig
  },
}

export default config
