/**
 * Projects read by their fields and written in order (ALO-5), at the wire: the
 * events Ship signs with the switch on, and what its load asks the relay for.
 * A real `Store` over a relay held in memory that answers SPEC §6.13's read as
 * the relay does: each first record with its fields' newest changes, the text
 * only with `text`, and a deleted file left out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent, UnsignedEvent } from '@estiva-app/protocol'

const PK = 'ab'.repeat(32)
const FOLDER = '3167adea-877f-43c4-96fb-517a2b2d5d24'

let held: SignedEvent[] = []
let asked: Record<string, unknown>[][] = []
/** The requests Ship paged (`queryAll`), each a separate round trip or more. */
let paged: Record<string, unknown>[][] = []
/** While set, a paged read of a Folder by `#h` runs it before answering: what was asked while that Folder was still being read. */
let folderRead: (() => Promise<void>) | undefined
let count = 0

const dOf = (event: SignedEvent) => event.tags.find((t) => t[0] === 'd')?.[1]
const tagOf = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const addrOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${dOf(event)}`

/** The newest change of each field of `addr`, as §6.13 answers it. */
function newestFields(addr: string, text: boolean): SignedEvent[] {
  const newest = new Map<string, SignedEvent>()
  for (const event of held) {
    if (event.kind !== 1851 || tagOf(event, 'a') !== addr) continue
    const field = tagOf(event, 'field')!
    const before = newest.get(field)
    if (!before || event.created_at > before.created_at || (event.created_at === before.created_at && event.id > before.id)) newest.set(field, event)
  }
  if (newest.get('deleted') && tagOf(newest.get('deleted')!, 'value') === 'true') return []
  return [...newest].filter(([field]) => text || field !== 'description').map(([, event]) => event)
}

function answer(filters: Record<string, unknown>[]): SignedEvent[] {
  asked.push(filters)
  const out = new Set<SignedEvent>()
  for (const f of filters) {
    const kinds = f.kinds as number[] | undefined
    const matches = (event: SignedEvent) =>
      (!kinds || kinds.includes(event.kind)) &&
      (!f['#d'] || (f['#d'] as string[]).includes(dOf(event) ?? '')) &&
      (!f['#a'] || (f['#a'] as string[]).includes(tagOf(event, 'a') ?? '')) &&
      (!f['#h'] || (f['#h'] as string[]).includes(tagOf(event, 'h') ?? '')) &&
      (!f.ids || (f.ids as string[]).includes(event.id))
    if (f.fields === 'newest') {
      for (const root of held.filter((event) => event.kind !== 1851 && matches(event))) {
        const fields = newestFields(addrOf(root), f.text === true)
        if (!fields.length && held.some((event) => event.kind === 1851 && tagOf(event, 'a') === addrOf(root) && tagOf(event, 'field') === 'deleted')) continue
        out.add(root)
        for (const change of fields) out.add(change)
      }
      continue
    }
    // `limit` per filter, newest first, as the relay clamps it.
    const found = held.filter(matches).sort((x, y) => y.created_at - x.created_at)
    for (const event of typeof f.limit === 'number' ? found.slice(0, f.limit) : found) out.add(event)
  }
  return [...out]
}

const sent: SignedEvent[] = []

vi.mock('./store', async () => {
  const { Store } = await import('../nostr/store')
  const signer = {
    pubkey: PK,
    sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: (++count).toString(16).padStart(64, '0'), sig: '0'.repeat(128) }),
  }
  const relay = {
    query: async (filters: Record<string, unknown>[]) => answer(filters),
    queryAll: async (filters: Record<string, unknown>[]) => {
      paged.push(filters)
      if (folderRead && filters.some((f) => f['#h'])) await folderRead()
      return answer(filters)
    },
    publish: async (event: SignedEvent) => {
      sent.push(event)
      held.push(event)
      return { ok: true }
    },
  }
  const projectFieldsNow = async () => ({ text: true })
  return { relay, signer, projectFieldsNow, store: new Store(relay as never, signer as never, async () => 0, projectFieldsNow) }
})
vi.mock('./clock', () => ({ clockProblem: async () => undefined }))

const { createProject, deleteProject, noteProjectText, setProjectDeleted, setProjectField } = await import('./writes')
const { store } = await import('./store')
const { foldWorkspace } = await import('../nostr/store')

const root = (d: string, at = 100, description = 'Seed'): SignedEvent =>
  ({ id: `r-${d}`.padEnd(64, '0'), kind: 30850, pubkey: PK, created_at: at, content: '', sig: '0'.repeat(128), tags: [['d', d], ['name', d], ['description', description], ['h', FOLDER]] }) as SignedEvent

const change = (d: string, id: string, field: string, value: string, at: number, prev?: string): SignedEvent =>
  ({ id: id.padEnd(64, '0'), kind: 1851, pubkey: PK, created_at: at, content: '', sig: '0'.repeat(128), tags: [['a', `30850:${PK}:${d}`], ['field', field], ['value', value], ['h', FOLDER], ...(prev ? [['prev', prev]] : [])] }) as SignedEvent

/** The workspace as the app reads it with the switch on. */
async function project(d: string) {
  const state = foldWorkspace(await store.loadAllEvents())
  return { state, project: state.projects.find((candidate) => candidate.id === d)! }
}

beforeEach(() => {
  held = []
  asked = []
  paged = []
  folderRead = undefined
  sent.length = 0
})

describe('a project field, with the switch on', () => {
  it("follows the field's current change, and names its file by id", async () => {
    const status = change('p', 'c1', 'status', 'planned', 110)
    held = [root('p'), status]
    const { project: p } = await project('p')
    expect(await setProjectField(p, 'status', 'in_progress', 'Status')).toEqual({ ok: true })
    const written = sent.at(-1)!
    expect(written.tags).toContainEqual(['prev', status.id])
    expect(written.tags).toContainEqual(['O', 'p'])
    expect(tagOf(written, 'value')).toBe('in_progress')
  })

  it("follows the record itself for a field's first change", async () => {
    held = [root('p')]
    const { project: p } = await project('p')
    await setProjectField(p, 'lead', PK, 'Lead')
    expect(sent.at(-1)!.tags).toContainEqual(['prev', root('p').id])
  })

  it('saves the text after the change holding the version it was edited from, not a newer one shown since', async () => {
    const first = change('p', 'd1', 'description', 'First words', 110)
    held = [root('p'), first]
    const opened = await store.loadOpened({ kind: 'project', d: 'p' })
    const shown = foldWorkspace(opened).projects.find((candidate) => candidate.id === 'p')!
    noteProjectText(shown)
    // Someone saves a newer text while the editor is open on the first.
    held.push(change('p', 'd2', 'description', 'Their words', 120, first.id))
    const { project: now } = await project('p')
    noteProjectText(now)
    await setProjectField(now, 'description', 'Mine', 'Description', undefined, { content: 'First words' })
    expect(sent.at(-1)!.tags).toContainEqual(['prev', first.id])
  })
})

describe('deleting a project, with the switch on', () => {
  it('is a change setting deleted, and no kind 5 and no unlisting', async () => {
    held = [root('p')]
    const { project: p } = await project('p')
    expect(await deleteProject(p, [{ id: FOLDER, hasState: true, addresses: [p.addr] }])).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 1851 })
    expect(tagOf(sent[0], 'field')).toBe('deleted')
    expect(tagOf(sent[0], 'value')).toBe('true')
    expect(sent[0].tags).toContainEqual(['prev', root('p').id])
  })

  it('folds deleted with who did it, read by #a though no read by its fields answers it, and Restore clears it', async () => {
    held = [root('p'), change('p', 'x1', 'deleted', 'true', 120)]
    const { project: gone } = await project('p')
    expect(gone.deleted).toEqual({ by: PK, at: 120 })
    expect(await setProjectDeleted(gone, false)).toEqual({ ok: true })
    expect(tagOf(sent.at(-1)!, 'value')).toBe('')
    expect(sent.at(-1)!.tags).toContainEqual(['prev', 'x1'.padEnd(64, '0')])
    const { project: back } = await project('p')
    expect(back.deleted).toBeUndefined()
  })
})

describe('the load, with the switch on', () => {
  it('asks for no change by kind alone: projects by their fields, issue changes by #a', async () => {
    held = [root('p'), change('p', 'c1', 'status', 'planned', 110)]
    await store.loadAllEvents()
    const wholeKind = asked.flat().filter((f) => JSON.stringify(f.kinds) === '[1851]' && !f['#a'])
    expect(wholeKind).toEqual([])
    expect(asked.flat()).toContainEqual({ kinds: [30850], fields: 'newest' })
  })

  it('folds a change setting several fields', async () => {
    const both = { ...change('p', 's1', 'x', 'x', 110), tags: [['a', `30850:${PK}:p`], ['O', 'p'], ['h', FOLDER], ['ts', '110000'], ['set', 'status', 'done', root('p').id], ['set', 'title', 'Renamed', root('p').id]] } as SignedEvent
    held = [root('p'), both]
    const { project: p } = await project('p')
    expect(p.status).toBe('done')
    expect(p.title).toBe('Renamed')
  })

  it("holds an opened project's current text, and says so; another's is not held", async () => {
    held = [root('p'), change('p', 'd1', 'description', 'Current words', 110), root('q')]
    await store.loadOpened({ kind: 'project', d: 'p' })
    const { state, project: p } = await project('p')
    expect(p.description).toBe('Current words')
    expect(state.texts).toEqual([`30850:${PK}:p`])
  })
})

describe('opening a project by its link, with the switch on', () => {
  const issue = (d: string): SignedEvent =>
    ({ id: `i-${d}`.padEnd(64, '0'), kind: 30851, pubkey: PK, created_at: 100, content: '', sig: '0'.repeat(128), tags: [['d', d], ['title', d], ['h', FOLDER], ['a', `30850:${PK}:p`]] }) as SignedEvent
  const issueChange = (d: string, id: string, field: string, value: string, at: number): SignedEvent =>
    ({ id: id.padEnd(64, '0'), kind: 1851, pubkey: PK, created_at: at, content: '', sig: '0'.repeat(128), tags: [['a', `30851:${PK}:${d}`], ['field', field], ['value', value], ['h', FOLDER]] }) as SignedEvent

  it("asks for its fields, current text and its issues' changes while its Folder's conversation is still being read", async () => {
    held = [root('p'), change('p', 'd1', 'description', 'Current words', 110), issue('i1'), issueChange('i1', 'c1', 'status', 'done', 110)]
    let before: Record<string, unknown>[] = []
    // Every other read answers at once; one turn of the event loop lets them all go before the conversation answers.
    folderRead = async () => {
      await new Promise((resolve) => setImmediate(resolve))
      before = asked.flat()
    }
    const state = foldWorkspace(await store.loadOpened({ kind: 'project', d: 'p' }))
    expect(before).toContainEqual({ fields: 'newest', kinds: [30850], '#d': ['p'], text: true })
    expect(before.some((f) => (f['#a'] as string[] | undefined)?.includes(`30851:${PK}:i1`))).toBe(true)
    expect(state.projects.find((candidate) => candidate.id === 'p')!.description).toBe('Current words')
    expect(state.issues.find((candidate) => candidate.id === 'i1')!.status).toBe('done')
  })

  it("still shows its Folder's conversation", async () => {
    const message = { id: 'm1'.padEnd(64, '0'), kind: 9, pubkey: PK, created_at: 120, content: 'Hello', sig: '0'.repeat(128), tags: [['h', FOLDER]] } as SignedEvent
    held = [root('p'), message]
    const opened = await store.loadOpened({ kind: 'project', d: 'p' })
    expect(opened.events.map((event) => event.id)).toContain(message.id)
    expect(opened.threadsAt[FOLDER]).toBeTypeOf('number')
  })

  it("reads its issues' changes in one request, unpaged, and shows their status", async () => {
    held = [root('p'), issue('i1'), issueChange('i1', 'c1', 'status', 'done', 110)]
    const state = foldWorkspace(await store.loadOpened({ kind: 'project', d: 'p' }))
    expect(state.issues.find((candidate) => candidate.id === 'i1')!.status).toBe('done')
    expect(paged.flat().filter((f) => f['#a'])).toEqual([])
    expect(asked.flat()).toContainEqual({ kinds: [1851], '#a': [`30851:${PK}:i1`], limit: 1000 })
  })

  it("pages its issues' changes when one request may have been cut short at the relay's ceiling", async () => {
    held = [root('p'), issue('i1'), ...Array.from({ length: 1000 }, (_, n) => issueChange('i1', `c${n}`, 'title', `t${n}`, 110 + n))]
    await store.loadOpened({ kind: 'project', d: 'p' })
    expect(paged.flat()).toContainEqual({ kinds: [1851], '#a': [`30851:${PK}:i1`] })
  })

  it('shows a deleted one as deleted, by whom', async () => {
    held = [root('p'), change('p', 'x1', 'deleted', 'true', 120)]
    const p = foldWorkspace(await store.loadOpened({ kind: 'project', d: 'p' })).projects.find((candidate) => candidate.id === 'p')!
    expect(p.deleted).toEqual({ by: PK, at: 120 })
  })

  it('shows a deleted one by its current title and text, read from all its changes', async () => {
    held = [root('linked'), change('linked', 't1', 'title', 'Renamed', 110), change('linked', 'd1', 'description', 'Last words', 111), change('linked', 'x1', 'deleted', 'true', 120)]
    const p = foldWorkspace(await store.loadOpened({ kind: 'project', d: 'linked' })).projects.find((candidate) => candidate.id === 'linked')!
    expect(p).toMatchObject({ title: 'Renamed', description: 'Last words', deleted: { by: PK, at: 120 } })
  })
})

describe('a deleted project in the load, with the switch on', () => {
  const edits = (d: string, n: number) => Array.from({ length: n }, (_, i) => change(d, `${d}-e${i}`, 'title', `Title ${i}`, 110 + i))

  it('reads its newest change only, however often it was edited, and shows it deleted by whom', async () => {
    held = [root('gone'), ...edits('gone', 50), change('gone', 'gone-x', 'deleted', 'true', 300)]
    const events = await store.loadAllEvents()
    const its = events.events.filter((event) => event.kind === 1851 && tagOf(event, 'a') === `30850:${PK}:gone`)
    expect(its.map((event) => event.id)).toEqual(['gone-x'.padEnd(64, '0')])
    expect(foldWorkspace(events).projects.find((candidate) => candidate.id === 'gone')!.deleted).toEqual({ by: PK, at: 300 })
  })

  it('reads it whole when a change written after the delete hides it, and it stays deleted', async () => {
    held = [root('stale'), change('stale', 'stale-x', 'deleted', 'true', 120), change('stale', 'stale-s', 'status', 'planned', 130)]
    const { project: p } = await project('stale')
    expect(p.deleted).toEqual({ by: PK, at: 120 })
    expect(p.status).toBe('planned')
  })

  it('is read whole when the Archived tab asks for it: its current title', async () => {
    held = [root('shelved'), change('shelved', 'shelved-t', 'title', 'Its current name', 110), change('shelved', 'shelved-x', 'deleted', 'true', 120)]
    const loaded = await store.loadAllEvents()
    const addr = `30850:${PK}:shelved`
    const read = foldWorkspace(await store.readThreads(loaded, { folders: [], about: [addr] }))
    expect(read.projects.find((candidate) => candidate.id === 'shelved')).toMatchObject({ title: 'Its current name', deleted: { by: PK, at: 120 } })
  })
})

describe('creating a project, with the switch on', () => {
  it('files its record in the team by h', async () => {
    const result = await createProject({ title: 'New', description: '', key: 'NEW', team: { folder: FOLDER, hasState: true } })
    expect(result.ok).toBe(true)
    const record = sent.find((event) => event.kind === 30850)!
    expect(record.tags).toContainEqual(['h', FOLDER])
    expect(record.tags.some((t) => t[0] === 'buzz-channel')).toBe(false)
  })
})
