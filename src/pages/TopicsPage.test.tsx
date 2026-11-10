import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTED_D_TAG, serializeMutedBlob } from '@estiva-app/conversation'
import type { FolderState } from '@/api'

/*
  TOPI-9: Ship's Topics, which the sidebar's Explore topics opens, and the
  sidebar's five, drawn from the real reads (interop's `readTopics` and
  `readTopicActivity`, conversation's `placeListing`) over a fake relay that
  answers filters as the relay does. Join is signed by a real `Store` and
  checked on the event the relay is sent.
*/
const wire = vi.hoisted(() => ({
  held: [] as TestEvent[],
  sent: [] as TestEvent[],
  store: undefined as unknown as { joinPlace: (args: unknown) => unknown; publishMuted: (ciphertext: string) => unknown },
}))
const held = wire.held
let down = false
/** Kinds the relay refuses to take. */
const refuseKinds = new Set<number>()
/** Every filter the page sent to the relay. */
const asked: Record<string, unknown>[] = []
/** While set, the mute list's read waits for it to settle: a slow mute list. */
let muteGate: Promise<void> | undefined
/**
 * Every ask Ship paged (`queryAll`), one entry per call. Only the read of every
 * topic pages (`readAllTopics`); the lean read of yours never does (`readSidebarTopics`).
 */
const paged: Record<string, unknown>[][] = []
/** While set, every paged ask waits for it to settle: a slow read of every topic. */
let everyTopicGate: Promise<void> | undefined
/** Paged asks fail: the read of every topic does not land, the lean read does. */
let pagedDown = false
const answer = async (filters: Record<string, unknown>[], { paging = false } = {}) => {
  asked.push(...filters)
  if (paging) paged.push(filters)
  if (muteGate && filters.some((f) => (f.kinds as number[] | undefined)?.includes(30078))) await muteGate
  if (paging && everyTopicGate) await everyTopicGate
  if (down || (paging && pagedDown)) throw new Error('relay unreachable')
  return held.filter((e) => filters.some((f) => matches(f, e)))
}
vi.mock('@/api/store', () => ({
  relay: { query: (filters: Record<string, unknown>[]) => answer(filters), queryAll: (filters: Record<string, unknown>[]) => answer(filters, { paging: true }) },
  signer: { pubkey: 'c'.repeat(64) },
  projectFieldsNow: async () => undefined,
  store: {
    joinPlace: (args: unknown) => wire.store.joinPlace(args),
    publishMuted: (ciphertext: string) => wire.store.publishMuted(ciphertext),
  },
}))
vi.mock('@/api/clock', async (actual) => ({ ...(await actual<object>()), clockProblem: async () => null }))
// A `cipher:` content is its plaintext encrypted to you; anything else would not decrypt.
vi.mock('@/api/nip44', () => ({
  nip44: {
    decrypt: async (ciphertext: string) => (ciphertext.startsWith('cipher:') ? ciphertext.slice('cipher:'.length) : undefined),
    encrypt: async (plaintext: string) => `cipher:${plaintext}`,
  },
}))
/** Your read state, one answer held across renders as the real hook holds it. */
const landed = vi.hoisted(() => ({}))
vi.mock('@/api/readStateSync', async (actual) => ({ ...(await actual<object>()), useLandedReadState: () => landed }))

import { Store } from '@/nostr/store'
import type { Relay, UnsignedEvent } from '@estiva-app/protocol'
import { TopicsPage } from './TopicsPage'
import { ensureTopics, prefetchTopics, resetTopicsForTests, topicChoicesNow } from '@/api/topics'
import { TopicPage } from './TopicPage'
import { FileTopics } from '@/components/FileTopics'
import { useSidebarTopics } from '@/api/useSidebarTopics'
import { ShipSidebar } from '@/components/ShipSidebar'
import { foldersNow } from '@/api/useFolders'
import { resetFeedFactsForTests } from '@/api/useFeedJudges'
import { buildManifest } from '@/nostr/manifest'
import type { Archives } from '@/lib/archive'
import type { Route } from '@/router'

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

/** Team ids are UUIDs, as every team's on production is; conversation's `placeFilters` refuses anything else. */
const TEAM = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
const DESIGN = '0212db6d-bcbf-40d0-890e-f4f056db2f5d'
const ME = 'c'.repeat(64)
const OWNER = 'a'.repeat(64)
const KATERINA = 'b'.repeat(64)
let seq = 0
const NOW = () => Math.floor(Date.now() / 1000)
/** Each event a second after the last, ending well before now: the order they are pushed is the order they happened. */
const event = (kind: number, tags: string[][], pubkey = OWNER): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey, created_at: NOW() - 100_000 + seq, kind, tags, content: '' })
const address = (d: string) => `30840:${OWNER}:${d}`
const projectAddr = (d: string) => `30850:${OWNER}:${d}`
const issueAddr = (d: string) => `30851:${OWNER}:${d}`
const topic = (d: string, title: string, { folder = TEAM, summary }: { folder?: string; summary?: string } = {}) =>
  event(30840, [['d', d], ['title', title], ['h', folder], ...(summary ? [['summary', summary]] : [])])
const lists = (d: string, file: string, folder = TEAM) => event(1851, [['a', address(d)], ['O', d], ['field', `lists:${file}`], ['value', 'true'], ['h', folder], ['ts', String(Date.now())], ['o', file]])
const archiving = (d: string) => event(1851, [['a', address(d)], ['O', d], ['field', 'archived'], ['value', 'true'], ['h', TEAM]])
/** A Join, filed in the topic's own Folder: one filed in another is ignored (§6.2). */
const joined = (d: string, who = ME, folder = TEAM) => event(1851, [['a', address(d)], ['O', d], ['field', `member:${who}`], ['value', 'true'], ['p', who], ['h', folder]], who)
/** A comment in a topic's conversation (NIP-22, the topic as its root). */
const commented = (d: string, who = ME) => event(1111, [['A', address(d)], ['K', '30840'], ['a', address(d)], ['k', '30840'], ['h', TEAM]], who)
/** Your mute list, encrypted to you. */
const mutes = (...keys: string[]) => ({ ...event(30078, [['d', MUTED_D_TAG], ['t', 'estiva-appdata']], ME), content: `cipher:${serializeMutedBlob(keys, Date.now())}` })
/** A team's list marking a topic one of its spaces (§3.3). */
const spaceMark = (d: string) => event(30890, [['d', TEAM], ['a', address(d), '', 'space']])
const shipManifest = () => {
  const unsigned = buildManifest(OWNER, Date.now())
  return { ...event(unsigned.kind, unsigned.tags), content: unsigned.content }
}
const projectRoot = (d: string, folder = TEAM) => event(30850, [['d', d], ['title', d], ['h', folder]])
const issueRoot = (d: string, folder = TEAM) => event(30851, [['d', d], ['title', d], ['h', folder]])

/** Ship's fold of those projects and issues. */
function ship(projects: string[], issues: string[]): FolderState {
  return {
    projects: projects.map((d) => ({ addr: projectAddr(d), id: d, title: d, status: 'in_progress' })),
    issues: issues.map((d) => ({ addr: issueAddr(d), id: d, title: d, status: 'todo' })),
  } as unknown as FolderState
}

const TEAMS = [{ id: TEAM, name: 'Product' } as never]
const tabs = () => screen.getAllByRole('tab').map((tab) => tab.textContent)
const rows = () => [...document.querySelectorAll('[data-topic]')].map((row) => row as HTMLElement)
const titles = () => rows().map((row) => within(row).getAllByText(/./)[0].textContent)
const rowOf = (title: string) => rows().find((row) => within(row).queryByText(title))!
const say = vi.fn()
const page = (folder?: string, folders = TEAMS) => <TopicsPage folders={folders} folder={folder} say={say} />

beforeEach(() => {
  held.length = 0
  wire.sent.length = 0
  refuseKinds.clear()
  asked.length = 0
  down = false
  muteGate = undefined
  everyTopicGate = undefined
  paged.length = 0
  pagedDown = false
  say.mockReset()
  resetTopicsForTests()
  resetFeedFactsForTests()
  const relay = {
    publish: async (signed: TestEvent) => {
      if (refuseKinds.has(signed.kind)) return { ok: false, reason: 'blocked: test' }
      wire.sent.push(signed)
      held.push(signed)
      return { ok: true }
    },
  } as unknown as Relay
  const signer = { pubkey: ME, kind: 'local', sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, pubkey: ME, id: String(++seq).padStart(64, 'f'), sig: '' }) }
  wire.store = new Store(relay, signer as never) as never
})

afterEach(() => vi.useRealTimers())

describe("Ship's Topics (Explore topics)", () => {
  it('opens on Your topics newest activity first, every topic you can open counted, each row with its team, members and last active', async () => {
    held.push(shipManifest(), issueRoot('i-1'))
    // Zebra is made first, Alpha later; then Katerina writes in Zebra, so Zebra is the newest.
    held.push(topic('t-z', 'Zebra launch', { summary: 'Ship the zebra' }), joined('t-z'), lists('t-z', 'i-1'))
    held.push(topic('t-a', 'Alpha'), joined('t-a'))
    held.push(topic('t-o', 'Others’ topic'))
    held.push({ ...commented('t-z', KATERINA), created_at: NOW() - 2 * 3600 })
    render(page())

    await waitFor(() => expect(tabs()).toEqual(['All3', 'Your topics2', 'Other topics1', 'Archived0']))
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Your topics2')
    // Newest first, not A to Z.
    expect(titles()).toEqual(['Zebra launch', 'Alpha'])
    const zebra = rowOf('Zebra launch')
    expect(within(zebra).getByText('Ship the zebra')).toBeTruthy()
    expect(within(zebra).getByText('Product')).toBeTruthy()
    await waitFor(() => expect(within(zebra).getByText('2h ago')).toBeTruthy())
    // Its maker and you.
    await waitFor(() => expect(within(zebra).getByText('2')).toBeTruthy())
    // A topic you are in has no Join.
    expect(within(zebra).queryByRole('button', { name: 'Join' })).toBeNull()

    // The other tabs are A to Z, and a topic listing no project or issue is on them.
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    expect(titles()).toEqual(['Alpha', 'Others’ topic', 'Zebra launch'])
    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Others’ topic'])
    await waitFor(() => expect(within(rowOf('Others’ topic')).getByText('1')).toBeTruthy())
  })

  it('leaves out a space, and puts a topic archived in Peek under Archived, with no Join', async () => {
    held.push(shipManifest(), issueRoot('i-live'))
    held.push(topic('t-space', 'Bugs'), joined('t-space'), lists('t-space', 'i-live'), spaceMark('t-space'))
    held.push(topic('t-peek', 'Archived in Peek'), lists('t-peek', 'i-live'), archiving('t-peek'))
    held.push(topic('t-live', 'Live'), joined('t-live'))
    render(page())

    await waitFor(() => expect(tabs()).toEqual(['All1', 'Your topics1', 'Other topics0', 'Archived1']))
    expect(titles()).toEqual(['Live'])
    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }))
    expect(titles()).toEqual(['Archived in Peek'])
    expect(within(rows()[0]).getByLabelText('Archived')).toBeTruthy()
    expect(within(rows()[0]).queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('a topic you only commented in is under Other topics, not Your topics: writing in a topic is not following it', async () => {
    held.push(shipManifest())
    held.push(topic('t-in', 'Joined'), joined('t-in'))
    held.push(topic('t-said', 'Commented'), commented('t-said'))
    render(page())

    await waitFor(() => expect(tabs()).toEqual(['All2', 'Your topics1', 'Other topics1', 'Archived0']))
    expect(titles()).toEqual(['Joined'])
    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Commented'])
  })

  it('a topic you joined and then muted is under Other topics, not Your topics, as Peek shows a mute as Not following', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    held.push(topic('t-in', 'Joined'), joined('t-in'))
    held.push(topic('t-hush', 'Muted'), joined('t-hush'))
    render(page())

    await waitFor(() => expect(tabs()).toEqual(['All2', 'Your topics1', 'Other topics1', 'Archived0']))
    expect(titles()).toEqual(['Joined'])
    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    expect(titles()).toEqual(['Muted'])
  })

  it('finds a topic by the start of a word of its title, and says so when nothing matches', async () => {
    held.push(shipManifest(), topic('t-z', 'Zebra launch'), joined('t-z'), topic('t-a', 'Alpha'), joined('t-a'), topic('t-q', 'Q4-plan'), joined('t-q'))
    render(page())
    await waitFor(() => expect(titles()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText('Find a topic'), { target: { value: 'lau' } })
    expect(titles()).toEqual(['Zebra launch'])
    // Typed as the title is written, hyphen and all.
    fireEvent.change(screen.getByLabelText('Find a topic'), { target: { value: 'q4-pl' } })
    expect(titles()).toEqual(['Q4-plan'])
    // Never the middle of a word.
    fireEvent.change(screen.getByLabelText('Find a topic'), { target: { value: 'aunch' } })
    expect(titles()).toEqual([])
    expect(screen.getByText('No topic matches “aunch”.')).toBeTruthy()
  })

  it('Join follows the topic at All, as Peek’s Join does, and the row keeps its place with Join gone and one more member', async () => {
    held.push(shipManifest(), topic('t-in', 'Mine'), joined('t-in'), topic('t-o', 'Theirs'))
    render(page())
    fireEvent.click(await screen.findByRole('tab', { name: /Other topics/ }))
    await waitFor(() => expect(within(rowOf('Theirs')).getByText('1')).toBeTruthy())

    fireEvent.click(within(rowOf('Theirs')).getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(wire.sent).toHaveLength(1))
    const [sent] = wire.sent
    expect(sent.kind).toBe(1851)
    expect(sent.pubkey).toBe(ME)
    expect(sent.tags).toEqual(expect.arrayContaining([['a', address('t-o')], ['field', `follow:${ME}`], ['value', 'all'], ['h', TEAM]]))
    await waitFor(() => expect(within(rowOf('Theirs')).queryByRole('button', { name: 'Join' })).toBeNull())
    expect(within(rowOf('Theirs')).getByText('2')).toBeTruthy()
    // Not moved under the pointer: it goes to Your topics on the next open.
    expect(titles()).toEqual(['Theirs'])
    expect(say).not.toHaveBeenCalled()
  })

  it('Join on a topic you muted takes it out of your mute list, keeping the rest, and counts you once', async () => {
    held.push(shipManifest(), mutes(address('t-hush'), address('t-other')), topic('t-hush', 'Muted'), joined('t-hush'), topic('t-other', 'Other'))
    render(page())
    fireEvent.click(await screen.findByRole('tab', { name: /Other topics/ }))
    // Its maker and you, muted.
    await waitFor(() => expect(within(rowOf('Muted')).getByText('2')).toBeTruthy())

    fireEvent.click(within(rowOf('Muted')).getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(wire.sent.map((e) => e.kind)).toEqual([1851, 30078]))
    const unmute = wire.sent[1]
    expect(unmute.pubkey).toBe(ME)
    expect(unmute.tags).toContainEqual(['d', MUTED_D_TAG])
    const list = JSON.parse(unmute.content.slice('cipher:'.length)) as { keys: string[] }
    expect(list.keys).toEqual([address('t-other')])
    // You were following it already, muted: still two members, not three.
    await waitFor(() => expect(within(rowOf('Muted')).queryByRole('button', { name: 'Join' })).toBeNull())
    expect(within(rowOf('Muted')).getByText('2')).toBeTruthy()
  })

  it('Join that lands while the relay refuses the unmute says you joined but it is still muted, and keeps Join to try again', async () => {
    refuseKinds.add(30078)
    held.push(shipManifest(), mutes(address('t-hush')), topic('t-hush', 'Muted'), joined('t-hush'))
    render(page())
    fireEvent.click(await screen.findByRole('tab', { name: /Other topics/ }))
    await waitFor(() => expect(titles()).toContain('Muted'))

    fireEvent.click(within(rowOf('Muted')).getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(say).toHaveBeenCalledWith('Joined “Muted”, but it is still muted. Join again to unmute it.', 'error'))
    expect(wire.sent.map((e) => e.kind)).toEqual([1851])
    expect(within(rowOf('Muted')).getByRole('button', { name: 'Join' })).toBeTruthy()
  })

  it("a Folder's Topics shows only the topics filed in that Folder, under its name", async () => {
    held.push(shipManifest())
    held.push(topic('t-team', 'Team topic'), joined('t-team'))
    held.push(topic('t-design', 'Design topic', { folder: DESIGN }), joined('t-design', ME, DESIGN))
    render(page(DESIGN, [{ id: DESIGN, name: 'Design' } as never]))

    await waitFor(() => expect(titles()).toEqual(['Design topic']))
    expect(screen.getByRole('heading', { name: 'Design · Topics' })).toBeTruthy()
  })

  it("says Topics didn't load when the read fails, and Try again reads them", async () => {
    down = true
    held.push(shipManifest(), topic('t-a', 'Alpha'), joined('t-a'))
    render(page())

    await waitFor(() => expect(screen.getByText('Topics didn’t load.')).toBeTruthy())
    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(titles()).toEqual(['Alpha']))
  })

  it("leaves Add to topic's list there at once on its first open after Topics has loaded", async () => {
    held.push(event(39000, [['d', TEAM], ['name', TEAM]]), shipManifest(), issueRoot('i-1'), topic('t-a', 'Alpha'), joined('t-a'), lists('t-a', 'i-1'))
    // The app reads the Folders on its own; Add to topic waits for both.
    await foldersNow()
    expect(topicChoicesNow()).toBeUndefined()
    render(page())

    await waitFor(() => expect(titles()).toEqual(['Alpha']))
    expect(topicChoicesNow()?.yours.map((t) => t.title)).toEqual(['Alpha'])
  })

  it('draws the topics the route read as it opened, without reading them again', async () => {
    held.push(shipManifest(), topic('t-a', 'Alpha'), joined('t-a'))
    const topicReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840) && !f['#d'] && !f.authors).length
    // The route reads them beside the workspace, and the read lands before the page mounts.
    await prefetchTopics()
    expect(topicReads()).toBe(1)
    render(page())

    await waitFor(() => expect(titles()).toEqual(['Alpha']))
    expect(topicReads()).toBe(1)
  })

  it('reads who is in a topic only for the tab shown: a cold open on Your topics reads none of the others', async () => {
    held.push(shipManifest(), topic('t-in', 'Mine'), joined('t-in'), topic('t-o', 'Theirs'))
    // The members read is the only one asking a team's roster commands, and a topic's own Folder commands.
    const rosterReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(9000)).flatMap((f) => (f['#h'] as string[]) ?? [])
    const membersOf = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(1852)).flatMap((f) => (f['#a'] as string[]) ?? [])
    render(page())
    await waitFor(() => expect(rosterReads().length).toBeGreaterThan(0))
    const before = membersOf()
    expect(before).toContain(address('t-in'))
    expect(before).not.toContain(address('t-o'))

    fireEvent.click(screen.getByRole('tab', { name: /Other topics/ }))
    await waitFor(() => expect(membersOf().length).toBeGreaterThan(before.length))
    expect(membersOf().slice(before.length)).toContain(address('t-o'))
  })
})

/** The sidebar as the app wires it: the same reads, your five, each folding to its work; on Issues unless another route is named. */
function Sidebar({ state, route = { name: 'issues' } }: { state: FolderState; route?: Route }) {
  const archives: Archives = { ofIssue: () => undefined, ofProject: () => undefined }
  const topics = useSidebarTopics({ projects: state.projects, issues: state.issues }, archives, route)
  return <ShipSidebar openIssues={0} activeProjects={0} hrefFor={(entry) => `/${entry}`} {...topics} />
}
const sidebarTopics = () =>
  screen
    .getAllByRole('link')
    .map((a) => a.textContent)
    .filter((text) => text?.startsWith('T'))

/** Reads of every topic: the paged asks for topic roots, which only `readAllTopics` makes (ALO-17). */
const everyTopicReads = () => paged.filter((filters) => filters.some((f) => (f.kinds as number[] | undefined)?.includes(30840))).length
/**
 * Lets every answer the fake relay owes land. No timer runs in these reads (the
 * relay answers on a promise), so there is no clock to advance: each empty turn
 * lets one more promise in the chain settle, and nothing waits on real time.
 */
const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await act(async () => {})
}
/** Reads of every topic's root: one per read of the topics, lean or full. */
const rootReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.join() === '30840' && !f['#d'] && !f.authors).length
const muteReads = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30078)).length
const linksIn = (box: HTMLElement) =>
  within(box)
    .queryAllByRole('link')
    .map((a) => a.textContent)
    .filter((text) => text?.startsWith('T'))

describe("Ship's sidebar: where your five are read from (ALO-17)", () => {
  it('on Issues draws your five newest in order from a read of only your topics, and never reads every topic', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    for (const n of [1, 2, 3, 4, 5, 6]) held.push(topic(`t-${n}`, `Topic ${n}`), joined(`t-${n}`))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'), topic('t-old', 'T archived'), joined('t-old'), archiving('t-old'), topic('t-not', 'T not mine'))
    held.push(commented('t-3', KATERINA))
    render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)

    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 3', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 2']))
    expect(everyTopicReads()).toBe(0)
    expect(rootReads()).toBe(1)
  })

  it('on Topics draws the same five from the page’s own read: no read of its own, one mute list between them, and none again on a topic’s page', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    for (const n of [1, 2, 3, 4, 5, 6]) held.push(topic(`t-${n}`, `Topic ${n}`), joined(`t-${n}`))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'), topic('t-old', 'T archived'), joined('t-old'), archiving('t-old'), topic('t-not', 'T not mine'))
    held.push(commented('t-3', KATERINA))
    // As the app opens Topics: the route's read, then the page and the sidebar beside it.
    void prefetchTopics()
    render(page())
    const { container, rerender } = render(<Sidebar state={ship([], [])} route={{ name: 'topics' }} />)

    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 3', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 2']))
    await settle()
    expect(rootReads()).toBe(1)
    expect(muteReads()).toBe(1)

    // On to a topic's page: the sidebar reads nothing again.
    rerender(<Sidebar state={ship([], [])} route={{ name: 'topic', d: 't-3' }} />)
    await settle()
    expect(linksIn(container)).toEqual(['Topic 3', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 2'])
    expect(rootReads()).toBe(1)
    expect(muteReads()).toBe(1)
  })

  it('moving Issues → Topics → Issues keeps your five drawn while Topics’ read is out, draws from it once it lands, keeps its five back on Issues, and reads nothing more', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    for (const n of [1, 2, 3, 4, 5, 6]) held.push(topic(`t-${n}`, `Topic ${n}`), joined(`t-${n}`))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'))
    held.push(commented('t-3', KATERINA))
    const { container, rerender } = render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 3', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 2']))

    // A topic joined since, which only Topics' read of every topic will see; that read is slow.
    held.push(topic('t-7', 'Topic 7'), joined('t-7'))
    let release = () => {}
    everyTopicGate = new Promise((resolve) => (release = resolve))
    void prefetchTopics()
    render(page())
    rerender(<Sidebar state={ship([], [])} route={{ name: 'topics' }} />)
    await waitFor(() => expect(everyTopicReads()).toBeGreaterThan(0))
    await settle()
    // Topics' read is still out: the same five stay drawn, not a loading list.
    expect(linksIn(container)).toEqual(['Topic 3', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 2'])

    // It lands, with its activity: the five are Topics' own.
    release()
    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 7', 'Topic 3', 'Topic 6', 'Topic 5', 'Topic 4']))

    // Back on Issues: the same five, Topics' read being the latest, never the older five; and the sidebar reads nothing.
    await settle()
    const reads = asked.length
    rerender(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    expect(linksIn(container)).toEqual(['Topic 7', 'Topic 3', 'Topic 6', 'Topic 5', 'Topic 4'])
    await settle()
    expect(linksIn(container)).toEqual(['Topic 7', 'Topic 3', 'Topic 6', 'Topic 5', 'Topic 4'])
    expect(asked.length).toBe(reads)
  })

  it('on Issues, a link to a space you are in goes to Peek from the first read of your topics, and the sidebar never draws the space', async () => {
    held.push(shipManifest(), topic('t-1', 'Topic 1'), joined('t-1'), topic('t-sp', 'T space'), joined('t-sp'), spaceMark('t-sp'))
    const { container } = render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    await waitFor(() => expect(rootReads()).toBe(1))
    await settle()
    expect(linksIn(container)).toEqual(['Topic 1'])

    // The issue's topics land after the sidebar's read: its chip for the space opens Peek, not Ship's page.
    const space = { address: address('t-sp'), folder: TEAM, title: 'T space', openUrl: 'https://peek.estiva.app/topic/t-sp', archived: false }
    render(<FileTopics topics={[space]} busy={new Set()} onChange={vi.fn()} readChoices={vi.fn()} />)
    expect(screen.getByRole('link', { name: /T space/ }).getAttribute('href')).toBe('https://peek.estiva.app/topic/t-sp')
    expect(everyTopicReads()).toBe(0)
  })

  it('Issues → Topics reads your mute list once: Topics takes the list the read of your topics opened, and leaves the same topic out', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    for (const n of [1, 2, 3]) held.push(topic(`t-${n}`, `Topic ${n}`), joined(`t-${n}`))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'))
    const { container, rerender } = render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 3', 'Topic 2', 'Topic 1']))
    expect(muteReads()).toBe(1)

    void prefetchTopics()
    render(page())
    rerender(<Sidebar state={ship([], [])} route={{ name: 'topics' }} />)
    await waitFor(() => expect(titles()).toContain('Topic 3'))
    await settle()
    expect(titles()).not.toContain('T muted')
    expect(linksIn(container)).toEqual(['Topic 3', 'Topic 2', 'Topic 1'])
    expect(muteReads()).toBe(1)
  })

  it('on Topics, when the read of every topic fails, your five from the read of yours stay drawn rather than “Didn’t load.”', async () => {
    held.push(shipManifest(), topic('t-1', 'Topic 1'), joined('t-1'), topic('t-2', 'Topic 2'), joined('t-2'))
    const { container, rerender } = render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 2', 'Topic 1']))

    pagedDown = true
    void prefetchTopics().catch(() => {})
    rerender(<Sidebar state={ship([], [])} route={{ name: 'topics' }} />)
    await waitFor(() => expect(everyTopicReads()).toBeGreaterThan(0))
    await settle()
    expect(screen.queryByText('Didn’t load.')).toBeNull()
    expect(linksIn(container)).toEqual(['Topic 2', 'Topic 1'])
  })

  it('from Issues, a topic opened from the sidebar draws its page, with the work it lists, before every topic is read', async () => {
    held.push(shipManifest(), issueRoot('i-1'), topic('t-1', 'Topic 1'), joined('t-1'), topic('t-2', 'Topic 2'), joined('t-2'), lists('t-2', 'i-1'))
    const work = ship([], ['i-1'])
    const archives: Archives = { ofIssue: () => undefined, ofProject: () => undefined }
    const { container } = render(<Sidebar state={work} route={{ name: 'issues' }} />)
    await waitFor(() => expect(linksIn(container)).toEqual(['Topic 2', 'Topic 1']))

    // The click: the topic route reads every topic (slow here) and the page mounts.
    let release = () => {}
    everyTopicGate = new Promise((resolve) => (release = resolve))
    void ensureTopics()
    render(<TopicPage d="t-2" state={work} folders={TEAMS} archives={archives} />)
    await waitFor(() => expect(everyTopicReads()).toBe(1))
    await settle()
    expect(screen.getByRole('heading', { name: 'Topic 2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /i-1/ })).toBeTruthy()
    release()
  })

  it('on Issues, Try again after a failed read reads only your topics again, not every topic', async () => {
    down = true
    held.push(shipManifest(), topic('t-1', 'Topic 1'), joined('t-1'), topic('t-2', 'Topic 2'))
    render(<Sidebar state={ship([], [])} route={{ name: 'issues' }} />)
    await waitFor(() => expect(screen.getByText('Didn’t load.')).toBeTruthy())
    const failed = rootReads()

    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 1']))
    expect(rootReads()).toBe(failed + 1)
    expect(everyTopicReads()).toBe(0)
  })
})

describe("Ship's sidebar: your five newest topics", () => {
  it('shows your five newest topics, newest first, then Explore topics; never an archived, muted or other topic', async () => {
    held.push(shipManifest(), mutes(address('t-hush')))
    for (const n of [1, 2, 3, 4, 5, 6]) held.push(topic(`t-${n}`, `Topic ${n}`), joined(`t-${n}`))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'), topic('t-old', 'T archived'), joined('t-old'), archiving('t-old'), topic('t-not', 'T not mine'))
    // Topic 2 has the newest message, after every topic was made.
    held.push(commented('t-2', KATERINA))
    render(<Sidebar state={ship([], [])} />)

    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 2', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 3']))
    expect(screen.getAllByRole('link').at(-1)?.textContent).toBe('Explore topics')
  })

  it('with fewer than five of yours, shows only those, and waits for the mute list so a muted topic never shows', async () => {
    let release = () => {}
    muteGate = new Promise((resolve) => (release = resolve))
    held.push(shipManifest(), mutes(address('t-hush')))
    held.push(topic('t-1', 'Topic 1'), joined('t-1'), topic('t-2', 'Topic 2'), joined('t-2'))
    held.push(topic('t-hush', 'T muted'), joined('t-hush'), topic('t-old', 'T archived'), joined('t-old'), archiving('t-old'), topic('t-not', 'T not mine'))
    render(<Sidebar state={ship([], [])} />)

    // The topics are read; the mute list is not back yet: no topic is drawn.
    await waitFor(() => expect(asked.some((f) => (f.kinds as number[] | undefined)?.includes(30840))).toBe(true))
    await settle()
    expect(sidebarTopics()).toEqual([])

    release()
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 2', 'Topic 1']))
  })

  it("opens a topic's fold when its page is opened later, not only on the first draw", async () => {
    held.push(shipManifest(), projectRoot('p-1'), topic('t-1', 'Topic 1'), joined('t-1'), lists('t-1', 'p-1'))
    const { rerender } = render(<Sidebar state={ship(['p-1'], [])} />)
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 1']))
    expect(screen.queryByRole('link', { name: 'p-1' })).toBeNull()

    rerender(<Sidebar state={ship(['p-1'], [])} route={{ name: 'topic', d: 't-1' }} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'p-1' })).toBeTruthy())
  })

  it('folds a topic to its projects, then its issues, in the order it lists them', async () => {
    held.push(shipManifest(), issueRoot('i-1'), projectRoot('p-1'))
    held.push(topic('t-1', 'Topic 1'), joined('t-1'), lists('t-1', 'i-1'), lists('t-1', 'p-1'))
    render(<Sidebar state={ship(['p-1'], ['i-1'])} />)

    fireEvent.click(await screen.findByRole('button', { name: /Topic 1/ }))
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Projects', 'Issues', 'Topic 1', 'p-1', 'i-1', 'Explore topics'])
  })

  it('keeps its order while you work, and reorders when you come back to the tab a minute later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    held.push(shipManifest())
    held.push(topic('t-1', 'Topic 1'), joined('t-1'), topic('t-2', 'Topic 2'), joined('t-2'))
    render(<Sidebar state={ship([], [])} />)
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 2', 'Topic 1']))

    // QA-2 writes in Topic 1 while you are working: nothing moves.
    held.push({ ...commented('t-1', KATERINA), created_at: NOW() })
    await settle()
    expect(sidebarTopics()).toEqual(['Topic 2', 'Topic 1'])

    // A quick look away and back, 30 seconds: still nothing moves.
    vi.setSystemTime(Date.now() + 30_000)
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await settle()
    expect(sidebarTopics()).toEqual(['Topic 2', 'Topic 1'])

    // You come back to the tab two minutes after the read: Topic 1 is on top.
    vi.setSystemTime(Date.now() + 90_000)
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 1', 'Topic 2']))
  })

  it("says the topics didn't load, and Try again reads them", async () => {
    down = true
    held.push(shipManifest(), topic('t-1', 'Topic 1'), joined('t-1'))
    render(<Sidebar state={ship([], [])} />)
    await waitFor(() => expect(screen.getByText('Didn’t load.')).toBeTruthy())

    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(sidebarTopics()).toEqual(['Topic 1']))
  })
})
