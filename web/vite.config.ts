import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * The three values baked in at build time — the same names, the same defaults
 * and the same meaning as the old app's build.mjs, so the Dockerfile's
 * `RELAY_URL=… ID_BASE=… CLIENT_ID=… npm run build` line works unchanged at
 * the cutover.
 *
 * Build-time on purpose: the relay URL *is* the workspace, not a runtime
 * choice, and Ship has no backend to read it from. A bundle pointed at a
 * different relay is a different application, not a misconfigured one.
 *
 * - `RELAY_URL` must default to exactly `http://localhost:3000`. The smoke
 *   test intercepts that origin and asserts the profile menu names it.
 * - An empty `ID_BASE` means sign-in is not offered at all — a deliberate
 *   fail-closed default, never "use production".
 * - `CLIENT_ID` is what Estiva ID knows this app as.
 */
export const BUILD_DEFINES = {
  __RELAY_URL__: JSON.stringify(process.env.RELAY_URL ?? 'http://localhost:3000'),
  __ID_BASE__: JSON.stringify(process.env.ID_BASE ?? ''),
  __CLIENT_ID__: JSON.stringify(process.env.CLIENT_ID ?? 'estiva-ship'),
}

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
// @estiva/ui is a local link (file:../../estiva-ui) consumed as SOURCE: Vite
// resolves the link to its real path, outside this repo, so it is allowed
// below — and `react` is deduped so the package's own copy is never a
// second React (the "invalid hook call" crash).
const estivaUiRoot = fileURLToPath(new URL('../../estiva-ui', import.meta.url))

// The dev server takes :5191 so the old app can keep :5190 beside it — the two
// run side by side until the cutover (REW-8).
//
// Output lands in web/dist/ while both apps coexist; production expects the
// bundle at <repo>/dist/ship, which the old app writes today. Re-pointing
// `outDir` there is a one-line change that belongs to the cutover, not to
// the scaffold.
export default defineConfig({
  plugins: [react()],
  define: BUILD_DEFINES,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      // The data seam (src/api) imports Ship's data layer from ../src and
      // ../lib, one level above this app. Vite refuses to serve files outside
      // its root unless told the repo is the boundary — and the package is
      // one level further out.
      allow: [here, repoRoot, estivaUiRoot],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
