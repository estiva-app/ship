/**
 * A team's page (D6, Katerina 18 November: "a team's page as Peek's") at the wire: who is in it is read from the relay
 * as Peek reads a team's roster, and Rename… in its ⋮ signs the same rename the page wrote before — a real `Store`
 * signing against a fake relay, so what is checked is the event the relay is sent.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planRenameFolder } from '@estiva-app/interop'
import type { Relay, UnsignedEvent } from '@estiva-app/protocol'

interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

const wire = vi.hoisted(() => ({
  held: [] as TestEvent[],
  sent: [] as TestEvent[],
  asked: [] as Record<string, unknown>[],
  rosterDown: false,
  store: undefined as unknown as { renameFolder: (args: { folder: string; name: string }) => unknown },
}))

function matches(filter: Record<string, unknown>, e: TestEvent): boolean {
  for (const [key, want] of Object.entries(filter)) {
    if (key === 'limit' || key === 'since' || key === 'until') continue
    const values = want as unknown[]
    if (key === 'kinds' && !values.includes(e.kind)) return false
    if (key === 'authors' && !values.includes(e.pubkey)) return false
    if (key.startsWith('#') && !e.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))) return false
  }
  return true
}

const answer = async (filters: Record<string, unknown>[]) => {
  wire.asked.push(...filters)
  if (wire.rosterDown && filters.some((f) => (f.kinds as number[] | undefined)?.includes(39002))) throw new Error('relay unreachable')
  return wire.held.filter((e) => filters.some((f) => matches(f, e)))
}

vi.mock('@/api/store', () => ({
  relay: { query: (filters: Record<string, unknown>[]) => answer(filters), queryAll: (filters: Record<string, unknown>[]) => answer(filters) },
  signer: { pubkey: 'c'.repeat(64) },
  projectFieldsNow: async () => undefined,
  timesOption: async () => ({}),
  inOrderOption: async () => ({}),
  store: { renameFolder: (args: { folder: string; name: string }) => wire.store.renameFolder(args) },
}))
vi.mock('@/api/clock', async (actual) => ({ ...(await actual<object>()), clockProblem: async () => null }))
vi.mock('@/api/useFolders', () => ({ reloadFolders: async () => {} }))
// The team's own read (its listing, resolved through each file's app) is not what is under test here.
const readFolder = vi.fn()
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: (id: string) => readFolder(id),
  loadQuery: () => async () => [],
}))
// No initiatives: the topics read has its own tests (TopicsPage.test).
vi.mock('@/api/topics', () => ({
  useTopics: () => ({ topics: [] }),
  useMuted: () => ({ muted: new Set(), settled: true }),
  useTopicActivity: () => ({ values: undefined }),
  useTopicMembers: () => ({ values: undefined }),
  reloadTopics: async () => {},
}))

import { Store } from '@/nostr/store'
import { FolderPage } from './FolderPage'

const TEAM = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
const ME = 'c'.repeat(64)
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
let seq = 0
const NOW = () => Math.floor(Date.now() / 1000)
const event = (kind: number, tags: string[][], pubkey = ANA): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey, created_at: NOW() - 1000 + seq, kind, tags, content: '' })
/** The team's roster: who its `kind:39002` lists. */
const roster = (...people: string[]) => event(39002, [['d', TEAM], ...people.map((p) => ['p', p])])
const team = (over: Record<string, unknown> = {}) => ({ id: TEAM, name: 'Onboarding', hasState: true, admins: [ME], source: 'state', files: [], ...over })
const say = vi.fn()

beforeEach(() => {
  wire.held.length = 0
  wire.sent.length = 0
  wire.asked.length = 0
  wire.rosterDown = false
  readFolder.mockReset()
  say.mockReset()
  const relay = {
    publish: async (signed: TestEvent) => {
      wire.sent.push(signed)
      return { ok: true }
    },
  } as unknown as Relay
  const signer = { pubkey: ME, kind: 'local', sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, pubkey: ME, id: String(++seq).padStart(64, 'f'), sig: '' }) }
  wire.store = new Store(relay, signer as never) as never
})

describe("A team's page reads who is in it, as Peek reads a team's roster", () => {
  it('the header names how many are in the team, from its roster, with up to three faces', async () => {
    readFolder.mockResolvedValue(team())
    wire.held.push(roster(ANA, RAVI, ME))
    render(<FolderPage id={TEAM} say={say} />)
    expect(await screen.findByLabelText('3 members')).toBeInTheDocument()
    // Asked as Peek asks: the team's `kind:39002` by its `d`, and the stored commands naming it by its `h`.
    expect(wire.asked).toEqual(expect.arrayContaining([expect.objectContaining({ kinds: [39002], '#d': [TEAM] }), expect.objectContaining({ '#h': [TEAM] })]))
    // Nothing to press: the pill says who is in it.
    expect(screen.queryByRole('button', { name: '3 members' })).toBeNull()
  })

  it('a roster that cannot be read claims nobody: no pill, and the page still draws', async () => {
    readFolder.mockResolvedValue(team())
    wire.rosterDown = true
    render(<FolderPage id={TEAM} say={say} />)
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    await waitFor(() => expect(wire.asked.some((f) => (f.kinds as number[] | undefined)?.includes(39002))).toBe(true))
    expect(screen.queryByLabelText(/members?$/)).toBeNull()
  })
})

describe("A team's page renames it from its ⋮ (FOL-8, D6)", () => {
  it('Rename… opens the team rename, filled, and signs the same rename event the page wrote before', async () => {
    readFolder.mockResolvedValue(team())
    render(<FolderPage id={TEAM} say={say} />)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename team' })
    const field = within(dialog).getByRole('textbox', { name: 'Team name' })
    expect(field).toHaveValue('Onboarding')
    // The name it already has is nothing to send.
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled()
    fireEvent.change(field, { target: { value: 'Onboarding 2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(wire.sent).toHaveLength(1))
    const [expected] = planRenameFolder(ME, Date.now(), { folder: TEAM, name: 'Onboarding 2' })
    expect(wire.sent[0]!.kind).toBe(expected!.kind)
    expect(wire.sent[0]!.tags).toEqual(expected!.tags)
    expect(wire.sent[0]!.pubkey).toBe(ME)
  })
})
