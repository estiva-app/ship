import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * The three values baked in at build time. deploy.yml's `publish` job sets
 * them for production; the image only wraps what that build wrote (PER-16).
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

// `react` is deduped because @estiva-app/ui declares it a peer: two copies in
// one tree is the "invalid hook call" crash, which appears at runtime and not
// at build time. The package itself needs no `fs.allow` entry — it installs
// from npm into node_modules, where it used to be a `file:` link to a sibling
// directory that existed on one machine.

// The dev server takes :5191, the port it had beside the old app's :5190;
// the scripts and docs that name it did not move when REW-9 deleted that app.
//
// `outDir` is <repo>/dist/ship because that is where the image looks:
// `COPY dist/ship /usr/share/nginx/html`. It was the old app's esbuild output
// first; the cutover (REW-8) kept the name so nginx, deploy/ and update.sh
// were untouched by the switch.
//
// `emptyOutDir` is said out loud rather than left to Vite's default: a stale
// file left in dist/ship would go into the image.
export default defineConfig({
  plugins: [react()],
  define: BUILD_DEFINES,
  build: {
    outDir: 'dist/ship',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  /**
   * Two projects, split by extension, as Peek's PER-14. Setting up jsdom was
   * the largest single cost in the suite (PER-16), and a `.test.ts` file mostly
   * has no DOM to test, so it runs under node. A `.test.ts` file that does need
   * the DOM says so with a `// @vitest-environment jsdom` header.
   *
   * Both read `src/` only: `scripts/*.test.ts` are standalone `tsx` scripts
   * (`npm run test:scripts`), not Vitest suites, and share the extension.
   */
  test: {
    globals: true,
    setupFiles: './src/test-setup.ts',
    projects: [
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx'] },
      },
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts'] },
      },
    ],
  },
})
