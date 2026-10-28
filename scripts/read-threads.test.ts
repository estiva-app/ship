/**
 * Conversations read only for the screen that draws them — APP-5.
 *
 *   npx tsx scripts/read-threads.test.ts
 *
 * Offline, against a fake relay that answers `queryAll` from a list and records
 * what it was asked. The claims: a load reads messages, comments and edits only
 * from the Folders the screen wants; the screen's file brings in every Folder
 * that mentions it, whole, and no other; a live re-read of a Folder whose
 * conversation is not held does not start reading it; and `loadAll`, which
 * scripts and checks use, still reads every Folder's.
 */
import { publicKeyFromSecret, signEvent, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { Store, foldWorkspace, holdsThreads } from '../src/nostr/store'
import { buildConversationMessage, buildIssue, buildProject, issueAddr, projectAddr } from '../src/nostr/events'
import { conversationsAbout } from '../src/nostr/fold'
import type { Signer } from '../src/nostr/signer'
import { KIND } from '../src/nostr/kinds'

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

const A1 = issueAddr(ME, 'a1')
const B1 = issueAddr(ME, 'b1')
const onA1 = sign(buildConversationMessage(ME, at(), { folder: A, body: 'on a1', about: A1 }))
const onB1 = sign(buildConversationMessage(ME, at(), { folder: B, body: 'on b1', about: B1 }))
// A conversation in C, another project's Folder, that names a1 by its `a`.
const mentionsA1 = sign(buildConversationMessage(ME, at(), { folder: C, body: 'see a1', linkTags: [['a', A1]] }))

let held: SignedEvent[] = [
  sign(buildProject(ME, at(), { projectId: 'pa', title: 'Alpha', folder: A })),
  sign(buildProject(ME, at(), { projectId: 'pb', title: 'Beta', folder: B })),
  sign(buildProject(ME, at(), { projectId: 'pc', title: 'Gamma', folder: C })),
  sign(buildIssue(ME, at(), { issueId: 'a1', title: 'A one', folder: A, projectAddr: projectAddr(ME, 'pa') })),
  sign(buildIssue(ME, at(), { issueId: 'b1', title: 'B one', folder: B, projectAddr: projectAddr(ME, 'pb') })),
  onA1,
  onB1,
  mentionsA1,
]
let asked: Record<string, unknown>[][] = []

function matches(event: SignedEvent, filter: Record<string, unknown>): boolean {
  const kinds = filter.kinds as number[] | undefined
  if (kinds && !kinds.includes(event.kind)) return false
  for (const name of ['h', 'a', 'A']) {
    const values = filter[`#${name}`] as string[] | undefined
    if (values && !event.tags.some((t) => t[0] === name && values.includes(t[1]))) return false
  }
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false
  return true
}

const relay = {
  async queryAll(filters: Record<string, unknown>[]) {
    asked.push(filters)
    return held.filter((event) => filters.some((filter) => matches(event, filter)))
  },
} as unknown as Relay

const store = new Store(relay, { pubkey: ME } as unknown as Signer)
const THREADS: number[] = [KIND.MESSAGE, KIND.COMMENT, KIND.MESSAGE_EDIT]
const askedThreadsOf = (folder: string) =>
  asked.flat().some((filter) => (filter['#h'] as string[] | undefined)?.includes(folder) && (filter.kinds as number[]).some((kind) => THREADS.includes(kind)))
const has = (events: readonly SignedEvent[], event: SignedEvent) => events.some((e) => e.id === event.id)

// The issue page of a1: its own Folder's conversation, nothing else's.
const loaded = await store.loadAllEvents(undefined, (folder) => folder === A)
check("a load reads the wanted Folder's conversation", has(loaded.events, onA1))
check("and no other Folder's", !has(loaded.events, onB1) && !has(loaded.events, mentionsA1))
check('nor asks any other Folder for one', !askedThreadsOf(B) && !askedThreadsOf(C))
check('and says which Folders it holds', JSON.stringify(Object.keys(loaded.threadsAt)) === JSON.stringify([A]), JSON.stringify(Object.keys(loaded.threadsAt)))
check('while every Folder still gives its projects and issues', foldWorkspace(loaded).issues.length === 2 && foldWorkspace(loaded).projects.length === 3)

const wanted = { folders: [A], about: [A1] }
check('it does not yet hold the mentions of a1', !holdsThreads(loaded, wanted))

asked = []
const withMentions = await store.readThreads(loaded, wanted)
check('the Folder mentioning a1 is read for its conversation', has(withMentions.events, mentionsA1) && askedThreadsOf(C))
check('a Folder that does not mention it is not', !has(withMentions.events, onB1) && !askedThreadsOf(B))
check('the wanted Folder is not read again', !askedThreadsOf(A))
check('and now it holds them', holdsThreads(withMentions, wanted))
check("a1's count is today's: its comment and the mention", conversationsAbout(foldWorkspace(withMentions).conversations, A1).length === 2)

asked = []
const again = await store.readThreads(withMentions, wanted)
check('asking for what is held reads no Folder', !askedThreadsOf(A) && !askedThreadsOf(C) && again.events.length === withMentions.events.length)

// Live: B changes. Its conversation is not held, so its re-read does not start reading one.
const lateOnB1 = sign(buildConversationMessage(ME, Date.now(), { folder: B, body: 'later on b1', about: B1 }))
const lateOnA1 = sign(buildConversationMessage(ME, Date.now(), { folder: A, body: 'later on a1', about: A1 }))
held = [...held, lateOnB1, lateOnA1]
asked = []
const reloaded = await store.reloadFolders(withMentions, [A, B])
check("a re-read of a Folder whose conversation is not held leaves it unread", !askedThreadsOf(B) && !has(reloaded.events, lateOnB1))
check('a re-read of a held one brings its new comment', has(reloaded.events, lateOnA1))
check('and what was held stays held', holdsThreads(reloaded, wanted))

// The Issues page: every Folder's, after the rows.
asked = []
const everything = await store.readThreads(reloaded, { folders: [A, B, C], about: [] })
check("every Folder's conversation, once asked for", has(everything.events, onB1) && has(everything.events, lateOnB1))
check('without asking again for the ones held', !askedThreadsOf(A) && !askedThreadsOf(C))

// Scripts and checks read everything, as before.
const all = await store.loadAll()
check("loadAll still reads every Folder's conversation", conversationsAbout(all.conversations, B1).length === 2 && conversationsAbout(all.conversations, A1).length === 3)

if (failures) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
