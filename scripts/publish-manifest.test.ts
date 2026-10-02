/**
 * `npm run manifest` refuses anything but the live key, and writes nothing.
 *
 * Until this test, a missing or malformed `.manifest-key` got a fresh key
 * written into it — through a symlink, over the only copy of the live key — and
 * `manifest-address.ts` rewritten to the new pubkey, so the next build
 * recommended a manifest nobody else had heard of. Only `--dry-run` compared
 * the key with the address.
 *
 * These run the real script as a subprocess against temporary key files
 * (`MANIFEST_KEY_FILE`), never the live one, and compare bytes before and
 * after. The relay is a closed port: a refusal never reaches it, and a script
 * that did would fail differently and, before the guard, write first.
 *
 *   npx tsx scripts/publish-manifest.test.ts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicKeyFromSecret } from '@estiva-app/protocol'
import { MANIFEST_ADDRESS } from '../src/nostr/manifest-address'
import { readManifestKey } from './manifest-key'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const root = new URL('..', import.meta.url).pathname
const script = join(root, 'scripts/publish-manifest.ts')
const tsx = join(root, 'node_modules/.bin/tsx')
const addressFile = join(root, 'src/nostr/manifest-address.ts')
const repoKey = join(root, '.manifest-key')
const dir = mkdtempSync(join(tmpdir(), 'manifest-key-'))

const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const otherKey = randomKey()

function run(keyFile: string, args: string[] = []) {
  return spawnSync(tsx, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MANIFEST_KEY_FILE: keyFile, RELAY_URL: 'http://127.0.0.1:9', APP_URL: 'http://127.0.0.1:5190/' },
    timeout: 60_000,
  })
}

/** The bytes a run must not change: the key file (or its absence), the address, the repo's own key. */
function snapshot(keyFile: string) {
  const bytes = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '<absent>')
  const link = (() => {
    try {
      return lstatSync(keyFile).isSymbolicLink() ? `link→${readlinkSync(keyFile)}` : 'file'
    } catch {
      return '<absent>'
    }
  })()
  return JSON.stringify({ key: bytes(keyFile), link, address: bytes(addressFile), repoKey: bytes(repoKey) })
}

const malformedTarget = join(dir, 'malformed-target')
writeFileSync(malformedTarget, 'not a key\n')
const cases: Array<[string, string, () => void]> = [
  ['missing', join(dir, 'missing'), () => {}],
  ['empty', join(dir, 'empty'), () => writeFileSync(join(dir, 'empty'), '')],
  ['malformed', join(dir, 'malformed'), () => writeFileSync(join(dir, 'malformed'), 'deadbeef\n')],
  ['uppercase hex', join(dir, 'upper'), () => writeFileSync(join(dir, 'upper'), `${otherKey.toUpperCase()}\n`)],
  ['another pubkey', join(dir, 'wrong'), () => writeFileSync(join(dir, 'wrong'), `${otherKey}\n`)],
  ['a symlink to a malformed file', join(dir, 'link'), () => symlinkSync(malformedTarget, join(dir, 'link'))],
  ['a dangling symlink', join(dir, 'dangling'), () => symlinkSync(join(dir, 'nowhere'), join(dir, 'dangling'))],
]

for (const [name, keyFile, setup] of cases) {
  setup()
  for (const args of [[], ['--dry-run']]) {
    const mode = args.length ? '--dry-run' : 'publish'
    const before = snapshot(keyFile)
    const targetBefore = readFileSync(malformedTarget, 'utf8')
    const result = run(keyFile, args)
    check(
      `${mode} with ${name} key exits non-zero and says why`,
      result.status !== 0 && result.status !== null && /Refusing to/.test(result.stderr),
      `status ${result.status}${result.error ? `, ${result.error.message}` : ''}`,
    )
    check(`${mode} with ${name} key writes nothing`, snapshot(keyFile) === before && readFileSync(malformedTarget, 'utf8') === targetBefore)
    check(`${mode} with ${name} key never reaches the relay`, !/^relay /m.test(result.stdout), result.stdout.split('\n')[0])
  }
}
check('a dangling symlink still dangles', !existsSync(join(dir, 'nowhere')))

// ── The guard accepts exactly the key of the address ───────────────────────
const goodFile = join(dir, 'good')
writeFileSync(goodFile, `${otherKey}\n`)
const otherAddress = `31990:${publicKeyFromSecret(otherKey)}:estiva-ship`
const accepted = readManifestKey(goodFile, otherAddress)
check('the key of the address is accepted, trimmed', 'secretKeyHex' in accepted && accepted.secretKeyHex === otherKey)
check('and refused against the live address', 'refused' in readManifestKey(goodFile, MANIFEST_ADDRESS))

rmSync(dir, { recursive: true, force: true })
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
