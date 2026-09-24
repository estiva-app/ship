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
import { Store, foldWorkspace } from '../src/store'
import { buildChange, buildIssue, buildProject, issueAddr, projectAddr } from '../src/events'
import type { Signer } from '../lib/nostr/signer'

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

const full = await store.loadAllEvents()
check('loadAll reads discovery, then both Folders', asked.length === 2, `${asked.length} queries`)
check('loadAll is the fold of loadAllEvents', JSON.stringify(await store.loadAll()) === JSON.stringify(foldWorkspace(full)))

const statusOf = (state: ReturnType<typeof foldWorkspace>, title: string) =>
  state.issues.find((issue) => issue.title === title)?.status

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
check(
  'folds the same as a fresh loadAll',
  JSON.stringify(afterDeleteState) === JSON.stringify(await store.loadAll()),
)

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

if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
