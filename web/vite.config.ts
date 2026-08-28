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
// `react` is deduped because @estiva-app/ui declares it a peer: two copies in
// one tree is the "invalid hook call" crash, which appears at runtime and not
// at build time. The package itself needs no `fs.allow` entry — it installs
// from npm into node_modules, where it used to be a `file:` link to a sibling
// directory that existed on one machine.

// The dev server takes :5191 so the old app can keep :5190 beside it. Both apps
// still exist in the tree — REW-9 removes the old one — but only this one is
// built into the image and served.
//
// `outDir` is <repo>/dist/ship because that is where the image looks:
// `COPY --from=build /app/dist/ship /usr/share/nginx/html`. It used to be the
// old app's esbuild output; the cutover (REW-8) moved the name to this build
// rather than changing the Dockerfile's destination, so nginx, deploy/ and
// update.sh are all untouched by the switch.
//
// `emptyOutDir` is required and not merely tidy: Vite refuses to clear a
// directory outside its root without it, and the directory already holds the
// old app's `bundle.js` in any tree that has run the root build. Left behind,
// that file is served by nothing and read by no one, but it makes `dist/ship`
// look like it holds two apps.
export default defineConfig({
  plugins: [react()],
  define: BUILD_DEFINES,
  build: {
    outDir: '../dist/ship',
    emptyOutDir: true,
  },
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
      allow: [here, repoRoot],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
