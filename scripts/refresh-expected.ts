/**
 * Re-record only the `expected` fold, leaving `events` byte-identical.
 *
 *   npx tsx scripts/refresh-expected.ts conformance/fold-fixture.json
 *
 * The fixture's checksum covers the *inputs*. A fold that gains a field, or a
 * rule that changes on purpose (PER-21: a same-millisecond tie goes to the
 * higher id), changes the recorded output and nothing else, so re-recording the
 * events would be both unnecessary and the thing conformance.test.ts warns
 * against.
 *
 * Lives here since PER-21: Ship's fold is the one `expected` records.
 * `estiva-agent` folds the same events through `@estiva-app/interop` and is
 * held to this file's output, so the refreshed fixture lands there too.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { foldFolder } from '../src/nostr/fold'

const path = process.argv[2]
const fixture = JSON.parse(readFileSync(path, 'utf8'))
const before = createHash('sha256').update(JSON.stringify(fixture.events)).digest('hex')
fixture.expected = foldFolder(fixture.events)
writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n')
const after = createHash('sha256')
  .update(JSON.stringify(JSON.parse(readFileSync(path, 'utf8')).events))
  .digest('hex')
console.log(`events sha256 before: ${before}`)
console.log(`events sha256 after : ${after}`)
console.log(before === after ? 'inputs unchanged ✅' : 'INPUTS MOVED ❌ — stop')
