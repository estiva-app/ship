/**
 * Rebuild the conformance fixture's synthetic events, keeping the recorded ones byte-identical.
 *
 *   npx tsx scripts/fixture-synthetic.ts conformance/fold-fixture.json
 *
 * The fixture is production **plus** cases a healthy workspace cannot show:
 * changes trying to make their write always win, and changes signed in a
 * Folder their target is not in. They were appended by the agent's former
 * `make-conformance-fixture.ts` (estiva-agent d5e39b7); this is that half of it,
 * kept here because Ship's fold is the one `expected` records. It drops every
 * event signed with `FIXTURE_KEY`, signs the cases below, re-sorts by id, and
 * re-records `expected` and `counts`. Change the cases on purpose only, and
 * then land the file and the new `EVENTS_SHA256` in both repositories.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { publicKeyFromSecret, signEvent, type SignedEvent } from '@estiva-app/protocol'
import { foldFolder } from '../src/nostr/fold'
import { KIND } from '../src/nostr/kinds'

/**
 * A fixed key, so rebuilding produces the same file. These events are never
 * published; they are signed properly anyway, because an event that would not
 * survive a relay is not evidence about anything.
 */
const FIXTURE_KEY = '1'.repeat(64)
const pubkey = publicKeyFromSecret(FIXTURE_KEY)
const base = 1_700_000_000

/** A real recorded issue the ordering cases fold into, so they land in real state. */
const ISSUE = '30851:b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46:c3b96ada-9de3-40f8-9010-5182ffcecedd'
/** That issue's Folder: its root's `h`. */
const ISSUE_FOLDER = 'bf9997de-96a6-4932-a2a0-8c01938eb205'
/** A Folder none of the targets below is in. */
const ELSEWHERE = 'fixture-folder'

const sign = (createdAt: number, kind: number, tags: string[][], content: string): SignedEvent =>
  signEvent({ pubkey, created_at: createdAt, kind, tags, content }, FIXTURE_KEY)

const change = (
  createdAt: number,
  placement: string[][],
  target: string,
  field: string,
  value: string,
  note: string,
  ts?: number,
): SignedEvent =>
  sign(
    createdAt,
    KIND.CHANGE,
    [...placement, ['a', target], ['field', field], ['value', value], ...(ts === undefined ? [] : [['ts', String(ts)]])],
    note,
  )

const inIssueFolder = [['h', ISSUE_FOLDER]]

/**
 * §6.3's ordering rules, in the issue's own Folder.
 *
 * They carried `h` `fixture-folder` until SPEC §6.2 (2026-10-14) made a reader
 * ignore a change outside its target's Folder; from then on every reader
 * dropped them and the fixture tested no ordering at all. Same cases, same
 * times, now where a reader reads them.
 */
const ordering = [
  // A ts far outside the window. Must be ignored; created_at decides.
  change(base, inIssueFolder, ISSUE, 'status', 'todo', 'hostile ts, must not win', Number.MAX_SAFE_INTEGER),
  // A ts inside the window, ordering this after the one above within the same second.
  change(base, inIssueFolder, ISSUE, 'status', 'in_progress', 'trusted ts, finer than a second', base * 1000 + 500),
  // Three sharing one created_at and carrying no ts: the id tie-break, alone.
  change(base + 1, inIssueFolder, ISSUE, 'assignee', pubkey, 'tie a'),
  change(base + 1, inIssueFolder, ISSUE, 'assignee', 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46', 'tie b'),
  change(base + 1, inIssueFolder, ISSUE, 'assignee', '', 'tie c'),
  // The boundary pair: `drifted` claims a ts 3 s after its created_at. Refused
  // at 1 s of slack, so `later` wins; widen the window past 3 s and it does not.
  change(base + 10, inIssueFolder, ISSUE, 'status', 'done', 'drifted ts, refused at 1s of slack', (base + 13) * 1000),
  change(base + 12, inIssueFolder, ISSUE, 'status', 'cancelled', 'later by created_at, wins while the window is 1s'),
  // A `ref` set by a change, on an issue whose root already carries a different one.
  change(base + 20, inIssueFolder, ISSUE, 'ref', 'FIXTURE-9', 'a display key assigned after the fact'),
]

/**
 * SPEC §6.2: a change counts only when its first `h` with a value is a Folder
 * the target's newest root carries. Each ignored one is the newest for its
 * field, so reading it would change the folded value.
 */
const folderRule = [
  change(base + 40, [['h', ELSEWHERE]], ISSUE, 'status', 'done', 'signed in another Folder, must not count'),
  change(base + 42, [['h', ''], ['h', ISSUE_FOLDER]], ISSUE, 'title', 'Read by its first h with a value', 'an empty h ahead of the real one names nothing'),
  change(base + 43, [], ISSUE, 'title', 'No Folder named', 'no h at all, must not count'),
  change(base + 44, [['h', ELSEWHERE], ['buzz-channel', ISSUE_FOLDER]], ISSUE, 'status', 'in_progress', 'a buzz-channel on a change proves nothing, must not count'),
]

/** A root that names no Folder has none to be outside of: every change counts. */
const UNPLACED = `${KIND.ISSUE}:${pubkey}:fixture-no-folder`
const unplaced = [
  sign(base + 30, KIND.ISSUE, [['d', 'fixture-no-folder'], ['title', 'Filed before h was required']], ''),
  change(base + 45, [['h', ELSEWHERE]], UNPLACED, 'status', 'done', 'its root names no Folder, so this counts'),
]

/** A project placed by `buzz-channel` alone (SPEC §7.3) is in that Folder. */
const PLACED = `${KIND.PROJECT}:${pubkey}:fixture-buzz-channel`
const buzzChannel = [
  sign(base + 30, KIND.PROJECT, [['d', 'fixture-buzz-channel'], ['name', 'Placed by buzz-channel'], ['buzz-channel', ELSEWHERE]], ''),
  change(base + 46, [['h', ELSEWHERE]], PLACED, 'lead', pubkey, 'in the Folder its root names by buzz-channel, so this counts'),
  change(base + 47, [['h', ISSUE_FOLDER]], PLACED, 'lead', '', 'signed in another Folder, must not count'),
]

/**
 * An issue whose description lives in a `description` tag, with empty content —
 * the shape a consumer filing through `add-issue` writes (SHA-19). Two versions:
 * the newer is in another Folder, and a reader checks against the newest.
 */
const TAGGED = `${KIND.ISSUE}:${pubkey}:fixture-tagged-description`
const taggedRoot = (createdAt: number, folder: string) =>
  sign(
    createdAt,
    KIND.ISSUE,
    [
      ['d', 'fixture-tagged-description'],
      ['title', 'Filed from another app'],
      ['h', folder],
      ['description', 'The body arrived in a tag, because a consumer cannot write content.'],
    ],
    '',
  )
const tagged = [
  taggedRoot(base + 30, ELSEWHERE),
  taggedRoot(base + 31, 'fixture-folder-moved'),
  change(base + 48, [['h', ELSEWHERE]], TAGGED, 'status', 'done', "the older root's Folder, must not count"),
  change(base + 35, [['h', 'fixture-folder-moved']], TAGGED, 'status', 'in_progress', "the newest root's Folder, so this counts"),
]

const path = process.argv[2]!
const fixture = JSON.parse(readFileSync(path, 'utf8'))
const recorded = (fixture.events as SignedEvent[]).filter((event) => event.pubkey !== pubkey)
const hashOf = (events: SignedEvent[]) => createHash('sha256').update(JSON.stringify(events)).digest('hex')
const recordedBefore = hashOf(recorded)

const events = [...recorded, ...ordering, ...folderRule, ...unplaced, ...buzzChannel, ...tagged].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
)
const expected = foldFolder(events)
const kinds = new Map<number, number>()
for (const event of events) kinds.set(event.kind, (kinds.get(event.kind) ?? 0) + 1)
fixture.events = events
fixture.counts = {
  events: events.length,
  recorded: recorded.length,
  adversarial: events.length - recorded.length,
  projects: expected.projects.length,
  issues: expected.issues.length,
  changes: expected.activity.length,
  conversations: expected.conversations.length,
  byKind: Object.fromEntries([...kinds].sort((a, b) => a[0] - b[0])),
}
fixture.expected = expected
writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n')

const written = JSON.parse(readFileSync(path, 'utf8')).events as SignedEvent[]
console.log(hashOf(written.filter((event) => event.pubkey !== pubkey)) === recordedBefore ? 'recorded events unchanged ✅' : 'RECORDED EVENTS MOVED ❌ — stop')
console.log(`EVENTS_SHA256 = '${hashOf(written)}'`)
console.log(JSON.stringify(fixture.counts))
