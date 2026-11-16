/**
 * A file's own conversation, read by what it is about, not as its Folder's
 * whole conversation — ALO-27.
 *
 *   npx tsx scripts/own-threads.test.ts
 *
 * Offline, against a fake relay that answers `queryAll` from a list and records
 * what it was asked. A topic's page in Ship read its team's whole chat to draw
 * one topic's. The claims: the topic's comments, replies and edits are read,
 * and nothing else the team said; the team's whole conversation is never asked
 * for; a reply posted afterwards arrives with the team's live re-read, which
 * asks only for what is new; and a screen that draws the team's conversation
 * still reads it whole.
 */
import { buildEdit, publicKeyFromSecret, signEvent, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { Store, foldWorkspace, type WorkspaceEvents } from '../src/nostr/store'
import { buildConversationMessage } from '../src/nostr/events'
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

const TEAM = '44444444-4444-4444-8444-444444444444'
const ELSEWHERE = '55555555-5555-4555-8555-555555555555'
const TOPIC = `30840:${ME}:66666666-6666-4666-8666-666666666666`
const OTHER_TOPIC = `30840:${ME}:77777777-7777-4777-8777-777777777777`

let clock = Date.now() - 3_600_000
const at = () => (clock += 1000)
const edit = (target: SignedEvent, body: string) => sign(buildEdit(ME, at(), { channelUuid: target.tags.find((t) => t[0] === 'h')![1]!, targetEventId: target.id, body }))
/** An older message about a file: a `kind:9` naming it by `a`, and a `kind:9` reply naming its root by `e`. */
const chat = (folder: string, body: string, tags: string[][]) => sign({ kind: KIND.MESSAGE, pubkey: ME, created_at: Math.floor(at() / 1000), content: body, tags: [['h', folder], ...tags] })

// The topic's own conversation: a comment, a reply to it and that reply's edit; an older `kind:9` thread with its reply and the reply's edit.
const comment = sign(buildConversationMessage(ME, at(), { folder: TEAM, body: 'Shipping Friday?', about: TOPIC }))
const reply = sign(buildConversationMessage(ME, at(), { folder: TEAM, body: 'Yes, Friday.', replyToComment: { id: comment.id, anchor: TOPIC } }))
const replyEdited = edit(reply, 'Yes, Friday morning.')
const older = chat(TEAM, 'Kick-off notes', [['a', TOPIC]])
const olderReply = chat(TEAM, 'Thanks', [['e', older.id, '', 'root']])
const olderReplyEdited = edit(olderReply, 'Thanks!')
// Not the topic's: the team's other talk, another topic's thread, and a reply naming the old thread from another Folder.
const teamTalk = chat(TEAM, 'Lunch?', [])
const otherTopic = sign(buildConversationMessage(ME, at(), { folder: TEAM, body: 'Other topic', about: OTHER_TOPIC }))
const strayReply = chat(ELSEWHERE, 'From elsewhere', [['e', older.id, '', 'root']])

let held: SignedEvent[] = [comment, reply, replyEdited, older, olderReply, olderReplyEdited, teamTalk, otherTopic, strayReply]
let asked: Record<string, unknown>[][] = []

function matches(event: SignedEvent, filter: Record<string, unknown>): boolean {
  const kinds = filter.kinds as number[] | undefined
  if (kinds && !kinds.includes(event.kind)) return false
  for (const name of ['h', 'a', 'A', 'e']) {
    const values = filter[`#${name}`] as string[] | undefined
    if (values && !event.tags.some((t) => t[0] === name && values.includes(t[1]!))) return false
  }
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false
  if (Array.isArray(filter.ids) && !filter.ids.includes(event.id)) return false
  return true
}

/** While set, the relay gives this reader nothing from the team, as it does once someone is removed from it. */
let removed = false
const relay = {
  async queryAll(filters: Record<string, unknown>[]) {
    asked.push(filters)
    return held.filter((event) => !(removed && event.tags.some((t) => t[0] === 'h' && t[1] === TEAM)) && filters.some((filter) => matches(event, filter)))
  },
} as unknown as Relay

const store = new Store(relay, { pubkey: ME } as unknown as Signer)
const THREADS: number[] = [KIND.MESSAGE, KIND.COMMENT, KIND.MESSAGE_EDIT]
/** A filter asking the team for its conversation with no `since`: the whole of it. */
const askedWholeTeam = () =>
  asked.flat().some((f) => (f['#h'] as string[] | undefined)?.includes(TEAM) && (f.kinds as number[]).some((kind) => THREADS.includes(kind)) && f.since === undefined)
const has = (read: WorkspaceEvents, event: SignedEvent) => read.events.some((e) => e.id === event.id)
const wanted = { folders: [], about: [], own: [TOPIC], live: [TEAM] }

const loaded = await store.loadAllEvents(undefined, () => false)
asked = []
const opened = await store.readThreads(loaded, wanted)
const own = [comment, reply, replyEdited, older, olderReply, olderReplyEdited]
check("the topic's comments, replies and their edits are read", own.every((event) => has(opened, event)), own.filter((e) => !has(opened, e)).map((e) => e.content).join(', '))
// Each "not" below is asserted beside what was read, so a read that brings nothing cannot pass it.
check("nothing else the team said is", has(opened, comment) && !has(opened, teamTalk) && !has(opened, otherTopic))
check("a reply naming the topic's thread from another Folder is not one of its replies", has(opened, olderReply) && !has(opened, strayReply))
check("the team's whole conversation is never asked for", has(opened, comment) && !askedWholeTeam(), JSON.stringify(asked))
check('three requests: by what it is about, by id, and the older replies’ edits', asked.length === 3, String(asked.length))
check('it says it holds the topic’s own conversation and keeps the team live', !!opened.ownOf?.includes(TOPIC) && opened.liveAt?.[TEAM] !== undefined)
check("and not the team's whole conversation, which a screen drawing it still reads", !!opened.ownOf?.includes(TOPIC) && opened.threadsAt[TEAM] === undefined)
const drawn = conversationsAbout(foldWorkspace(opened).conversations, TOPIC)
check('the topic draws its two threads with their replies, edited', drawn.length === 2 && drawn.every((c) => c.replies.length === 1), JSON.stringify(drawn.map((c) => c.replies.length)))

asked = []
const again = await store.readThreads(opened, wanted)
check('asking again for what is held reads nothing', has(again, comment) && asked.length === 0 && again.events.length === opened.events.length)

// Live: someone replies from Peek, and the team talks on. The team's re-read asks only for what is new.
clock = Date.now()
const lateReply = sign(buildConversationMessage(ME, at(), { folder: TEAM, body: 'Friday it is.', replyToComment: { id: comment.id, anchor: TOPIC } }))
const lateTalk = chat(TEAM, 'Coffee?', [])
held = [...held, lateReply, lateTalk]
asked = []
const reloaded = await store.reloadFolders(opened, [TEAM])
check("a reply posted afterwards arrives with the team's re-read", has(reloaded, lateReply))
check('that re-read asks the team only for what is new', !askedWholeTeam() && asked.flat().some((f) => (f['#h'] as string[] | undefined)?.includes(TEAM) && typeof f.since === 'number'), JSON.stringify(asked))
check("in the same request as the team's own re-read", has(reloaded, lateReply) && asked.length === 1, String(asked.length))
check("what the topic held is kept", own.every((event) => has(reloaded, event)))
check('and it still holds it, live', !!reloaded.ownOf?.includes(TOPIC) && (reloaded.liveAt?.[TEAM] ?? 0) >= (opened.liveAt?.[TEAM] ?? 0))
check('the topic draws the new reply', conversationsAbout(foldWorkspace(reloaded).conversations, TOPIC).find((c) => c.id === comment.id)?.replies.length === 2)

// Removed from the team before its first re-read (nothing read it by `#h` yet): that re-read drops the topic's
// conversation, as it drops a Folder's whole one.
// why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/someone-you-remove-loses-access-at-once.md
removed = true
const gone = await store.reloadFolders(opened, [TEAM])
removed = false
check("removed from the team, the topic's conversation is gone on the next re-read", opened.readAt[TEAM] === undefined && own.every((event) => has(opened, event) && !has(gone, event)))

// The team's own page draws its whole conversation: that screen still reads it.
asked = []
const whole = await store.readThreads(reloaded, { folders: [TEAM], about: [] })
check("a screen drawing the team's conversation still reads it whole", askedWholeTeam() && has(whole, teamTalk) && whole.threadsAt[TEAM] !== undefined)

if (failures) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall passed')
