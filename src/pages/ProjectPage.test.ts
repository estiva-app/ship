// @vitest-environment jsdom
/**
 * A project's Activity is where it was mentioned, and nothing else — PEE-26.
 *
 * CON-9 rolled the project's issue threads up into Activity as a `sub-file`
 * relation. That was undone: an issue's comments are read on the issue. They
 * must also stay out of the project's own stream, which is what CON-9 bought
 * and PEE-26 keeps — so both halves are asserted here.
 */
import { addrToNaddr, findNaddrs, naddrToAddr, type SignedEvent } from '@estiva-app/protocol'
import { describe, expect, it } from 'vitest'
import { foldFolder } from '../nostr/fold'
import { anchorIndex } from '../nostr/references'
import { foldWorkspace, type WorkspaceState } from '../nostr/store'
import type { DirectoryView } from '@/api'
import { ACTIVITY_HORIZON, activityFor, cardEditOf, subFileThreads } from './ProjectPage'

const FOLDER = 'ffffffff-0000-0000-0000-000000000000'
const PROJECT = `30850:${'a'.repeat(64)}:the-project`
const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const refs = (body: string) => findNaddrs(body).map((n) => naddrToAddr(n))

let seq = 0
const event = (id: string, tags: string[][], content = ''): SignedEvent =>
  ({
    id,
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000 + ++seq,
    kind: 1111,
    tags: [['h', FOLDER], ...tags],
    content,
    sig: 'x'.repeat(128),
  }) as SignedEvent

const onIssue = (id: string) => event(id, [['A', ISSUE], ['a', ISSUE], ['K', '30851']], 'On the issue.')
/** A comment on some other file that names the project. */
const mention = (id: string) => event(id, [['A', `30851:${'c'.repeat(64)}:elsewhere`], ['a', PROJECT]], `See nostr:${addrToNaddr(PROJECT)}.`)

function workspace(events: SignedEvent[]): WorkspaceState {
  return { ...foldFolder(events, refs), anchors: anchorIndex(events), edits: {}, attachments: {}, events } as unknown as WorkspaceState
}

const directory = {
  directory: {},
  nameOf: (pubkey: string) => pubkey.slice(0, 8),
  personOf: (pubkey: string) => ({ name: pubkey.slice(0, 8) }),
  profileOf: () => undefined,
} as unknown as DirectoryView

describe("a project's Activity (PEE-26)", () => {
  const state = workspace([onIssue('i1'), mention('m1')])

  it('holds the mention and not the comment on its issue', () => {
    const { items } = activityFor(PROJECT, state, directory)
    expect(items.map((i) => [i.thread.id, i.relation])).toEqual([['m1', 'mention']])
  })

  it("still keeps the issue's thread out of the project's stream", () => {
    expect([...subFileThreads(state, new Set([ISSUE]))]).toEqual(['i1'])
  })

  it('keeps every issue thread out of the stream, not only the most recent ACTIVITY_HORIZON', () => {
    const many = workspace(Array.from({ length: ACTIVITY_HORIZON + 5 }, (_, n) => onIssue(`i${n}`)))
    expect(subFileThreads(many, new Set([ISSUE])).size).toBe(ACTIVITY_HORIZON + 5)
  })
})

/*
  Mentioned in follows a message's latest words (PEEKM-7): an edit that swaps
  one app link for another moves the comment from the first file's Activity to
  the second's, as the edit's own `a` says and its words confirm.
  why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-edit-says-what-the-message-links-now.md
*/
describe("an issue's Mentioned in, after an edit swaps the link (PEEKM-7)", () => {
  const ELSEWHERE = `30851:${'c'.repeat(64)}:elsewhere`
  const FIRST = `30851:${'a'.repeat(64)}:first-issue`
  const SECOND = `30851:${'a'.repeat(64)}:second-issue`
  const linkTo = (d: string) => `https://ship.estiva.app/issue/plan-${d}`
  const named = new Map([
    [linkTo('first-issue'), FIRST],
    [linkTo('second-issue'), SECOND],
  ])
  const resolveLink = (url: string) => named.get(url)
  const M1 = '1'.repeat(64)
  const sent = event(M1, [['A', ELSEWHERE], ['a', ELSEWHERE], ['K', '30851'], ['a', FIRST]], `See ${linkTo('first-issue')}`)
  const edit = { ...event('2'.repeat(64), [['e', M1], ['a', SECOND]], `See ${linkTo('second-issue')} instead`), kind: 40003 }
  const state = workspace([sent, edit])
  const listed = (file: string) => activityFor(file, state, directory, undefined, resolveLink, () => false).items.map((i) => i.thread.id)

  it('lists the comment under the file its edited words link', () => {
    expect(listed(SECOND)).toEqual([M1])
  })

  it('no longer lists it under the file the edit took the link to away', () => {
    expect(listed(FIRST)).toEqual([])
  })

  it('never lists it under the file it is a comment on', () => {
    expect(listed(ELSEWHERE)).toEqual([])
  })
})

/*
  Mentioned in lists a comment wherever it was written (PEEKM-7): a Peek topic
  message and a Leaf comment on a document sit in Folders Ship never loads, so
  Activity lists them from the relay's read of every message pointing at the
  file (`useMentionsElsewhere`), handed to `activityFor` beside the workspace.
*/
describe("an issue's Activity lists mentions written in Folders Ship does not load (PEEKM-7)", () => {
  const TOPIC = '70000000-0000-0000-0000-000000000000'
  const DOC_FOLDER = 'd0000000-0000-0000-0000-000000000000'
  const DOC = `30842:${'d'.repeat(64)}:a-document`
  const url = 'https://ship.estiva.app/issue/plan-the-issue'
  const resolveLink = (link: string) => (link === url ? ISSUE : undefined)
  const inFolder = (folder: string, id: string, kind: number, tags: string[][], content: string) =>
    ({ ...event(id, tags, content), kind, tags: [['h', folder], ...tags] }) as SignedEvent
  const ref = `nostr:${addrToNaddr(ISSUE)}`
  const peek = inFolder(TOPIC, '9'.repeat(64), 9, [['a', ISSUE]], `Look at ${ref}`)
  const leaf = inFolder(DOC_FOLDER, '7'.repeat(64), 1111, [['A', DOC], ['a', DOC], ['K', '30842'], ['a', ISSUE]], `Tracked in ${ref}`)
  const byUrl = inFolder(TOPIC, '6'.repeat(64), 9, [['a', ISSUE]], `Also ${url}`)
  const unlinked = inFolder(TOPIC, '5'.repeat(64), 9, [['a', ISSUE]], `Was ${ref}`)
  const unlink = { ...inFolder(TOPIC, '4'.repeat(64), 40003, [['e', unlinked.id]], 'Was nothing'), created_at: unlinked.created_at + 60 }
  // Ship loaded only the issue's own Folder, where its comment sits.
  const state = foldWorkspace({ events: [onIssue('i1')], folders: [FOLDER] })
  const listed = (elsewhere: SignedEvent[]) => activityFor(ISSUE, state, directory, undefined, resolveLink, () => false, elsewhere).items.map((i) => i.thread.id)

  it('lists a Peek topic message and a Leaf comment on a document that link the issue', () => {
    expect(listed([peek, leaf]).sort()).toEqual([peek.id, leaf.id].sort())
  })

  it('lists a message that links the issue by its app link only', () => {
    expect(listed([byUrl])).toEqual([byUrl.id])
  })

  it('drops a message once an edit took the link out', () => {
    expect(listed([peek, unlinked, unlink])).toEqual([peek.id])
  })
})

describe('what an edit of one message is built from', () => {
  // An edit is the whole new message (SPEC §6.8): an edit that leaves the files as they were still lists them.
  it("hands on the message's files as the workspace folded them", () => {
    const state = { ...workspace([onIssue('i1')]), embeds: {}, parts: {} }
    const shot = { url: `/media/${'d'.repeat(64)}.png`, m: 'image/png', x: 'd'.repeat(64), size: 40, filename: 'shot.png' }
    state.attachments = { i1: [shot] }
    expect(cardEditOf(state, 'i1')?.files).toEqual([shot])
  })
})
