import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
  ALO-23: what a card draws is read once for every component drawing it, as the file is now. The relay is the seam,
  as in `foreign.test.ts`: `./store` is mocked, and what reaches the relay is counted.
*/
const query = vi.fn()
const switched = vi.fn<() => Promise<unknown>>()
vi.mock('./store', () => ({
  relay: { query: (filters: unknown[]) => query(filters), queryAll: (filters: unknown[]) => query(filters) },
  projectFieldsNow: () => switched(),
}))

import { REFRESH_MS } from '@/lib/useRefresh'
import { resolveForeign } from './foreign'

const AUTHOR = 'a'.repeat(64)
const LEAD = 'b'.repeat(64)
const KIND = 30850
const FIRST = `${KIND}:${AUTHOR}:p1`
const SECOND = `${KIND}:${AUTHOR}:p2`

interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

let seq = 0
const event = (partial: Partial<TestEvent> & { kind: number }): TestEvent => ({
  id: String(++seq).padStart(64, '0'),
  sig: '',
  pubkey: AUTHOR,
  created_at: 1_700_000_000 + seq,
  tags: [],
  content: '',
  ...partial,
})

const world = [
  event({
    kind: 31990,
    tags: [['d', 'some-app'], ['k', String(KIND)]],
    content: JSON.stringify({ name: 'Some app', projections: { [KIND]: { widget: 'card', slots: { title: { tag: 'title' }, meta: { tag: 'lead', as: 'pubkey' } } } } }),
  }),
  event({ kind: KIND, tags: [['d', 'p1'], ['title', 'The first project'], ['lead', LEAD]] }),
  event({ kind: KIND, tags: [['d', 'p2'], ['title', 'The second project']] }),
  event({ kind: 0, pubkey: LEAD, content: JSON.stringify({ name: 'Ada' }) }),
]

const answer = async (filters: Record<string, unknown>[]) =>
  world.filter((e) =>
    filters.some((f) => {
      if (f.kinds && !(f.kinds as number[]).includes(e.kind)) return false
      if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false
      for (const [key, want] of Object.entries(f)) {
        if (!key.startsWith('#')) continue
        const held = e.tags.filter((t) => t[0] === key.slice(1)).map((t) => t[1])
        if (!(want as string[]).some((v) => held.includes(v))) return false
      }
      return true
    }),
  )

/** Every filter sent for the files' own kind, across all requests. */
const fileFilters = () => (query.mock.calls as [Record<string, unknown>[]][]).flatMap(([filters]) => filters.filter((f) => (f.kinds as number[] | undefined)?.includes(KIND)))
/** Every filter asking a file's changes by `#a`, as the full read does. */
const changeReads = () => (query.mock.calls as [Record<string, unknown>[]][]).flatMap(([filters]) => filters.filter((f) => '#a' in f))

/** Ask as components do in one render: all in the same moment, then let the batch go. */
const ask = async (...references: string[]) => {
  const answers = Promise.all(references.map((reference) => resolveForeign(reference)))
  // Handled here too, so a read that fails is not reported unhandled while the clock moves; the caller still sees it.
  answers.catch(() => undefined)
  await vi.advanceTimersByTimeAsync(0)
  return answers
}

// Each test starts well past every answer an earlier one shared, so none reads another's.
let clock = Date.now()

beforeEach(() => {
  clock += 10 * REFRESH_MS
  vi.useFakeTimers({ now: clock })
  query.mockReset().mockImplementation(answer)
  switched.mockReset().mockResolvedValue({ at: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveForeign — a card reads its file as it is now, once for every component (ALO-23)', () => {
  it('reads the file again after a change made from a card, not the answer another card shared', async () => {
    await ask(FIRST)
    const fresh = resolveForeign(FIRST, { fresh: true })
    await vi.advanceTimersByTimeAsync(0)
    await fresh
    expect(fileFilters()).toHaveLength(2)
  })

  it('reads a page in full where its text is wanted (a part of it), never by the list read', async () => {
    await resolveForeign(FIRST, { full: true })
    expect(fileFilters()).toEqual([expect.objectContaining({ '#d': ['p1'], limit: 1 })])
  })

  it('reads the files asked in one moment in one list read, never their changes, and names their people', async () => {
    const [a, again, b] = await ask(FIRST, FIRST, SECOND)

    expect(a?.slots.title?.value).toBe('The first project')
    expect(b?.slots.title?.value).toBe('The second project')
    expect(again).toBe(a)
    expect(a?.people?.[LEAD]?.displayName).toBe('Ada')
    // One filter for both files, by the list read; no `#a` read of their changes.
    expect(fileFilters()).toEqual([expect.objectContaining({ '#d': ['p1', 'p2'], fields: 'newest' })])
    expect(changeReads()).toEqual([])
  })

  it('reads the relay again once a read has landed, so an edit from another app shows on the next ask', async () => {
    await ask(FIRST)
    expect(fileFilters()).toHaveLength(1)

    // An edit made in another app, then a return to the tab a moment later: no answer from before it stands in.
    const title = world[1].tags.find((t) => t[0] === 'title')!
    title[1] = 'Renamed in Peek'
    try {
      await vi.advanceTimersByTimeAsync(1000)
      const [fresh] = await ask(FIRST)
      expect(fresh?.slots.title?.value).toBe('Renamed in Peek')
      expect(fileFilters()).toHaveLength(2)
    } finally {
      title[1] = 'The first project'
    }
  })

  it('asks each file on its own when the shared list read is turned away, so only the bad one fails', async () => {
    query.mockImplementation(async (filters: Record<string, unknown>[]) => {
      if (filters.some((f) => f.fields === 'newest' && (f['#d'] as string[]).includes('p1'))) throw new Error('400')
      return answer(filters)
    })
    const answers = [FIRST, SECOND].map((reference) => resolveForeign(reference).then((o) => o?.slots.title?.value, () => 'failed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await Promise.all(answers)).toEqual(['failed', 'The second project'])
  })

  it('fails a card whose own read fails alone, never the cards read beside it', async () => {
    // Without the list read each file is read on its own, and the relay turns one of them away.
    switched.mockResolvedValue(undefined)
    query.mockImplementation(async (filters: Record<string, unknown>[]) => {
      if (filters.some((f) => (f['#d'] as string[] | undefined)?.includes('p1'))) throw new Error('429')
      return answer(filters)
    })
    const answers = [FIRST, SECOND].map((reference) => resolveForeign(reference).then((o) => o?.slots.title?.value, () => 'failed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await Promise.all(answers)).toEqual(['failed', 'The second project'])
  })

  it('answers nothing for a file the list read leaves out, as the full read did', async () => {
    const [gone] = await ask(`${KIND}:${AUTHOR}:deleted-one`)
    expect(gone).toBeNull()
  })

  it('keeps no failed read, so the next ask reads again', async () => {
    query.mockImplementation(async (filters: Record<string, unknown>[]) => {
      if (filters.some((f) => f.fields === 'newest')) throw new Error('429')
      return answer(filters)
    })
    await expect(ask(FIRST)).rejects.toThrow('429')

    query.mockImplementation(answer)
    const [read] = await ask(FIRST)
    expect(read?.slots.title?.value).toBe('The first project')
  })

  it('reads each file in full where the relay has no list read yet', async () => {
    switched.mockResolvedValue(undefined)
    const [a] = await ask(FIRST)
    expect(a?.slots.title?.value).toBe('The first project')
    // The full read's own root filter, and no list read the relay would refuse.
    expect(fileFilters()).toEqual([expect.objectContaining({ '#d': ['p1'], limit: 1 })])
    expect(fileFilters().some((f) => 'fields' in f)).toBe(false)
  })
})
