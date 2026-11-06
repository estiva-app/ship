import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTED_D_TAG, serializeMutedBlob } from '@estiva-app/conversation'
import type { TopicConversation } from '@estiva-app/interop'
import type { FolderState } from '@/api'

/*
  SHIPS-3: Ship's Topics, drawn from the real topics read (interop's
  `readTopics`) over a fake relay that answers filters as the relay does. The
  conversations read is stubbed with what interop's `topicConversations` would
  answer: its count and `fresh` are interop's own tests' (estiva-foundation#194);
  what is under test here is which row shows them.
*/
const held: TestEvent[] = []
let down = false
/** Every filter the page sent to the relay. */
const asked: Record<string, unknown>[] = []
const answer = async (filters: Record<string, unknown>[]) => {
  asked.push(...filters)
  if (down) throw new Error('relay unreachable')
  return held.filter((e) => filters.some((f) => matches(f, e)))
}
vi.mock('@/api/store', () => ({
  relay: { query: (filters: Record<string, unknown>[]) => answer(filters), queryAll: (filters: Record<string, unknown>[]) => answer(filters) },
  signer: { pubkey: 'c'.repeat(64) },
  projectFieldsNow: async () => undefined,
}))
// A `cipher:` content is its plaintext encrypted to you; anything else would not decrypt.
vi.mock('@/api/nip44', () => ({ nip44: { decrypt: async (ciphertext: string) => (ciphertext.startsWith('cipher:') ? ciphertext.slice('cipher:'.length) : undefined) } }))
/** Your read state, one answer held across renders as the real hook holds it. */
const landed = vi.hoisted(() => ({}))
vi.mock('@/api/readStateSync', async (actual) => ({ ...(await actual<object>()), useLandedReadState: () => landed }))
const conversations = new Map<string, TopicConversation>()
/** Read the conversations from the fake relay, as interop does, instead of the stub. */
let realConversations = false
vi.mock('@/api/foreign', async (actual) => {
  const foreign = await actual<typeof import('@/api/foreign')>()
  return { ...foreign, readTopicConversations: async (...args: Parameters<typeof foreign.readTopicConversations>) => (realConversations ? foreign.readTopicConversations(...args) : conversations) }
})

import { TopicsPage } from './TopicsPage'
import { prefetchTopics, resetTopicsForTests, topicChoicesNow } from '@/api/topics'
import { foldersNow } from '@/api/useFolders'
import { resetFeedFactsForTests } from '@/api/useFeedJudges'
import { buildManifest } from '@/nostr/manifest'

interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

function matches(filter: Record<string, unknown>, e: TestEvent): boolean {
  for (const [key, want] of Object.entries(filter)) {
    if (key === 'limit' || key === 'since' || key === 'until') continue
    const values = want as unknown[]
    if (key === 'kinds' && !values.includes(e.kind)) return false
    if (key === 'authors' && !values.includes(e.pubkey)) return false
    if (key === 'ids' && !values.includes(e.id)) return false
    if (key.startsWith('#') && !e.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))) return false
  }
  return true
}

const ME = 'c'.repeat(64)
const OWNER = 'a'.repeat(64)
let seq = 0
const event = (kind: number, tags: string[][], pubkey = OWNER): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey, created_at: 1_700_000_000 + ++seq, kind, tags, content: '' })
const address = (d: string) => `30840:${OWNER}:${d}`
const projectAddr = (d: string) => `30850:${OWNER}:${d}`
const issueAddr = (d: string) => `30851:${OWNER}:${d}`
const topic = (d: string, title: string, { folder = 'team', summary }: { folder?: string; summary?: string } = {}) =>
  event(30840, [['d', d], ['title', title], ['h', folder], ...(summary ? [['summary', summary]] : [])])
const lists = (d: string, file: string, folder = 'team') => event(1851, [['a', address(d)], ['O', d], ['field', `lists:${file}`], ['value', 'true'], ['h', folder], ['ts', String(Date.now())], ['o', file]])
const archiving = (d: string) => event(1851, [['a', address(d)], ['O', d], ['field', 'archived'], ['value', 'true'], ['h', 'team']])
/** Your Join, filed in the topic's own Folder: one filed in another is ignored (§6.2). */
const joined = (d: string, folder = 'team') => event(1851, [['a', address(d)], ['O', d], ['field', `member:${ME}`], ['value', 'true'], ['p', ME], ['h', folder]])
/** A comment you wrote in a topic's conversation (NIP-22, the topic as its root). */
const commented = (d: string) => event(1111, [['A', address(d)], ['K', '30840'], ['a', address(d)], ['k', '30840'], ['h', 'team']], ME)
/** Your mute list, encrypted to you. */
const mutes = (...keys: string[]) => ({ ...event(30078, [['d', MUTED_D_TAG], ['t', 'estiva-appdata']], ME), content: `cipher:${serializeMutedBlob(keys, Date.now())}` })
/** A team's list marking a topic one of its spaces (§3.3). */
const spaceMark = (d: string) => event(30890, [['d', 'team'], ['a', address(d), '', 'space']])
const shipManifest = () => {
  const unsigned = buildManifest(OWNER, Date.now())
  return { ...event(unsigned.kind, unsigned.tags), content: unsigned.content }
}
/** Peek's declaration of topics, with its comment kind: what a topic's conversations are read by. */
const topicManifest = () => {
  const unsigned = buildManifest(OWNER, Date.now())
  const tags = unsigned.tags.filter((t) => t[0] !== 'k' && t[0] !== 'd')
  return { ...event(unsigned.kind, [['d', 'peek'], ['k', '30840'], ...tags]), content: unsigned.content }
}
const projectRoot = (d: string, folder = 'team') => event(30850, [['d', d], ['title', d], ['h', folder]])
const issueRoot = (d: string, folder = 'team') => event(30851, [['d', d], ['title', d], ['h', folder]])

/** Ship's fold of those projects and issues, archived ones included. */
function ship(projects: { d: string; status: string }[], issues: string[]): { state: FolderState } {
  const state = {
    projects: projects.map(({ d, status }) => ({ addr: projectAddr(d), id: d, title: d, status })),
    issues: issues.map((d) => ({ addr: issueAddr(d), id: d, title: d })),
  } as unknown as FolderState
  return { state }
}

const tabs = () => screen.getAllByRole('tab').map((tab) => tab.textContent)
const rows = () => [...document.querySelectorAll('[data-topic]')].map((row) => row as HTMLElement)
const titles = () => rows().map((row) => within(row).getAllByText(/./)[0].textContent)

beforeEach(() => {
  held.length = 0
  asked.length = 0
  conversations.clear()
  realConversations = false
  down = false
  resetTopicsForTests()
  resetFeedFactsForTests()
})

describe("Ship's Topics", () => {
  it('opens on Your topics with every tab counted, A–Z, each row with its summary, projects done of all and what is new for you', async () => {
    held.push(shipManifest(), projectRoot('p-done'), projectRoot('p-open'), projectRoot('p-gone'), issueRoot('i-1'))
    held.push(topic('t-z', 'Zebra launch', { summary: 'Ship the zebra' }), joined('t-z'), lists('t-z', 'p-done'), lists('t-z', 'p-open'), lists('t-z', 'p-gone'))
    held.push(topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    held.push(topic('t-o', 'Others’ topic'), lists('t-o', 'i-1'))
    conversations.set(address('t-z'), { conversations: 4, unread: true, fresh: 2 })
    conversations.set(address('t-o'), { conversations: 1, unread: false, fresh: 0 })
    const { state } = ship(
      [
        { d: 'p-done', status: 'completed' },
        { d: 'p-open', status: 'in_progress' },
        { d: 'p-gone', status: 'completed' },
      ],
      ['i-1'],
    )
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(tabs()).toEqual(['All3', 'Your topics2', 'Other topics1', 'Archived0']))
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Your topics2')
    expect(titles()).toEqual(['Alpha', 'Zebra launch'])
    const zebra = rows()[1]
    expect(within(zebra).getByText('Ship the zebra')).toBeTruthy()
    // Every project it lists counts, as Linear's Initiatives count.
    expect(within(zebra).getByLabelText('2 of 3 projects completed')).toBeTruthy()
    // Said once beside the count and once by the phone's dot, for a screen reader.
    await waitFor(() => expect(within(zebra).getAllByText('2 new').length).toBeGreaterThan(0))
    expect(within(zebra).getByText('4')).toBeTruthy()
    // A topic with no summary has no second line, and nothing new says nothing.
    expect(within(rows()[0]).queryByText(/new/)).toBeNull()
    // A topic that lists only issues shows nothing in the Projects column.
    expect(within(rows()[0]).queryByLabelText(/projects completed/)).toBeNull()
    expect(within(rows()[0]).queryByText(/\d+ \/ \d+/)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Others’ topic'])
  })

  it('leaves out a space and a topic listing no project or issue, and puts only a topic archived in Peek under Archived', async () => {
    held.push(shipManifest(), projectRoot('p'), issueRoot('i-live'))
    held.push(topic('t-space', 'Bugs'), joined('t-space'), lists('t-space', 'i-live'), spaceMark('t-space'))
    held.push(topic('t-empty', 'Empty'), joined('t-empty'))
    held.push(topic('t-peek', 'Archived in Peek'), joined('t-peek'), lists('t-peek', 'i-live'), archiving('t-peek'))
    held.push(topic('t-live', 'Live'), joined('t-live'), lists('t-live', 'i-live'))
    const { state } = ship([{ d: 'p', status: 'planned' }], ['i-live'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(tabs()).toEqual(['All1', 'Your topics1', 'Other topics0', 'Archived1']))
    expect(titles()).toEqual(['Live'])
    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }))
    expect(titles()).toEqual(['Archived in Peek'])
  })

  it('a topic you only commented in is under Other topics, not Your topics: writing in a topic is not following it', async () => {
    held.push(shipManifest(), issueRoot('i-1'))
    held.push(topic('t-in', 'Joined'), joined('t-in'), lists('t-in', 'i-1'))
    held.push(topic('t-said', 'Commented'), commented('t-said'), lists('t-said', 'i-1'))
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(tabs()).toEqual(['All2', 'Your topics1', 'Other topics1', 'Archived0']))
    expect(titles()).toEqual(['Joined'])
    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Commented'])
  })

  it('a topic you joined and then muted is under Other topics, not Your topics, as Peek shows a mute as Not following', async () => {
    held.push(shipManifest(), issueRoot('i-1'), mutes(address('t-hush')))
    held.push(topic('t-in', 'Joined'), joined('t-in'), lists('t-in', 'i-1'))
    held.push(topic('t-hush', 'Muted'), joined('t-hush'), lists('t-hush', 'i-1'))
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(tabs()).toEqual(['All2', 'Your topics1', 'Other topics1', 'Archived0']))
    expect(titles()).toEqual(['Joined'])
    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Muted'])
  })

  it("a Folder's Topics shows only the topics filed in that Folder, under its name", async () => {
    held.push(shipManifest(), issueRoot('i-1'), issueRoot('i-2', 'design'))
    held.push(topic('t-team', 'Team topic'), joined('t-team'), lists('t-team', 'i-1'))
    held.push(topic('t-design', 'Design topic', { folder: 'design' }), joined('t-design', 'design'), lists('t-design', 'i-2', 'design'))
    const { state } = ship([], ['i-1', 'i-2'])
    render(<TopicsPage state={state} folders={[{ id: 'design', name: 'Design' } as never]} folder="design" />)

    await waitFor(() => expect(titles()).toEqual(['Design topic']))
    expect(screen.getByRole('heading', { name: 'Design · Topics' })).toBeTruthy()
  })

  it("says Topics didn't load when the read fails, and Try again reads them", async () => {
    down = true
    held.push(shipManifest(), issueRoot('i-1'), topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(screen.getByText('Topics didn’t load.')).toBeTruthy())
    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(titles()).toEqual(['Alpha']))
  })

  it("leaves Add to topic's list there at once on its first open after Topics has loaded", async () => {
    held.push(event(39000, [['d', 'team'], ['name', 'team']]), shipManifest(), issueRoot('i-1'), topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    // The app reads the Folders on its own; Add to topic waits for both.
    await foldersNow()
    expect(topicChoicesNow()).toBeUndefined()
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(titles()).toEqual(['Alpha']))
    expect(topicChoicesNow()?.yours.map((t) => t.title)).toEqual(['Alpha'])
  })

  it('reads the conversations of the topics it draws, never of a topic listing no work', async () => {
    realConversations = true
    held.push(shipManifest(), topicManifest(), issueRoot('i-1'))
    held.push(topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    held.push(topic('t-empty', 'Empty'), joined('t-empty'), topic('t-elsewhere', 'Elsewhere'))
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    // A topic's conversations, one filter per topic; the topics read's own comment filters (yours, naming you) cover all at once.
    const conversationReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(1111) && !f.authors && !f['#p'])
    const named = () => conversationReads().flatMap((f) => [...((f['#a'] as string[]) ?? []), ...((f['#A'] as string[]) ?? [])])
    await waitFor(() => expect(named()).toContain(address('t-a')))
    expect(named()).not.toContain(address('t-empty'))
    expect(named()).not.toContain(address('t-elsewhere'))
  })

  it('reads the conversations of a topic once it is drawn, after the first ones were read', async () => {
    realConversations = true
    held.push(shipManifest(), topicManifest(), issueRoot('i-1'), issueRoot('i-2'))
    held.push(topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    held.push(topic('t-b', 'Beta'), joined('t-b'), lists('t-b', 'i-2'))
    const conversationReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(1111) && !f.authors && !f['#p'])
    const named = () => conversationReads().flatMap((f) => [...((f['#a'] as string[]) ?? []), ...((f['#A'] as string[]) ?? [])])
    // Ship does not hold Beta's issue yet, so Beta is not drawn.
    const { rerender } = render(<TopicsPage state={ship([], ['i-1']).state} folders={[]} />)
    await waitFor(() => expect(named()).toContain(address('t-a')))
    expect(named()).not.toContain(address('t-b'))

    // The workspace now holds it: Beta is drawn, and its conversations are read.
    rerender(<TopicsPage state={ship([], ['i-1', 'i-2']).state} folders={[]} />)
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'Beta']))
    await waitFor(() => expect(named()).toContain(address('t-b')))
  })

  it('draws the topics the route read as it opened, without reading them again', async () => {
    held.push(shipManifest(), issueRoot('i-1'), topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    const topicReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840) && !f['#d'] && !f.authors).length
    // The route reads them beside the workspace, and the read lands before the page mounts.
    await prefetchTopics()
    expect(topicReads()).toBe(1)
    const { state } = ship([], ['i-1'])
    render(<TopicsPage state={state} folders={[]} />)

    await waitFor(() => expect(titles()).toEqual(['Alpha']))
    expect(topicReads()).toBe(1)
  })
})
