/**
 * Issues read by their fields (ISS-4), at the wire: what Ship's load and an
 * opened issue ask the relay for with the issues' switch on, and what they
 * fold. A real `Store` over a relay held in memory that answers SPEC §6.13's
 * list read as the relay does: each first record, at most `limit` of them
 * newest first and `until` inclusive, with its fields' newest changes; the
 * text only with `text`, by `#d`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'
import { Store, foldWorkspace } from './store'

const PK = 'ab'.repeat(32)
const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const OTHER = '9a0c1d2e-3f40-4152-8637-48495a6b7c8d'

let held: SignedEvent[] = []
let asked: Record<string, unknown>[][] = []
let ids = 0

const dOf = (event: SignedEvent) => event.tags.find((t) => t[0] === 'd')?.[1]
const tagOf = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const addrOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${dOf(event)}`
const isRoot = (event: SignedEvent) => event.kind === 30850 || event.kind === 30851

function newestFields(addr: string, text: boolean): SignedEvent[] {
  const newest = new Map<string, SignedEvent>()
  for (const event of held) {
    if (event.kind !== 1851 || tagOf(event, 'a') !== addr) continue
    const field = tagOf(event, 'field')!
    const before = newest.get(field)
    if (!before || event.created_at > before.created_at || (event.created_at === before.created_at && event.id > before.id)) newest.set(field, event)
  }
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
      (f.until === undefined || event.created_at <= (f.until as number)) &&
      (!f.ids || (f.ids as string[]).includes(event.id))
    // At most 1000 a filter, newest first, as the relay clamps a plain read and a list read's first records.
    const limit = Math.min(typeof f.limit === 'number' ? f.limit : 1000, 1000)
    if (f.fields === 'newest') {
      // A file whose newest `deleted` change says true is left out of the list read (SPEC §6.13), after the
      // limit is taken, as the relay does (buzz `with_newest_changes`): a page holding a deleted file is short.
      const deleted = (root: SignedEvent) => newestFields(addrOf(root), false).some((e) => tagOf(e, 'field') === 'deleted' && tagOf(e, 'value') === 'true')
      const roots = held.filter((event) => isRoot(event) && matches(event)).sort((x, y) => y.created_at - x.created_at).slice(0, limit).filter((root) => !deleted(root))
      for (const root of roots) {
        out.add(root)
        for (const change of newestFields(addrOf(root), f.text === true)) out.add(change)
      }
      continue
    }
    for (const event of held.filter(matches).sort((x, y) => y.created_at - x.created_at).slice(0, limit)) out.add(event)
  }
  return [...out]
}

const relay = {
  query: async (filters: Record<string, unknown>[]) => answer(filters),
  queryAll: async (filters: Record<string, unknown>[]) => answer(filters.map(({ limit: _, ...f }) => ({ ...f, limit: 1_000_000 }))),
  publish: async () => ({ ok: true }),
}
const signer = { pubkey: PK, sign: async () => { throw new Error('nothing is signed here') } }

/** A Store as the app builds one: projects by their fields, issues by theirs when `issues` is on. */
const storeWith = (issues: boolean) =>
  new Store(relay as never, signer as never, async () => 0, async () => ({ text: true }), async () => [], async () => (issues ? { text: true } : undefined))

const project = (d: string, team = TEAM): SignedEvent =>
  ({ id: `p-${d}`.padEnd(64, '0'), kind: 30850, pubkey: PK, created_at: 50, content: '', sig: '0'.repeat(128), tags: [['d', d], ['name', d], ['h', team]] }) as SignedEvent

const issue = (d: string, parent: string, at = 100, text = 'First text'): SignedEvent =>
  ({ id: `i-${d}`.padEnd(64, '0'), kind: 30851, pubkey: PK, created_at: at, content: text, sig: '0'.repeat(128), tags: [['d', d], ['title', d], ['a', `30850:${PK}:${parent}`], ['h', TEAM]] }) as SignedEvent

const change = (d: string, field: string, value: string, at: number): SignedEvent =>
  ({ id: `c-${++ids}`.padEnd(64, '0'), kind: 1851, pubkey: PK, created_at: at, content: '', sig: '0'.repeat(128), tags: [['a', `30851:${PK}:${d}`], ['field', field], ['value', value], ['h', TEAM]] }) as SignedEvent

/** Every change to an issue read whole: a `#a` read of kind 1851 naming an issue. */
const everyIssueChange = () => asked.flat().filter((f) => (f.kinds as number[] | undefined)?.includes(1851) && ((f['#a'] as string[] | undefined) ?? []).some((a) => a.startsWith('30851:')) && f.limit !== 1)

beforeEach(() => {
  held = [project('alpha'), project('beta', OTHER)]
  asked = []
  ids = 0
})

describe('a cold load with the issues switch on', () => {
  it('reads each issue as it is now — status, assignee, ref and a moved one under its new project — and none of its old changes', async () => {
    held.push(issue('one', 'alpha'), change('one', 'status', 'in_progress', 110), change('one', 'status', 'done', 120), change('one', 'assignee', 'cd'.repeat(32), 130), change('one', 'ref', 'ALP-1', 131))
    held.push(issue('two', 'alpha'), change('two', 'project', `30850:${PK}:beta`, 140))

    const state = foldWorkspace(await storeWith(true).loadAllEvents())

    const one = state.issues.find((candidate) => candidate.id === 'one')!
    expect(one.status).toBe('done')
    expect(one.assignee).toBe('cd'.repeat(32))
    expect(one.ref).toBe('ALP-1')
    expect(state.issues.find((candidate) => candidate.id === 'two')!.projectAddr).toBe(`30850:${PK}:beta`)
    expect(everyIssueChange()).toEqual([])
    // No text is held: the page reads it when opened.
    expect(state.issueTexts).toEqual([])
  })

  it('reads the same bytes after 50 more saves to an issue', async () => {
    held.push(issue('one', 'alpha'), change('one', 'description', 'Second text', 110), change('one', 'status', 'todo', 111))
    const weigh = async () => {
      asked = []
      const events = (await storeWith(true).loadAllEvents()).events
      return { bytes: JSON.stringify(events).length, requests: asked.length }
    }
    const before = await weigh()
    for (let n = 0; n < 25; n++) held.push(change('one', 'description', `Text ${n}`, 200 + n), change('one', 'status', n % 2 ? 'todo' : 'in_progress', 200 + n))
    held.push(change('one', 'status', 'todo', 300))

    expect(await weigh()).toEqual(before)
  })

  it('lists every issue past the relay’s 1000 first records a read', async () => {
    for (let n = 0; n < 1005; n++) held.push(issue(`i${n}`, 'alpha', 1000 + n))

    const state = foldWorkspace(await storeWith(true).loadAllEvents())

    expect(state.issues.length).toBe(1005)
  })

  it('leaves a deleted issue out of the lists, not back as a Todo with no changes', async () => {
    held.push(issue('kept', 'alpha'), change('kept', 'status', 'in_progress', 110))
    held.push(issue('gone', 'alpha'), change('gone', 'status', 'in_progress', 110), change('gone', 'deleted', 'true', 120))

    const state = foldWorkspace(await storeWith(true).loadAllEvents())

    expect(state.issues.map((one) => one.id)).toEqual(['kept'])
    expect(state.issues[0]!.status).toBe('in_progress')
  })

  it('lists every live issue past a page the relay answered short because it held deleted ones', async () => {
    for (let n = 0; n < 2500; n++) held.push(issue(`i${n}`, 'alpha', 1000 + n))
    // Five deleted inside the second page of 1000 first records, which the relay answers with 995.
    for (let n = 1000; n < 1005; n++) held.push(change(`i${n}`, 'deleted', 'true', 5000))

    const state = foldWorkspace(await storeWith(true).loadAllEvents())

    expect(state.issues.length).toBe(2495)
  })

  it('refuses to load rather than drop the older issues when more than 1000 share one second', async () => {
    held.push(issue('older', 'alpha', 500))
    for (let n = 0; n < 1001; n++) held.push(issue(`same${n}`, 'alpha', 2000))

    await expect(storeWith(true).loadAllEvents()).rejects.toThrow(/share created_at/)
  })

  it('reads every change of every issue with the switch off, as before', async () => {
    held.push(issue('one', 'alpha'), change('one', 'status', 'done', 120))

    const state = foldWorkspace(await storeWith(false).loadAllEvents())

    expect(state.issues[0]!.status).toBe('done')
    expect(everyIssueChange().length).toBeGreaterThan(0)
    expect(state.issueTexts).toBeUndefined()
  })
})

describe('opening an issue with the issues switch on', () => {
  it('reads its current values and its newest text, not its changes', async () => {
    held.push(issue('one', 'alpha'), change('one', 'description', 'Old save', 110), change('one', 'description', 'Newest text', 120), change('one', 'status', 'done', 121))

    const state = foldWorkspace(await storeWith(true).loadOpened({ kind: 'issue', d: 'one' }))

    const one = state.issues.find((candidate) => candidate.id === 'one')!
    expect(one.description).toBe('Newest text')
    expect(one.status).toBe('done')
    expect(state.issueTexts).toContain(`30851:${PK}:one`)
    expect(everyIssueChange()).toEqual([])
  })

  it('asks for it by its fields once, with its text, not once more without (ISS-9)', async () => {
    held.push(issue('one', 'alpha'), change('one', 'description', 'Newest text', 120), change('one', 'status', 'done', 121))

    const state = foldWorkspace(await storeWith(true).loadOpened({ kind: 'issue', d: 'one' }))

    const byFields = asked.flat().filter((f) => f.fields === 'newest' && (f['#d'] as string[] | undefined)?.includes('one'))
    expect(byFields).toEqual([expect.objectContaining({ text: true })])
    expect(state.issues.find((candidate) => candidate.id === 'one')?.status).toBe('done')
  })

  it('reads its newest text when reached by navigating, and keeps reading it on each whole load', async () => {
    held.push(issue('one', 'alpha'), change('one', 'description', 'Newest text', 120))
    const store = storeWith(true)
    const loaded = await store.loadAllEvents()

    const opened = await store.readThreads(loaded, { folders: [], about: [`30851:${PK}:one`] })
    expect(foldWorkspace(opened).issues[0]!.description).toBe('Newest text')
    expect(opened.issueTexts).toContain(`30851:${PK}:one`)

    const again = await store.loadAllEvents()
    expect(foldWorkspace(again).issues[0]!.description).toBe('Newest text')
    expect(again.issueTexts).toContain(`30851:${PK}:one`)
    expect(everyIssueChange()).toEqual([])
  })

  it('finds a moved issue’s project from its newest change and reads that project’s team', async () => {
    held.push(issue('one', 'alpha'), change('one', 'project', `30850:${PK}:beta`, 140))

    const state = foldWorkspace(await storeWith(true).loadOpened({ kind: 'issue', d: 'one' }))

    expect(state.issues[0]!.projectAddr).toBe(`30850:${PK}:beta`)
    expect(state.folders).toContain(OTHER)
  })
})
