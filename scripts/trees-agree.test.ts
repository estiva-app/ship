/**
 * The two dependency trees agree about every shared package.
 *
 * ## Why this exists
 *
 * `web/` has its own `package.json` and its own lockfile, and the Dockerfile
 * installs them separately — `npm ci` at the root, then `npm ci --prefix web`.
 * So `@estiva-app/*` is resolved **twice**, independently, and which copy a file
 * gets depends on how it imports:
 *
 *   * `web/src/auth/estivaId.ts` imports `'@estiva-app/identity'` by name and
 *     resolves it from `web/node_modules`;
 *   * `web/src/api/store.ts` imports `'../../../lib/nostr/signer'`, and *that*
 *     file imports the package, resolving it from the **root** `node_modules`.
 *
 * On 2026-09-08 those were `0.1.1` and `0.2.0`. One bundle carried two versions
 * of one package: the author guard from the new one was live and the expiry
 * clamp from it was not, while a merged PR claimed the bump had delivered both.
 *
 * **Nothing catches this.** Both lockfiles are internally consistent, both
 * `npm ci` runs succeed, both test suites pass, and the only place the
 * disagreement exists is the emitted JavaScript. Comparing the *declared* ranges
 * would not have caught it either — `^0.1.1` and `^0.2.0` are both plausible
 * lines to read in a diff. So this compares what the lockfiles **resolve**.
 *
 * Only packages present in *both* trees are compared: `@estiva-app/ui` is
 * browser-only and legitimately absent from the root.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Known disagreements, each with a reason and a date.
 *
 * An entry here is a debt, not a dispensation: it exists so the skew is
 * *visible* and has to be argued away rather than forgotten, which is the whole
 * difference between this and having no check. Remove one by making the trees
 * agree, never by widening it.
 */
const ACCEPTED: Record<string, { root: string; web: string; because: string }> = {
  // Empty, and it stayed empty: the one disagreement this check found on the day
  // it was written turned out to be fixable. `interop` was 0.12.0 at the root
  // and 0.15.0 in `web/` — bumped in #121 on one side only, which is the same
  // mistake #122 made in the other direction. The root's six imports do not
  // touch anything 0.13–0.15 changed, and 0.14.0's withdrawn `records.folder`
  // is unused there, so the fix was a version bump with a clean suite rather
  // than a debt to record.
}

/** What a lockfile actually resolved, per `@estiva-app/*` package. */
function resolved(lockfile: string): Map<string, string> {
  const lock = JSON.parse(readFileSync(join(ROOT, lockfile), 'utf8')) as {
    packages?: Record<string, { version?: string }>
  }
  const out = new Map<string, string>()
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const match = /(?:^|\/)node_modules\/(@estiva-app\/[^/]+)$/.exec(path)
    if (match?.[1] && entry.version) out.set(match[1], entry.version)
  }
  return out
}

const root = resolved('package-lock.json')
const web = resolved('web/package-lock.json')

check('both lockfiles name @estiva-app packages', root.size > 0 && web.size > 0, `root ${root.size}, web ${web.size}`)

const shared = [...root.keys()].filter((name) => web.has(name)).sort()
check('the trees share packages worth comparing', shared.length > 0, shared.join(', '))

for (const name of shared) {
  const r = root.get(name) as string
  const w = web.get(name) as string
  const accepted = ACCEPTED[name]

  if (r === w) {
    check(`${name} agrees`, true, r)
    // A stale entry is worse than none: it keeps a fixed skew on the books and
    // quietly permits it to come back.
    check(`  …and is not still listed as an accepted skew`, accepted === undefined, accepted ? 'remove it from ACCEPTED' : '')
    continue
  }

  if (accepted && accepted.root === r && accepted.web === w) {
    console.log(`⚠️  ${name} disagrees, accepted — root ${r}, web ${w}`)
    console.log(`    ${accepted.because}`)
    continue
  }

  check(
    `${name} agrees`,
    false,
    accepted
      ? `root ${r}, web ${w} — an accepted skew exists but for ${accepted.root}/${accepted.web}, so this is a NEW disagreement`
      : `root ${r}, web ${w}. Bump BOTH package.json files and both lockfiles — 'npm install --package-lock-only <pkg>@^x.y.z' in each`,
  )
}

console.log(failures ? `\n${failures} failed.` : '\nThe two trees agree.')
process.exit(failures ? 1 : 0)
