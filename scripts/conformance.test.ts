/**
 * Two repos, one recorded answer. This file folds the fixture with Ship's own
 * `foldFolder`; `estiva-agent`'s `scripts/conformance.test.ts` runs the same
 * events through the agent's real read path — Ship's published manifest,
 * folded by `@estiva-app/interop` — and both must equal `expected`.
 *
 * Until PER-21 (estiva-agent#68) the agent held a copy of this fold, and the
 * two copies were what this file compared. The copy is gone; what is compared
 * now is what Ship does against what Ship's manifest says it does, which is
 * what every other reader — Peek included — goes by. Ship's CLAUDE.md names
 * the drift that matters:
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
 * A repository boundary makes that harder to notice, not easier — and so did
 * the manifest, until the agent's side read through it: an issue title the
 * manifest did not fold was found that way (ship#231).
 *
 *   npx tsx scripts/conformance.test.ts
 *
 * Offline. The fixture was recorded from production by the agent's former
 * `scripts/make-conformance-fixture.ts` (see `.claude/rules/wire-and-fold.md`).
 *
 * ## When this fails
 *
 * Ship's fold no longer gives the recorded answer. If the change was on
 * purpose, re-record `expected` with `scripts/refresh-expected.ts`, make the
 * manifest say the same thing, and land the file in `estiva-agent` too.
 *
 * **Do not regenerate the fixture to make it pass** —
 * that erases the finding rather than fixing it. Regenerating is correct only
 * when the fold needs to cover a shape of event nobody had recorded before, and
 * then the new fixture and the checksum below have to land in both repos.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { foldFolder } from '../src/nostr/fold'
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
const EVENTS_SHA256 = '64cd76f53c9ab7ab346c5dd352fd81b58cfedcece1bd9e944c22817368eac14e'

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
  right and the activity order wrong is still a fold that disagrees with the
  recorded answer, and enumerating the fields worth checking is how the next omission gets
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
    : `\n${failures} failed — Ship's fold no longer gives the recorded answer. On purpose? Re-record expected (scripts/refresh-expected.ts) and make the manifest say the same.`,
)
process.exit(failures === 0 ? 0 : 1)
