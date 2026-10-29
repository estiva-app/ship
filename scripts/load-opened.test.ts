/**
 * The opened project or issue, read before the whole workspace — APP-4.
 *
 *   npx tsx scripts/load-opened.test.ts
 *
 * Offline, against a fake relay that answers `queryAll` from a list and records
 * what it was asked. The claims: the opened page's read finds its record by `d`
 * (a project record is global, in no Folder's `#h` read), reads its own Folder
 * with the changes in it, and reads no other Folder — so an issue's status and
 * its project's name are there, and the rest of the workspace is not.
 */
import { publicKeyFromSecret, signEvent, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { Store, foldWorkspace } from '../src/nostr/store'
import { buildChange, buildIssue, buildProject, issueAddr, projectAddr } from '../src/nostr/events'
import type { Signer } from '../src/nostr/signer'

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

let clock = Date.now() - 600_000
const at = () => (clock += 1000)

const held: SignedEvent[] = [
  sign(buildProject(ME, at(), { projectId: 'pa', title: 'Alpha', folder: A })),
  sign(buildProject(ME, at(), { projectId: 'pb', title: 'Beta', folder: B })),
  sign(buildIssue(ME, at(), { issueId: 'a1', title: 'A one', folder: A, projectAddr: projectAddr(ME, 'pa') })),
  sign(buildChange(ME, at(), { target: issueAddr(ME, 'a1'), field: 'status', value: 'done', folder: A })),
  // Alpha's issue filed in another Folder: it joins the list when the whole read lands.
  sign(buildIssue(ME, at(), { issueId: 'c1', title: 'C one', folder: C, projectAddr: projectAddr(ME, 'pa') })),
  sign(buildIssue(ME, at(), { issueId: 'b1', title: 'B one', folder: B, projectAddr: projectAddr(ME, 'pb') })),
  sign(buildChange(ME, at(), { target: issueAddr(ME, 'b1'), field: 'status', value: 'in_progress', folder: B })),
  // Alpha is archived — a change in Alpha's own Folder, not in C, where c1 sits.
  sign(buildChange(ME, at(), { target: projectAddr(ME, 'pa'), field: 'archived', value: 'true', folder: A })),
  // b2 was filed under Beta and moved to Alpha: the move is a change in b2's own Folder.
  sign(buildIssue(ME, at(), { issueId: 'b2', title: 'B two', folder: B, projectAddr: projectAddr(ME, 'pb') })),
  sign(buildChange(ME, at(), { target: issueAddr(ME, 'b2'), field: 'project', value: projectAddr(ME, 'pa'), folder: B })),
]
let asked: Record<string, unknown>[][] = []

const tagIn = (event: SignedEvent, name: string, values: unknown) => Array.isArray(values) && event.tags.some((t) => t[0] === name && values.includes(t[1]))

/** The asks sent as one request (`query`), not paged (`queryAll`), which spends a confirming round trip on a fresh relay. */
let single: Record<string, unknown>[][] = []
const answer = (filters: Record<string, unknown>[]) =>
  held.filter((event) =>
    filters.some(
      (filter) =>
        (!filter.kinds || (filter.kinds as number[]).includes(event.kind)) &&
        (!filter['#h'] || tagIn(event, 'h', filter['#h'])) &&
        (!filter['#d'] || tagIn(event, 'd', filter['#d'])),
    ),
  )
const relay = {
  async queryAll(filters: Record<string, unknown>[]) {
    asked.push(filters)
    return answer(filters)
  },
  async query(filters: Record<string, unknown>[]) {
    asked.push(filters)
    single.push(filters)
    return answer(filters)
  },
} as unknown as Relay

const store = new Store(relay, { pubkey: ME } as unknown as Signer)
const foldersAsked = () => [...new Set(asked.flat().flatMap((filter) => (filter['#h'] as string[] | undefined) ?? []))]

const project = await store.loadOpened({ kind: 'project', d: 'pa' })
const projectState = foldWorkspace(project)
check('an opened project is there, found by its d', projectState.projects.map((p) => p.title).join() === 'Alpha', JSON.stringify(projectState.projects.map((p) => p.title)))
check('with the issues in its own Folder, and their status', projectState.issues.find((issue) => issue.title === 'A one')?.status === 'done', JSON.stringify(projectState.issues))
check("and nothing from another Folder: its issue filed elsewhere comes with the whole read", projectState.issues.length === 1, JSON.stringify(projectState.issues.map((i) => i.title)))
check('it asked only its own Folder', foldersAsked().join() === A, JSON.stringify(asked))
check('in two round trips', asked.length === 2, `${asked.length}`)
check('its record by d in one request, not paged', single.length === 1 && single[0][0]['#d']?.toString() === 'pa' && typeof single[0][0].limit === 'number', JSON.stringify(single))
check('and is kept as read nowhere, so no re-read starts from it', Object.keys(project.readAt).length === 0)

asked = []
const issue = foldWorkspace(await store.loadOpened({ kind: 'issue', d: 'b1' }))
check('an opened issue is there with its status', issue.issues.find((i) => i.id === 'b1')?.status === 'in_progress', JSON.stringify(issue.issues))
check("and its project's record, for the breadcrumb", issue.projects.map((p) => p.title).join() === 'Beta', JSON.stringify(issue.projects.map((p) => p.title)))
check('it asked only its own Folder', foldersAsked().join() === B, JSON.stringify(asked))

/*
  An issue under an archived project is read-only in every app
  (an-archived-file-is-read-only-in-every-app): the archive is a change in the
  project's own Folder, so an issue filed elsewhere must read that Folder too,
  or its page opens editable for the seconds before the whole read lands.
*/
asked = []
const elsewhere = foldWorkspace(await store.loadOpened({ kind: 'issue', d: 'c1' }))
check('an issue filed outside its project\'s Folder still reads that project as archived', elsewhere.projects.find((p) => p.title === 'Alpha')?.archived === true, JSON.stringify(elsewhere.projects))
check('by reading the project\'s own Folder after the issue\'s', foldersAsked().join() === [C, A].join(), JSON.stringify(asked))

asked = []
const moved = foldWorkspace(await store.loadOpened({ kind: 'issue', d: 'b2' }))
const b2 = moved.issues.find((i) => i.title === 'B two')
check('a moved issue reads the project it was moved to, archived, not the one it was filed under', b2?.projectAddr === projectAddr(ME, 'pa') && moved.projects.find((p) => p.addr === b2.projectAddr)?.archived === true, JSON.stringify(moved.projects))

asked = []
const missing =foldWorkspace(await store.loadOpened({ kind: 'issue', d: 'nothing-here' }))
check('a d nobody holds reads nothing more, and folds empty', missing.issues.length === 0 && asked.length === 1, JSON.stringify(asked))

if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
