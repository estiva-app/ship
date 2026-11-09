/**
 * A tab open across the switch saves by itself (ALO-8), at the wire: Ship's
 * real relay client and its NIP-11 cache over a relay held in memory, reached
 * by `fetch`. The tab reads NIP-11 before the relay makes the switch, so it
 * writes a project change the old way, with no `prev`; the switched relay
 * refuses it, and the tab reads NIP-11 again and writes it again in order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentText, parseBlockDocument, serializeBlockDocument, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'

const PK = 'ab'.repeat(32)
const FOLDER = '3167adea-877f-43c4-96fb-517a2b2d5d24'
/** The relay's own words (buzz `fence_refusal`, SPEC §6.13): apps match up to the `;`. */
const SWITCH_REFUSAL =
  'invalid: a project change names the change it follows in prev; this app read the relay before it kept projects in order: reload it, or update estiva-agent, and save again'

let held: SignedEvent[] = []
/** Every event the tab sent, accepted or not. */
let sent: SignedEvent[] = []
let infoReads = 0
/** The relay has made the switch: its NIP-11 says so and it refuses a project change with no `prev`. */
let switched = false
/** A refusal the relay gives every event instead, when set. */
let refuseAll: string | undefined
let count = 0

const tagOf = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const dOf = (event: SignedEvent) => tagOf(event, 'd')
const addrOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${dOf(event)}`

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
  const out = new Set<SignedEvent>()
  for (const f of filters) {
    const kinds = f.kinds as number[] | undefined
    const matches = (event: SignedEvent) =>
      (!kinds || kinds.includes(event.kind)) &&
      (!f.authors || (f.authors as string[]).includes(event.pubkey)) &&
      (!f['#d'] || (f['#d'] as string[]).includes(dOf(event) ?? '')) &&
      (!f['#a'] || (f['#a'] as string[]).includes(tagOf(event, 'a') ?? '')) &&
      (!f['#h'] || (f['#h'] as string[]).includes(tagOf(event, 'h') ?? '')) &&
      (!f.ids || (f.ids as string[]).includes(event.id))
    if (f.fields === 'newest') {
      for (const root of held.filter((event) => event.kind !== 1851 && matches(event))) {
        out.add(root)
        for (const change of newestFields(addrOf(root), f.text === true)) out.add(change)
      }
      continue
    }
    const found = held.filter(matches).sort((x, y) => y.created_at - x.created_at)
    for (const event of typeof f.limit === 'number' ? found.slice(0, f.limit) : found) out.add(event)
  }
  return [...out]
}

function publish(event: SignedEvent): { accepted: boolean; message?: string } {
  sent.push(event)
  if (refuseAll) return { accepted: false, message: refuseAll }
  const projectChange = event.kind === 1851 && tagOf(event, 'a')?.startsWith('30850:') && !tagOf(event, 'field')?.startsWith('member:')
  if (switched && projectChange && !tagOf(event, 'prev')) return { accepted: false, message: SWITCH_REFUSAL }
  held.push(event)
  return { accepted: true }
}

/** The relay as Ship's `Relay` reaches it: NIP-11 by GET, `/query` and `/events` by POST. */
const fakeFetch = async (url: string, init?: { method?: string; body?: string }) => {
  const json = (body: unknown) => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) })
  if (!init?.method || init.method === 'GET') {
    infoReads++
    return json(switched ? { files: { requires_prev: ['osnova.project'] }, file_list: { newest: true, text: true } } : {})
  }
  const body = JSON.parse(init.body ?? 'null')
  if (url.endsWith('/query')) return json(answer(body))
  if (url.endsWith('/events')) return json(publish(body))
  throw new Error(`unexpected ${url}`)
}

vi.mock('../nostr/signer', async (original) => {
  const signer = {
    pubkey: PK,
    sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, pubkey: PK, id: (++count).toString(16).padStart(64, '0'), sig: '0'.repeat(128) }),
  }
  return { ...(await original<typeof import('../nostr/signer')>()), localSigner: () => signer, estivaIdSigner: () => signer }
})
vi.mock('../auth/estivaId', () => ({ heldToken: () => null, heldBearer: () => undefined, renew: async () => null }))
vi.mock('./clock', () => ({ clockProblem: async () => null, relayClockSkew: async () => 0 }))

const root = (d: string): SignedEvent =>
  ({ id: `r-${d}`.padEnd(64, '0'), kind: 30850, pubkey: PK, created_at: 100, content: '', sig: '0'.repeat(128), tags: [['d', d], ['name', d], ['description', 'Seed'], ['h', FOLDER]] }) as SignedEvent

const change = (d: string, id: string, field: string, value: string, at: number): SignedEvent =>
  ({ id: id.padEnd(64, '0'), kind: 1851, pubkey: PK, created_at: at, content: '', sig: '0'.repeat(128), tags: [['a', `30850:${PK}:${d}`], ['field', field], ['value', value], ['h', FOLDER]] }) as SignedEvent

const BLOCKS = 'estiva-blocks-1'
const doc = (...paragraphs: [string, string][]): string =>
  serializeBlockDocument({ type: 'doc', content: paragraphs.map(([id, words]) => ({ type: 'paragraph', id, content: [{ type: 'text', text: words }] })) })
const text = (d: string, id: string, value: string, at: number): SignedEvent => {
  const event = change(d, id, 'description', value, at)
  return { ...event, tags: [...event.tags, ['content-format', BLOCKS]] }
}

/** A fresh tab: the page's modules loaded anew, the workspace read before the relay switches. */
async function tabOpenedBeforeTheSwitch(d: string) {
  vi.resetModules()
  const writes = await import('./writes')
  const { store } = await import('./store')
  const { foldWorkspace } = await import('../nostr/store')
  const project = foldWorkspace(await store.loadAllEvents()).projects.find((candidate) => candidate.id === d)!
  expect(infoReads).toBe(1)
  return { ...writes, project }
}

beforeEach(() => {
  held = []
  sent = []
  infoReads = 0
  switched = false
  refuseAll = undefined
  vi.stubGlobal('fetch', fakeFetch)
})

describe('a project saved by a tab that read the relay before it switched', () => {
  it("is written again after the field's current change, and the person sees it saved", async () => {
    const status = change('p', 'c1', 'status', 'planned', 110)
    held = [root('p'), status]
    const { project, setProjectField } = await tabOpenedBeforeTheSwitch('p')
    switched = true

    expect(await setProjectField(project, 'status', 'in_progress', 'Status')).toEqual({ ok: true })
    expect(sent).toHaveLength(2)
    expect(tagOf(sent[0]!, 'prev')).toBeUndefined()
    expect(sent[1]!.tags).toContainEqual(['prev', status.id])
    expect(tagOf(sent[1]!, 'value')).toBe('in_progress')
    expect(infoReads).toBe(2)
  })

  it('follows the record itself for a field that never changed, and an archive goes the same way', async () => {
    held = [root('p')]
    const { project, archiveProject } = await tabOpenedBeforeTheSwitch('p')
    switched = true

    expect(await archiveProject(project, true, 'Shipped')).toEqual({ ok: true })
    expect(sent.at(-1)!.tags).toContainEqual(['prev', root('p').id])
    expect(tagOf(sent.at(-1)!, 'field')).toBe('archived')
    expect(sent.at(-1)!.content).toBe('Shipped')
  })

  it('keeps the words someone saved since the tab loaded the text', async () => {
    const loaded = doc(['b1', 'Alpha'], ['b2', 'Beta'])
    held = [root('p'), text('p', 'd1', loaded, 110)]
    const { project, setProjectField } = await tabOpenedBeforeTheSwitch('p')
    const theirs = text('p', 'd2', doc(['b1', 'Alpha'], ['b2', 'Beta'], ['b3', 'Gamma from Katerina']), 120)
    held.push(theirs)
    switched = true

    const mine = doc(['b1', 'Alpha, mine'], ['b2', 'Beta'])
    expect(await setProjectField(project, 'description', mine, 'Description', BLOCKS, { content: loaded, format: BLOCKS })).toEqual({ ok: true })
    const written = sent.at(-1)!
    expect(written.tags).toContainEqual(['prev', theirs.id])
    const saved = parseBlockDocument(tagOf(written, 'value')!)
    expect(documentText(saved)).toContain('Alpha, mine')
    expect(documentText(saved)).toContain('Gamma from Katerina')
  })

  it('is not written again on any other refusal', async () => {
    held = [root('p')]
    const { project, setProjectField } = await tabOpenedBeforeTheSwitch('p')
    refuseAll = 'blocked: not a channel member'

    expect(await setProjectField(project, 'title', 'Renamed', 'Rename')).toEqual({ ok: false, reason: 'blocked: not a channel member' })
    expect(sent).toHaveLength(1)
    expect(infoReads).toBe(1)
  })

  it('shows a second refusal for the switch rather than writing again', async () => {
    held = [root('p')]
    const { project, setProjectField } = await tabOpenedBeforeTheSwitch('p')
    switched = true
    refuseAll = SWITCH_REFUSAL

    const result = await setProjectField(project, 'title', 'Renamed', 'Rename')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('names the change it follows in prev')
    expect(sent).toHaveLength(2)
    expect(tagOf(sent[1]!, 'prev')).toBe(root('p').id)
  })
})
