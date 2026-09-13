import { describe, it, expect } from 'vitest'
import { firstUnreadByThread, firstUnreadIn, type FeedThread } from './unreadFeed'

const FOLDER = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const ROOT = 'a'.repeat(64)
const OTHER_ROOT = 'b'.repeat(64)
const ME = 'c'.repeat(64)
const THEM = 'd'.repeat(64)

const msg = (id: string, at: number, by = THEM) => ({ id, at, by })
const thread = (rootId: string, rootAt: number, replies: [string, number, string?][] = []): FeedThread => ({
  id: rootId,
  root: msg(rootId, rootAt),
  replies: replies.map(([id, at, by]) => msg(id, at, by)),
})

describe('firstUnreadIn — the container grain', () => {
  it('marks a root newer than the container marker', () => {
    const t = thread(ROOT, 2000)
    expect(firstUnreadIn(t, { [FOLDER]: 1000 }, FOLDER, ME)).toBe(ROOT)
  })

  it('leaves a root older than the container marker alone', () => {
    const t = thread(ROOT, 500)
    expect(firstUnreadIn(t, { [FOLDER]: 1000 }, FOLDER, ME)).toBeUndefined()
  })

  /** Your own comment is never new to you — a divider above it reads as a bug. */
  it('never marks your own message', () => {
    const t: FeedThread = { id: ROOT, root: msg(ROOT, 2000, ME), replies: [] }
    expect(firstUnreadIn(t, { [FOLDER]: 1000 }, FOLDER, ME)).toBeUndefined()
  })
})

describe('firstUnreadIn — the thread grain, and §11.3', () => {
  it('marks a reply newer than its thread marker', () => {
    const t = thread(ROOT, 500, [['r1', 3000]])
    expect(firstUnreadIn(t, { [FOLDER]: 1000, [`thread:${ROOT}`]: 2000 }, FOLDER, ME)).toBe('r1')
  })

  /**
   * §11.3: the effective marker for a reply is the LATER of its thread's own
   * and its container's. Marking the project read clears replies that predate
   * that moment even though the thread's own marker is behind.
   */
  it("lets the container's frontier clear replies the thread marker would not", () => {
    const t = thread(ROOT, 100, [['r1', 1500]])
    const merged = { [FOLDER]: 9000, [`thread:${ROOT}`]: 1000 }
    expect(firstUnreadIn(t, merged, FOLDER, ME)).toBeUndefined()
  })

  it('still shows a reply newer than the container frontier', () => {
    const t = thread(ROOT, 100, [['r1', 9500]])
    const merged = { [FOLDER]: 9000, [`thread:${ROOT}`]: 1000 }
    expect(firstUnreadIn(t, merged, FOLDER, ME)).toBe('r1')
  })

  it('uses the thread marker when it is the later one', () => {
    const t = thread(ROOT, 100, [['r1', 5000]])
    const merged = { [FOLDER]: 1000, [`thread:${ROOT}`]: 9000 }
    expect(firstUnreadIn(t, merged, FOLDER, ME)).toBeUndefined()
  })

  it('returns the FIRST unread, not the last', () => {
    const t = thread(ROOT, 100, [['r1', 3000], ['r2', 4000]])
    expect(firstUnreadIn(t, { [FOLDER]: 200, [`thread:${ROOT}`]: 2000 }, FOLDER, ME)).toBe('r1')
  })

  it('skips your own reply and marks the next one that is not yours', () => {
    const t = thread(ROOT, 100, [['r1', 3000, ME], ['r2', 4000, THEM]])
    expect(firstUnreadIn(t, { [FOLDER]: 200, [`thread:${ROOT}`]: 2000 }, FOLDER, ME)).toBe('r2')
  })
})

describe('absence means no divider — the first-run decision', () => {
  /**
   * SPEC §11.6 says absence means unread. Ship has years of history and no
   * markers for any of it, so taken literally the whole workspace is new on day
   * one. Nothing is published to avoid that; the rule is simply that no marker
   * means no divider.
   */
  it('shows nothing at all when the container has never been read', () => {
    const t = thread(ROOT, 9999, [['r1', 99999]])
    expect(firstUnreadIn(t, {}, FOLDER, ME)).toBeUndefined()
  })

  it('shows nothing when the caller has no container in scope', () => {
    const t = thread(ROOT, 9999)
    expect(firstUnreadIn(t, { [FOLDER]: 1 }, undefined, ME)).toBeUndefined()
  })

  /** A thread marker alone is enough for its replies, container or not. */
  it('still marks replies when only a thread marker exists', () => {
    const t = thread(ROOT, 9999, [['r1', 5000]])
    expect(firstUnreadIn(t, { [`thread:${ROOT}`]: 1000 }, undefined, ME)).toBe('r1')
  })
})

/*
  The file grain — SPEC §11.1 and §11.3, FOL-16. A root about a file answers
  to the file's marker; the channel's marker stops at the file's stream.
*/
describe('firstUnreadIn — a file is its own stream', () => {
  const PUBKEY = 'e'.repeat(64)
  const ISSUE = `30851:${PUBKEY}:9f1b4a2c-7e3d-4c8a-9b2e-1d5f6a7b8c9d`

  it("judges a root about a file against the file's marker", () => {
    expect(firstUnreadIn(thread(ROOT, 2000), { [ISSUE]: 1000 }, ISSUE, ME)).toBe(ROOT)
    expect(firstUnreadIn(thread(ROOT, 500), { [ISSUE]: 1000 }, ISSUE, ME)).toBeUndefined()
  })

  it("does not let the channel's marker reach a file's stream — reading the project page is not reading its issues", () => {
    // The channel was read after the root; the issue itself never was.
    expect(firstUnreadIn(thread(ROOT, 2000), { [FOLDER]: 3000 }, ISSUE, ME)).toBeUndefined() // absent means quiet (CRO-13) …
    expect(firstUnreadIn(thread(ROOT, 2000), { [FOLDER]: 3000, [ISSUE]: 1000 }, ISSUE, ME)).toBe(ROOT) // … and the file's own marker, not the channel's, decides
  })

  it("propagates the file's marker down to its threads, as the channel's did", () => {
    const t = thread(ROOT, 500, [['r1', 1500], ['r2', 2500]])
    expect(firstUnreadIn(t, { [ISSUE]: 2000, [`thread:${ROOT}`]: 1000 }, ISSUE, ME)).toBe('r2')
  })

  it('routes each thread to its own stream when a feed draws two', () => {
    const chat = thread(ROOT, 2000)
    const aboutProject = thread(OTHER_ROOT, 2000)
    const merged = { [FOLDER]: 3000, [ISSUE]: 1000 }
    const streamOf = (t: FeedThread) => (t.id === OTHER_ROOT ? ISSUE : FOLDER)
    expect(firstUnreadByThread([chat, aboutProject], merged, streamOf, ME)).toEqual({ [OTHER_ROOT]: OTHER_ROOT })
  })
})

describe('firstUnreadByThread', () => {
  it('maps only the threads that have something new', () => {
    const merged = { [FOLDER]: 1000 }
    const threads = [thread(ROOT, 2000), thread(OTHER_ROOT, 500)]
    expect(firstUnreadByThread(threads, merged, FOLDER, ME)).toEqual({ [ROOT]: ROOT })
  })

  it('is empty when nothing is new, so a caller can ask by key count', () => {
    expect(firstUnreadByThread([thread(ROOT, 500)], { [FOLDER]: 1000 }, FOLDER, ME)).toEqual({})
  })
})
