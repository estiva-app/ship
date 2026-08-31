/**
 * Everything the web build reaches is in the Docker build context.
 *
 * ## Why this exists
 *
 * PRO-7 added a top-level `interop/` and did not add a `COPY` for it. The image
 * build then failed with six TypeScript errors, on `main`, after two green
 * jobs — because **the Docker build runs only in the `publish` job, which is
 * skipped on pull requests.** `check` and `web` both passed on a tree that
 * could not be built into an image.
 *
 * Building the image here would catch it and costs minutes on every PR, which
 * this repo deliberately does not spend (see PRODUCTION.md on the twelve
 * disabled workflows). So this asserts the invariant instead: every directory
 * outside `web/` that `web/`'s sources import must be copied by the Dockerfile.
 *
 * It resolves imports rather than matching them, because `../auth/estivaId`
 * from `web/src/api/` stays inside `web/` and a regex reads it as an escape.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const WEB = join(ROOT, 'web')

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/** Top-level directories outside `web/` that `web/` imports from. */
const reached = new Set<string>()
for (const file of sources(join(WEB, 'src'))) {
  for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
    const target = resolve(dirname(file), specifier)
    if (target.startsWith(WEB + '/')) continue
    const rel = relative(ROOT, target)
    if (rel.startsWith('..')) continue
    reached.add(rel.split('/')[0])
  }
}

const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8')
const copied = new Set(
  [...dockerfile.matchAll(/^COPY\s+(?!--from)(\S+)/gm)].map((m) => m[1].replace(/^\.\//, '').split('/')[0]),
)

console.log(`web/ reaches outside itself for: ${[...reached].sort().join(', ')}`)
for (const dir of [...reached].sort()) {
  check(
    `Dockerfile copies ${dir}/`,
    copied.has(dir),
    copied.has(dir) ? '' : `add \`COPY ${dir} ./${dir}\` before the web build, or the image build fails on main`,
  )
}
check('the web build reaches something at all', reached.size > 0, `${reached.size} director(ies)`)

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED — the image build would fail where PR CI does not look.\n`)
  process.exit(1)
}
console.log('\nDocker build context is complete.')
