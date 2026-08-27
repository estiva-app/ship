/**
 * Two repos, one fold. This file is identical in `estiva-agent` and `estiva-ship`.
 *
 * The agent's tooling was extracted out of Ship (PEEK-155), and the honest cost
 * of that was a duplicated protocol layer — `lib/nostr/` and `src/` existed in
 * both repositories, byte for byte, and `diff -r` was what kept them honest.
 *
 * **Half of that is now gone.** SHA-3 moved the wire format into
 * `@estiva-app/protocol`, so both repos import one implementation of the bytes
 * rather than holding two copies of it. What is still duplicated is `src/` — the
 * kinds, the fold, the store, the vocabularies — and that is deliberate: how an
 * app folds events into current truth is where apps are *supposed* to differ, and
 * the package's own rule is that it contains no interpretation.
 *
 * So this file matters more than it did, not less. The duplication it guards is
 * now the duplication nobody intends to remove. Ship's CLAUDE.md names the
 * specific form of drift that matters:
 *
 *   > reimplementing any of it would make the CLI disagree with the app, which
 *   > is the one thing it must not do
 *
 * That is not hypothetical here. PEEK-165 found this exact drift *inside a single
 * repository*: the agent module had reimplemented the surrounding behaviour of
 * Ship's UI and left out the part that resolves a public key in a change value,
 * so the app rendered "Claude set assignee to Claude" and the agent rendered a
 * hex string. Nothing failed. Both were self-consistent. It surfaced only when a
 * person read the two outputs side by side.
 *
 * A repository boundary makes that harder to notice, not easier. So the two
 * copies are held to a recorded agreement: the same production events, folded by
 * each repo's own `foldFolder`, must produce the same state.
 *
 *   npx tsx scripts/conformance.test.ts
 *
 * Offline. The fixture was recorded from production by
 * `scripts/make-conformance-fixture.ts` in `estiva-agent`.
 *
 * ## When this fails
 *
 * It means the two repositories disagree about what the workspace says. Find out
 * which one changed and why. **Do not regenerate the fixture to make it pass** —
 * that erases the finding rather than fixing it. Regenerating is correct only
 * when the fold needs to cover a shape of event nobody had recorded before, and
 * then the new fixture and the checksum below have to land in both repos.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { foldFolder } from '../src/fold'
import type { SignedEvent } from '@estiva-app/protocol'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The fixture both repositories must be holding.
 *
 * Pinned in the test rather than read from the fixture, because a checksum a
 * file carries about itself proves nothing. This is what stops the two repos
 * silently agreeing on *different* inputs — and it means refreshing the fixture
 * is a deliberate change in two places, which is the correct amount of friction
 * for editing a contract between repositories.
 */
const EVENTS_SHA256 = '5fad457070fc19c398975884a82b3c84cbc9cea02e598c3255978c4142927f6f'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

interface Fixture {
  counts: { events: number; projects: number; issues: number; changes: number; conversations: number }
  events: SignedEvent[]
  expected: unknown
}

const fixture = JSON.parse(
  readFileSync(join(here, '..', 'conformance', 'fold-fixture.json'), 'utf8'),
) as Fixture

const digest = createHash('sha256').update(JSON.stringify(fixture.events)).digest('hex')
check('both repos hold the same recorded events', digest === EVENTS_SHA256, digest.slice(0, 16))
check(
  'the fixture is worth folding',
  fixture.events.length > 50 && fixture.counts.changes > 20,
  `${fixture.events.length} events, ${fixture.counts.changes} changes`,
)

const actual = foldFolder(fixture.events)

/** The first place two structures disagree, as a path a person can go and look at. */
function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  if (Object.is(a, b)) return null
  if (a === null || b === null || typeof a !== typeof b || typeof a !== 'object') {
    return `${path || '(root)'}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} items ≠ ${b.length} items`
    for (let i = 0; i < a.length; i++) {
      const found = firstDifference(a[i], b[i], `${path}[${i}]`)
      if (found) return found
    }
    return null
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const found = firstDifference(left[key], right[key], path ? `${path}.${key}` : key)
    if (found) return found
  }
  return null
}

/*
  Compared as a whole rather than field by field. A fold that got the statuses
  right and the activity order wrong is still a fold the two repos disagree
  about, and enumerating the fields worth checking is how the next omission gets
  in — PEEK-165 was precisely a field nobody thought to check.
*/
const difference = firstDifference(JSON.parse(JSON.stringify(actual)), fixture.expected)
check('this repo folds the events into the recorded state', difference === null, difference ?? '')

const state = actual as { projects: unknown[]; issues: unknown[]; activity: unknown[]; conversations: unknown[] }
check('projects', state.projects.length === fixture.counts.projects, `${state.projects.length}`)
check('issues', state.issues.length === fixture.counts.issues, `${state.issues.length}`)
check('changes', state.activity.length === fixture.counts.changes, `${state.activity.length}`)
check('conversations', state.conversations.length === fixture.counts.conversations, `${state.conversations.length}`)

console.log(
  failures === 0
    ? '\nThis repo agrees with the recorded fold.'
    : `\n${failures} failed — the two repositories disagree about the workspace.`,
)
process.exit(failures === 0 ? 0 : 1)
