/** Bundle every app in apps/ into dist/<app>/. No framework, no config. */
import { build } from 'esbuild'
import { cpSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs'

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
  })
  cpSync(`apps/${app}/index.html`, `dist/${app}/index.html`)
  console.log(`built ${app}`)
}
