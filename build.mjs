/** Bundle every app in apps/ into dist/<app>/. No framework, no config. */
import { build } from 'esbuild'
import { cpSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs'

/**
 * The relay the built bundle talks to, baked in at build time.
 *
 * Deployment is the only thing that decides this — the relay URL *is* the
 * workspace (see the header comment in apps/ship/app.ts), so it is not
 * something a user picks at runtime. CI sets `RELAY_URL` to the public origin;
 * everything else gets the local default.
 *
 * The default must stay exactly `http://localhost:3000`: `scripts/smoke.ts`
 * intercepts that origin and asserts the profile menu displays it. Exporting
 * `RELAY_URL` in a shell where you then run `npm run smoke` will fail the
 * smoke test, which is annoying but honest — the bundle really would be
 * pointed somewhere else.
 */
const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'

const apps = readdirSync('apps', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

if (existsSync('dist')) rmSync('dist', { recursive: true })

for (const app of apps) {
  mkdirSync(`dist/${app}`, { recursive: true })
  await build({
    entryPoints: [`apps/${app}/app.ts`],
    bundle: true,
    format: 'esm',
    outfile: `dist/${app}/bundle.js`,
    logLevel: 'warning',
    define: { __RELAY_URL__: JSON.stringify(RELAY_URL) },
  })
  cpSync(`apps/${app}/index.html`, `dist/${app}/index.html`)
  console.log(`built ${app} → ${RELAY_URL}`)
}
