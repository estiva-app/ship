import { describe, it, expect } from 'vitest'
import { encodeNpub } from '@estiva-app/protocol'
import type { StreamJudge } from '@estiva-app/conversation'
import type { Conversation, Message } from '../nostr/fold'
import { firstUnreadByThread } from './unreadFeed'

const CHANNEL = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const OWNER = 'e'.repeat(64)
const FILE = `30851:${OWNER}:6bd072cb-6c30-4883-abb5-faf880d0c444`
const OTHER_FILE = `30851:${OWNER}:11111111-1111-4111-8111-111111111111`
const ROOT = 'a'.repeat(64)
const ME = 'c'.repeat(64)
const THEM = 'd'.repeat(64)

const message = (id: string, createdAt: number, author = THEM, body = 'hello', rootId?: string): Message => ({
  id,
  author,
  createdAt,
  body,
  folder: CHANNEL,
  rootId,
  parentId: rootId,
  about: [],
})

const conversation = (rootId: string, rootAt: number, replies: [string, number, string?, string?][] = [], rootBody = 'hello'): Conversation => ({
  id: rootId,
  root: message(rootId, rootAt, THEM, rootBody),
  replies: replies.map(([id, at, by, body]) => message(id, at, by, body, rootId)),
  about: [FILE],
  createdAt: rootAt,
  lastAt: Math.max(rootAt, ...replies.map(([, at]) => at)),
})

/** A file you joined at second 1000. */
const member: StreamJudge = { stream: FILE, me: ME, member: true, since: 1000 }
const asMember = (extra: Partial<StreamJudge> = {}): StreamJudge => ({ ...member, ...extra })
const unread = (conversations: Conversation[], merged: Record<string, number>, judge: StreamJudge | undefined) =>
  firstUnreadByThread(conversations, merged, () => judge)

describe('membership is the gate (SPEC §11.8)', () => {
  it('lights a message from the second you joined, with no marker at all', () => {
    expect(unread([conversation(ROOT, 2000)], {}, member)).toEqual({ [ROOT]: ROOT })
  })

  it('does not light what was said before you joined', () => {
    expect(unread([conversation(ROOT, 999)], {}, member)).toEqual({})
  })

  it('lights nothing for somebody who is not a member', () => {
    expect(unread([conversation(ROOT, 2000)], { [FILE]: 1 }, { stream: FILE, me: ME, member: false })).toEqual({})
  })

  it('still lights a message that names you, member or not', () => {
    const named = conversation(ROOT, 2000, [], `over to you nostr:${encodeNpub(ME)}`)
    expect(unread([named], {}, { stream: FILE, me: ME, member: false })).toEqual({ [ROOT]: ROOT })
  })

  it('lights a muted file only for the message that names you', () => {
    const named = conversation(ROOT, 2000, [['r1', 2500, THEM, `nostr:${encodeNpub(ME)} ?`]])
    expect(unread([named], {}, asMember({ muted: true }))).toEqual({ [ROOT]: 'r1' })
    expect(unread([conversation(ROOT, 2000)], {}, asMember({ muted: true }))).toEqual({})
  })

  it('never lights your own message', () => {
    const own: Conversation = { ...conversation(ROOT, 2000), root: message(ROOT, 2000, ME) }
    expect(unread([own], {}, member)).toEqual({})
  })

  /** A feed with no verdict yet reads as quiet, not as a divider on every thread. */
  it('lights nothing for a thread with no judge', () => {
    expect(unread([conversation(ROOT, 2000)], {}, undefined)).toEqual({})
  })
})

describe("the effective marker (SPEC §11.3) over a file's stream", () => {
  it('lights a root newer than the file marker and not one older', () => {
    expect(unread([conversation(ROOT, 2000)], { [FILE]: 1500 }, member)).toEqual({ [ROOT]: ROOT })
    expect(unread([conversation(ROOT, 2000)], { [FILE]: 2500 }, member)).toEqual({})
  })

  it("lets the file's frontier clear replies the thread marker would not", () => {
    const t = conversation(ROOT, 1100, [['r1', 1500]])
    expect(unread([t], { [FILE]: 9000, [`thread:${ROOT}`]: 1200 }, member)).toEqual({})
  })

  it('shows a reply newer than the file frontier, and the thread marker when it is later', () => {
    const t = conversation(ROOT, 1100, [['r1', 3000]])
    expect(unread([t], { [FILE]: 2000 }, member)).toEqual({ [ROOT]: 'r1' })
    expect(unread([t], { [FILE]: 2000, [`thread:${ROOT}`]: 3500 }, member)).toEqual({})
  })

  it('answers with the first unread message of the thread, skipping your own', () => {
    const t = conversation(ROOT, 1100, [['r1', 2000, ME], ['r2', 2100], ['r3', 2200]])
    expect(unread([t], { [FILE]: 1500 }, member)).toEqual({ [ROOT]: 'r2' })
  })

  it("does not let the channel's marker reach a file's stream", () => {
    expect(unread([conversation(ROOT, 2000)], { [CHANNEL]: 9000 }, member)).toEqual({ [ROOT]: ROOT })
  })
})

describe("a Folder's chat on the project page", () => {
  /** The roster has no join time, so without a marker nothing counts: the quiet first run. */
  const channel: StreamJudge = { stream: CHANNEL, me: ME, member: true, floor: Number.MAX_SAFE_INTEGER }

  it('is quiet until the page has been read once, then lights what comes after', () => {
    expect(unread([conversation(ROOT, 2000)], {}, channel)).toEqual({})
    expect(unread([conversation(ROOT, 2000)], { [CHANNEL]: 1500 }, channel)).toEqual({ [ROOT]: ROOT })
  })

  it('lights a muted chat only for the message that names you', () => {
    const muted = { ...channel, muted: true }
    const named = conversation(ROOT, 2000, [], `nostr:${encodeNpub(ME)}`)
    expect(unread([named], { [CHANNEL]: 1500 }, muted)).toEqual({ [ROOT]: ROOT })
    expect(unread([conversation(ROOT, 2000)], { [CHANNEL]: 1500 }, muted)).toEqual({})
  })

  it('routes each thread to its own stream when a feed draws two', () => {
    const aboutFile = conversation(ROOT, 2000)
    const inChannel = conversation('b'.repeat(64), 2000)
    const merged = { [FILE]: 1500, [CHANNEL]: 1500 }
    const result = firstUnreadByThread([aboutFile, inChannel], merged, (c) => (c === aboutFile ? member : channel))
    expect(result).toEqual({ [ROOT]: ROOT, ['b'.repeat(64)]: 'b'.repeat(64) })
    // The file's marker is the file's alone.
    const other = firstUnreadByThread([aboutFile, inChannel], { [FILE]: 9000, [CHANNEL]: 1500 }, (c) => (c === aboutFile ? member : channel))
    expect(other).toEqual({ ['b'.repeat(64)]: 'b'.repeat(64) })
  })

  it('judges a different file by its own marker', () => {
    const elsewhere: StreamJudge = { ...member, stream: OTHER_FILE }
    expect(unread([conversation(ROOT, 2000)], { [FILE]: 9000 }, elsewhere)).toEqual({ [ROOT]: ROOT })
  })
})
