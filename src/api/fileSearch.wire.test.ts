import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
  ALO-5: `[`'s search and the reads of files by address, at the wire — the
  filters Ship sends with the switch on and off, through a relay held in memory
  that answers §6.13's list read (each root with its fields' changes) and its
  search (the files whose current words start with what was typed, and which).
*/
interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

const held: TestEvent[] = []
const asked: Record<string, unknown>[][] = []
let fields: { text: boolean; search?: true } | undefined

const tagOf = (e: TestEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1]
const addrOf = (e: TestEvent) => `${e.kind}:${e.pubkey}:${tagOf(e, 'd')}`
const startsAWord = (value: string | undefined, word: string) => !!value && value.toLowerCase().split(/\W+/).some((w) => w.startsWith(word.toLowerCase()))

function matches(filter: Record<string, unknown>, e: TestEvent): boolean {
  for (const [key, want] of Object.entries(filter)) {
    if (['limit', 'since', 'until', 'fields', 'search', 'search_mode', 'text'].includes(key)) continue
    const values = want as unknown[]
    if (key === 'kinds' && !values.includes(e.kind)) return false
    if (key === 'authors' && !values.includes(e.pubkey)) return false
    if (key === 'ids' && !values.includes(e.id)) return false
    if (key.startsWith('#') && !e.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))) return false
  }
  return true
}

/** The current value of each of `root`'s fields, its root tag where no change set it. */
function current(root: TestEvent): Map<string, string> {
  const now = new Map<string, string>([['title', tagOf(root, 'name') ?? ''], ['description', tagOf(root, 'description') ?? '']])
  for (const e of held) if (e.kind === 1851 && tagOf(e, 'a') === addrOf(root)) now.set(tagOf(e, 'field')!, tagOf(e, 'value')!)
  return now
}

function answer(filters: Record<string, unknown>[]): { events: TestEvent[]; matches: { a: string; match: { fields: string[]; around?: string } }[] } {
  asked.push(filters)
  const out = new Set<TestEvent>()
  const found: { a: string; match: { fields: string[]; around?: string } }[] = []
  for (const f of filters) {
    if (f.fields === 'newest') {
      for (const root of held.filter((e) => e.kind !== 1851 && matches(f, e))) {
        if (typeof f.search === 'string') {
          const hit = [...current(root)].filter(([, value]) => startsAWord(value, f.search as string)).map(([field]) => (field === 'description' ? 'text' : field))
          if (!hit.length) continue
          found.push({ a: addrOf(root), match: { fields: hit, ...(hit[0] === 'text' ? { around: current(root).get('description') } : {}) } })
        }
        out.add(root)
        for (const e of held) if (e.kind === 1851 && tagOf(e, 'a') === addrOf(root)) out.add(e)
      }
      continue
    }
    for (const e of held) {
      if (!matches(f, e)) continue
      if (typeof f.search === 'string' && !startsAWord(tagOf(e, 'name') ?? tagOf(e, 'title') ?? tagOf(e, 'value'), f.search)) continue
      out.add(e)
    }
  }
  return { events: [...out], matches: found }
}

vi.mock('./store', () => ({
  relay: {
    query: async (filters: Record<string, unknown>[]) => answer(filters).events,
    queryAll: async (filters: Record<string, unknown>[]) => answer(filters).events,
    queryWithMatches: async (filters: Record<string, unknown>[]) => answer(filters),
  },
  signer: { pubkey: 'c'.repeat(64) },
  projectFieldsNow: async () => fields,
  inOrderOption: async () => (inOrder.length ? { inOrder } : {}),
}))
/** The types the relay says it keeps in order (NIP-11 `files.requires_prev`). */
let inOrder: string[] = []

const { fileCandidatesOf, readTopicDocuments, searchFiles } = await import('./foreign')
const { buildManifest } = await import('../nostr/manifest')

const OWNER = 'a'.repeat(64)
let seq = 0
const event = (kind: number, tags: string[][], content = ''): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey: OWNER, created_at: 1_700_000_000 + seq, kind, tags, content })
const project = (d: string, title: string, description: string) => event(30850, [['d', d], ['name', title], ['description', description], ['h', 'team']])
const PROJECT = `30850:${OWNER}:p1`

beforeEach(() => {
  held.length = 0
  asked.length = 0
  inOrder = []
  const unsigned = buildManifest(OWNER, Date.now())
  held.push(event(unsigned.kind, unsigned.tags, unsigned.content), project('p1', 'Launch plan', 'First block.\nThird block mentions quoxalbit'))
})

describe("[ finds a project by a word of its text, where the relay finds projects by their words", () => {
  it('asks the relay to search projects by their current fields, and shows the words around the hit', async () => {
    fields = { text: true, search: true }
    const rows = await searchFiles('quox')
    expect(asked.flat()).toContainEqual({ kinds: [30850], search: 'quox', limit: 20, fields: 'newest' })
    expect(rows.map((row) => [row.id, row.title, row.summary])).toEqual([[PROJECT, 'Launch plan', '…First block. Third block mentions quoxalbit']])
  })

  it('with the switch on but no project search announced, searches by title alone and does not find it', async () => {
    fields = { text: true }
    expect(await searchFiles('quox')).toEqual([])
    expect(asked.flat().some((f) => f.search !== undefined && f.fields === 'newest')).toBe(false)
  })

  it('with the switch off, searches by title alone, as before', async () => {
    fields = undefined
    expect((await searchFiles('laun')).map((row) => row.id)).toEqual([PROJECT])
    expect(asked.flat().some((f) => f.fields !== undefined)).toBe(false)
  })
})

// ALO-8 (decided 2026-11-06): from the switch a project picked from `[` is saved as its id link, as in Leaf and Peek.
describe('[ saves a picked project as its id link once the relay keeps projects in order', () => {
  const ID = '5f0c1f2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
  const KEPT = `30850:${OWNER}:${ID}`

  beforeEach(() => {
    held.push(project(ID, 'Quarterly plan', 'Body.'))
    fields = { text: true, search: true }
  })

  it('a recently read project is offered as its Ship link by id, not a nostr: reference', async () => {
    inOrder = ['osnova.project']
    const rows = await fileCandidatesOf({ addresses: [KEPT], at: new Map() }, 2)
    expect(rows.map((row) => row.uri)).toEqual([`https://ship.estiva.app/project/${ID}`])
  })

  it('a project found by typing is offered the same way', async () => {
    inOrder = ['osnova.project']
    const rows = await searchFiles('quarter')
    expect(rows.map((row) => row.uri)).toEqual([`https://ship.estiva.app/project/${ID}`])
  })

  it('before the relay keeps projects in order, the same pick is a nostr: reference, as before', async () => {
    const rows = await fileCandidatesOf({ addresses: [KEPT], at: new Map() }, 2)
    expect(rows.map((row) => row.uri.startsWith('nostr:naddr1'))).toEqual([true])
  })
})

describe('a file read by its address: by the list read where the switch is on', () => {
  it("a topic's document is read as its fields' current changes, not every change by #a", async () => {
    fields = { text: true }
    await readTopicDocuments([PROJECT])
    expect(asked.flat().some((f) => f.fields === 'newest')).toBe(true)
    // Its children are listed by `#a` too, but by the list read: no plain read of what names it.
    expect(asked.flat().some((f) => f.fields !== 'newest' && (f['#a'] as string[] | undefined)?.includes(PROJECT))).toBe(false)
  })

  it("[ rows for recently read files are read the same way, and named by what they are called now", async () => {
    fields = { text: true }
    held.push(event(1851, [['a', PROJECT], ['O', 'p1'], ['field', 'title'], ['value', 'Launch v2'], ['h', 'team']]))
    const rows = await fileCandidatesOf({ addresses: [PROJECT], at: new Map() }, 2)
    expect(rows.map((row) => row.title)).toEqual(['Launch v2'])
    expect(asked.flat().some((f) => (f['#a'] as string[] | undefined)?.includes(PROJECT))).toBe(false)
  })

  it("an issue's row is read the same way and named by its current title, as with the switch off", async () => {
    const ISSUE = `30851:${OWNER}:i1`
    held.push(
      event(30851, [['d', 'i1'], ['title', 'Old name'], ['h', 'team'], ['a', PROJECT], ['ref', 'LAU-1']]),
      event(1851, [['a', ISSUE], ['O', 'i1'], ['field', 'title'], ['value', 'New name'], ['h', 'team']]),
    )
    const rows = async () => (await fileCandidatesOf({ addresses: [ISSUE], at: new Map() }, 2)).map((row) => row.title)
    fields = undefined
    const off = await rows()
    asked.length = 0
    fields = { text: true }
    expect(await rows()).toEqual(off)
    expect(off).toEqual(['New name'])
    expect(asked.flat().some((f) => (f['#a'] as string[] | undefined)?.includes(ISSUE))).toBe(false)
  })

  it('with the switch off, reads every change by #a, as before', async () => {
    fields = undefined
    await readTopicDocuments([PROJECT])
    expect(asked.flat().some((f) => (f['#a'] as string[] | undefined)?.includes(PROJECT))).toBe(true)
  })
})
