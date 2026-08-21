/**
 * The manifest reader must not know anything about Ship.
 *
 * `manifest-reader.ts` exists to answer whether a stranger can read this app
 * from its published manifest alone (PEEK-150). That answer is worth exactly as
 * much as the isolation it was measured under: one `import { KIND }` for
 * convenience, and it silently becomes Ship-specific code that happens to fetch
 * a manifest, still printing the same output and no longer proving anything.
 *
 * The failure mode is what makes this worth a test rather than a comment. A
 * leaked import does not break the probe — it makes it *work better*, which is
 * precisely why nobody would notice.
 *
 *   npx tsx scripts/manifest-reader.test.ts
 *
 * Offline. It reads the file as text and never runs it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'manifest-reader.ts'), 'utf8')

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const imports = [...source.matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1])
check('the reader imports something', imports.length > 0, imports.join(', '))

/*
  `src/` is where every piece of Ship's own knowledge lives — kinds, the fold,
  the store, the vocabularies. Nothing there may be reachable from here.
*/
const shipSpecific = imports.filter((path) => /(^|\/)\.\.\/src\//.test(path) || path.includes('/apps/'))
check('it imports nothing from src/ or an app module', shipSpecific.length === 0, shipSpecific.join(', '))

/*
  What it *is* allowed: the relay client, the signer, and the credential
  exchange. Those are how any consumer would talk to any Nostr relay, and
  knowing them is knowing the substrate rather than knowing Ship.
*/
const allowed = /^\.\.\/lib\/(nostr\/(relay|signer|events)|agent\/credentials)$/
const unexpected = imports.filter((path) => !allowed.test(path) && !path.startsWith('node:'))
check('it imports only the relay, signer and credentials', unexpected.length === 0, unexpected.join(', '))

/*
  Kind numbers are the sharpest tell, because they are what the manifest is
  supposed to supply. 31990 is the exception and has to be: it is NIP-89's own
  kind, the one number you need in order to ask an app to describe itself, and
  no manifest can declare the kind you use to fetch that manifest.
*/
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*\*.*$/gm, '')
const kindNumbers = [...withoutComments.matchAll(/\b(\d{4,5})\b/g)]
  .map((m) => Number(m[1]))
  .filter((n) => n !== 31990 && n !== 2000 && n !== 1000 && n !== 500)
check(
  'no Ship kind number is written into the code',
  kindNumbers.length === 0,
  kindNumbers.join(', '),
)

/*
  Status values are the other tell. `todo` and `in_progress` are Ship's
  vocabulary, which the manifest publishes precisely so a consumer does not have
  to hold a copy — and a consumer holding a copy is one that breaks silently the
  day the app adds a status.
*/
const vocabularyLeak = /'(todo|in_progress|done|cancelled|planned|archived)'/.exec(withoutComments)
check('no status value is written into the code', vocabularyLeak === null, vocabularyLeak?.[0] ?? '')

console.log(failures === 0 ? '\nThe manifest reader is still app-agnostic.' : `\n${failures} failed.`)
process.exit(failures === 0 ? 0 : 1)
