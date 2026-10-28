/**
 * Re-reading only the Folders that changed — PER-17.
 *
 *   npx tsx scripts/reload-folders.test.ts
 *
 * Offline, against a fake relay that answers `queryAll` from a list and counts
 * what it was asked. The claims: `reloadFolders` asks for the named Folders and
 * nothing else, the result folds the same as a fresh `loadAll` would, and what
 * it did not ask about is kept rather than lost.
 */
import { publicKeyFromSecret, signEvent, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { Store, foldWorkspace, type WorkspaceState } from '../src/nostr/store'
import { buildChange, buildIssue, buildProject, issueAddr, projectAddr } from '../src/nostr/events'
import type { Signer } from '../src/nostr/signer'
import { KIND } from '../src/nostr/kinds'
import { createLoadQuery, type QueryFn } from '@estiva-app/interop'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const SECRET = '0'.repeat(63) + '1'
const ME = publicKeyFromSecret(SECRET)
const sign = (unsigned: UnsignedEvent): SignedEvent => signEvent(unsigned, SECRET)

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

let clock = 1_780_000_000_000
const at = () => (clock += 1000)

const projectA = sign(buildProject(ME, at(), { projectId: 'pa', title: 'Alpha', folder: A }))
const projectB = sign(buildProject(ME, at(), { projectId: 'pb', title: 'Beta', folder: B }))
const issueA1 = sign(buildIssue(ME, at(), { issueId: 'a1', title: 'A one', folder: A, projectAddr: projectAddr(ME, 'pa') }))
const issueA2 = sign(buildIssue(ME, at(), { issueId: 'a2', title: 'A two', folder: A, projectAddr: projectAddr(ME, 'pa') }))
const issueB1 = sign(buildIssue(ME, at(), { issueId: 'b1', title: 'B one', folder: B, projectAddr: projectAddr(ME, 'pb') }))
const doneB1 = sign(buildChange(ME, at(), { target: issueAddr(ME, 'b1'), field: 'status', value: 'done', folder: B }))

/** The relay: a list of events, filtered the way Buzz does for the shapes Store sends. */
let held: SignedEvent[] = [projectA, projectB, issueA1, issueA2, issueB1, doneB1]
let asked: Record<string, unknown>[][] = []

function matches(event: SignedEvent, filter: Record<string, unknown>): boolean {
  const kinds = filter.kinds as number[] | undefined
  if (kinds && !kinds.includes(event.kind)) return false
  const h = filter['#h'] as string[] | undefined
  if (h && !event.tags.some((t) => t[0] === 'h' && h.includes(t[1]))) return false
  return true
}

const relay = {
  async queryAll(filters: Record<string, unknown>[]) {
    asked.push(filters)
    return held.filter((event) => filters.some((filter) => matches(event, filter)))
  },
} as unknown as Relay

const store = new Store(relay, { pubkey: ME } as unknown as Signer)
const statusOf = (state: ReturnType<typeof foldWorkspace>, title: string) =>
  state.issues.find((issue) => issue.title === title)?.status

const read = createLoadQuery(relay.queryAll.bind(relay) as QueryFn, { paged: true })
const full = await store.loadAllEvents(read)
const changeReads = asked.flat().filter((filter) => (filter.kinds as number[]).includes(KIND.CHANGE))
check('a load reads changes once, as the whole kind', changeReads.length === 1 && Object.keys(changeReads[0]).join() === 'kinds', JSON.stringify(changeReads))
check('beside discovery, then both Folders', asked.length === 3 && asked[2].length === 2, JSON.stringify(asked))
check("B's issue has its status from that read", statusOf(foldWorkspace(full), 'B one') === 'done', statusOf(foldWorkspace(full), 'B one'))
asked = []
const listed = await read([{ kinds: [KIND.CHANGE], '#a': [issueAddr(ME, 'b1')], limit: 1000 }])
check("a listing's change read in the same load is answered from it", asked.length === 0 && listed.length === 1, JSON.stringify(asked))
asked = []
await store.loadAllEvents()
check('loadAll reads discovery, then both Folders', asked.length === 3, `${asked.length} queries`)
check('loadAll is the fold of loadAllEvents', JSON.stringify(await store.loadAll()) === JSON.stringify(foldWorkspace(full)))


// Delete one issue in A, then re-read A only.
held = held.filter((event) => event !== issueA2)
asked = []
const afterDelete = await store.reloadFolders(full, [A])
const afterDeleteState = foldWorkspace(afterDelete)
check('one query', asked.length === 1, `${asked.length} queries`)
check(
  'and it names only Folder A',
  asked[0]?.length === 1 && JSON.stringify(asked[0]?.[0]?.['#h']) === JSON.stringify([A]),
  JSON.stringify(asked[0]),
)
check('the deleted issue is gone', !afterDeleteState.issues.some((issue) => issue.title === 'A two'))
check('the other issue in A is still there', afterDeleteState.issues.some((issue) => issue.title === 'A one'))
check("B's issue keeps its status without B being read", statusOf(afterDeleteState, 'B one') === 'done', statusOf(afterDeleteState, 'B one'))
// The fold, and the same events in any order: a reload replaces one Folder's slice of them, and loadAll reads a
// record twice (discovery, then its Folder).
const foldOf = ({ events, ...state }: WorkspaceState) => JSON.stringify({ ...state, events: [...new Set(events.map((event) => event.id))].sort() })
check('folds the same as a fresh loadAll', foldOf(afterDeleteState) === foldOf(await store.loadAll()))

// A status change in A arrives.
held = [...held, sign(buildChange(ME, at(), { target: issueAddr(ME, 'a1'), field: 'status', value: 'in_progress', folder: A }))]
const afterChange = foldWorkspace(await store.reloadFolders(afterDelete, [A]))
check('a change in the re-read Folder shows', statusOf(afterChange, 'A one') === 'in_progress', statusOf(afterChange, 'A one'))

// An issue filed into a Folder nothing had read yet: widening fetches it.
held = [
  ...held,
  sign(buildIssue(ME, at(), { issueId: 'c1', title: 'C one', folder: C })),
  sign(buildChange(ME, at(), { target: issueAddr(ME, 'c1'), field: 'status', value: 'done', folder: C })),
]
asked = []
const afterNew = await store.reloadFolders(afterDelete, [C])
check('a new Folder is added to the set', afterNew.folders.includes(C))
check("and its issue folds with its changes", statusOf(foldWorkspace(afterNew), 'C one') === 'done')
check('without re-reading A or B', asked.every((filters) => filters.every((f) => JSON.stringify(f['#h']) === JSON.stringify([C]))), JSON.stringify(asked))

// No Folders: nothing asked.
asked = []
await store.reloadFolders(full, [])
check('no Folders is no query', asked.length === 0)
check("without the relay's clock, a re-read reads whole Folders", asked.length === 0 && !JSON.stringify(full).includes('"since"'))

/*
  APP-4: with the relay's clock known, a re-read asks only for what is new.

  The relay here honours `since`, and applies a deletion published to it, as
  Buzz does. "Now" events are dated by the real clock, since `readAt` is.
*/
const nowAt = () => Date.now()
const SKEW_MS = 120_000
let published: SignedEvent[] = []
const liveRelay = {
  async queryAll(filters: Record<string, unknown>[]) {
    asked.push(filters)
    return held.filter((event) =>
      filters.some((filter) => matches(event, filter) && (filter.since === undefined || event.created_at >= (filter.since as number))),
    )
  },
  async publish(event: SignedEvent) {
    published.push(event)
    if (event.kind === 5) {
      const target = event.tags.find((t) => t[0] === 'a')?.[1]
      held = held.filter((e) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === 'd')?.[1]}` !== target)
    }
    return { ok: true, eventId: event.id }
  },
} as unknown as Relay
const signer = { pubkey: ME, sign: async (unsigned: UnsignedEvent) => sign(unsigned) } as unknown as Signer
const live = new Store(liveRelay, signer, async () => SKEW_MS)

held = [projectA, issueA1, issueA2, sign(buildIssue(ME, nowAt(), { issueId: 'a3', title: 'A three', folder: A, projectAddr: projectAddr(ME, 'pa') }))]
const first = await live.loadAllEvents()
check('a whole read notes when it read each Folder', typeof first.readAt?.[A] === 'number')

held = [...held, sign(buildChange(ME, nowAt(), { target: issueAddr(ME, 'a1'), field: 'status', value: 'in_progress', folder: A }))]
asked = []
const second = await live.reloadFolders(first, [A])
const since = asked[0]?.[0]?.since
check(
  "a re-read asks for Folder A since its last read, less the relay's commit floor, on the relay's clock",
  asked.length === 1 && since === Math.floor(((first.readAt?.[A] ?? NaN) - SKEW_MS) / 1000) - 960,
  JSON.stringify(asked),
)
const secondState = foldWorkspace(second)
check('a change made since shows', statusOf(secondState, 'A one') === 'in_progress', statusOf(secondState, 'A one'))
check('what the re-read did not return again is kept', secondState.issues.some((issue) => issue.title === 'A two'))
check('an event both reads returned is held once', second.events.filter((e) => e.tags.some((t) => t[1] === 'a3')).length === 1)

// A re-signed issue record is a new version of it: only the newest is kept.
const a3 = (e: SignedEvent) => e.kind === issueA1.kind && e.tags.some((t) => t[0] === 'd' && t[1] === 'a3')
held = [...held.filter((e) => !a3(e)), sign(buildIssue(ME, nowAt() + 1000, { issueId: 'a3', title: 'A three, again', folder: A, projectAddr: projectAddr(ME, 'pa') }))]
const third = await live.reloadFolders(second, [A])
check('a replaced record keeps only its newest version', third.events.filter(a3).length === 1, `${third.events.filter(a3).length} versions`)
check('and shows it', foldWorkspace(third).issues.some((issue) => issue.title === 'A three, again'))

// A deletion this tab made: the relay never returns the issue again, and a re-read since a time cannot say so.
await live.deleteIssue({ folder: A, issue: issueAddr(ME, 'a2') })
check('the deletion reaches the relay', published.some((e) => e.kind === 5 && e.tags.some((t) => t[0] === 'a' && t[1] === issueAddr(ME, 'a2'))))
const fourth = foldWorkspace(await live.reloadFolders(third, [A]))
check('an issue this tab deleted is gone after the re-read', !fourth.issues.some((issue) => issue.title === 'A two'))
check('and the others stay', fourth.issues.some((issue) => issue.title === 'A one') && fourth.issues.some((issue) => issue.title === 'A three, again'))

if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
