/**
 * The vendored runtime has not been edited here.
 *
 * `interop/projection.ts` is a copy of Peek's, and the whole value of PRO-7 is
 * that Ship consumes *the same* code a third app would install. A local fix —
 * however small, however correct — makes this a fork, and a fork cannot push
 * back on the API, which is the one thing this consumer exists to do.
 *
 * So the file is pinned by hash. Editing it fails here rather than drifting
 * quietly; re-vendoring means updating `VENDORED_SHA256` in the same commit as
 * the copy. See `interop/VENDORED.md`.
 *
 * This catches an edit made *here*. Upstream moving is a different question and
 * needs both repos, which is what `diff -r interop ../peek-app/interop` is for.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const VENDORED_SHA256 = 'a9adde0175a50dd43f5dcdd63f8e09a92a8527872b6051f73525ac09c914a4ee'
const FILE = new URL('../interop/projection.ts', import.meta.url).pathname

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const actual = createHash('sha256').update(readFileSync(FILE)).digest('hex')
check(
  'the vendored runtime is byte-identical to what was imported',
  actual === VENDORED_SHA256,
  actual === VENDORED_SHA256 ? actual.slice(0, 16) + '…' : `got ${actual.slice(0, 16)}…, expected ${VENDORED_SHA256.slice(0, 16)}…`,
)

if (failures > 0) {
  console.error(
    `\n${failures} check(s) FAILED.\n` +
      `  interop/projection.ts has been edited in this repository.\n` +
      `  If that was deliberate, it should not be — put the change in Peek and re-vendor.\n` +
      `  If you re-vendored, update VENDORED_SHA256 and interop/VENDORED.md in this commit.\n`,
  )
  process.exit(1)
}
console.log('\nVendored runtime unmodified.')
