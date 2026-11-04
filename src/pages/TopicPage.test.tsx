import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderState } from '@/api'

/*
  SHIPS-4: a topic's page in Ship, drawn from the real topics read (interop's
  `readTopics`) and the real read of its Leaf documents, over a fake relay that
  answers filters as the relay does; Ship's fold is handed in, as App hands it.
*/
const held: TestEvent[] = []
let down = false
/** The relay refuses a read of a Leaf document's root. */
let refuseDocuments = false
/** Every filter the page sent to the relay. */
const asked: Record<string, unknown>[] = []
const answer = async (filters: Record<string, unknown>[]) => {
  asked.push(...filters)
  if (down) throw new Error('relay unreachable')
  if (refuseDocuments && filters.some((f) => (f.kinds as number[] | undefined)?.includes(30842))) throw new Error('rate limited')
  return held.filter((e) => filters.some((f) => matches(f, e)))
}
vi.mock('@/api/store', () => ({
  relay: { query: (filters: Record<string, unknown>[]) => answer(filters), queryAll: (filters: Record<string, unknown>[]) => answer(filters) },
  signer: { pubkey: 'c'.repeat(64) },
  projectFieldsNow: async () => undefined,
}))
vi.mock('@/api/nip44', () => ({ nip44: { decrypt: async () => undefined } }))

import { TopicPage } from './TopicPage'
import { prefetchTopics, resetTopicsForTests } from '@/api/topics'
import { archivesOf } from '@/lib/archive'
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

const OWNER = 'a'.repeat(64)
const D = '9c69f247-be6a-4ae7-9703-71cb971f5f93'
let seq = 0
const event = (kind: number, tags: string[][], pubkey = OWNER): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey, created_at: 1_700_000_000 + ++seq, kind, tags, content: '' })
const address = (d: string) => `30840:${OWNER}:${d}`
const topic = (d: string, title: string, { summary }: { summary?: string } = {}) => event(30840, [['d', d], ['title', title], ['h', 'team'], ...(summary ? [['summary', summary]] : [])])
const lists = (d: string, file: string) => event(1851, [['a', address(d)], ['O', d], ['field', `lists:${file}`], ['value', 'true'], ['h', 'team'], ['ts', String(Date.now())], ['o', file]])
/** A team's list marking a topic one of its spaces (§3.3). */
const spaceMark = (d: string) => event(30890, [['d', 'team'], ['a', address(d), '', 'space']])
/** An app's manifest on `host`, declaring `kinds`, as Ship's is built; Peek's draws every file's conversation, so it opens topics. */
const manifest = (app: string, host: string, kinds: string[]) => {
  const unsigned = buildManifest(OWNER, Date.now())
  const tags = unsigned.tags.filter((t) => t[0] !== 'k' && t[0] !== 'd' && t[0] !== 'web')
  const own = JSON.parse(unsigned.content) as { projections: Record<string, unknown>; records: Record<string, unknown> }
  const content =
    app === 'peek'
      ? JSON.stringify({ ...own, name: 'Peek', aspect: 'conversation' })
      : // Leaf draws a document as Ship draws an issue, which is all its title needs here.
        app === 'leaf'
        ? JSON.stringify({ ...own, name: 'Leaf', projections: { 30842: own.projections['30851'] }, records: { 30842: own.records['30851'] } })
        : unsigned.content
  return { ...event(unsigned.kind, [['d', app], ...kinds.map((k) => ['k', k]), ['web', `https://${host}/o/<bech32>`, 'naddr'], ...tags]), content }
}
const leafDocument = (d: string, title: string) => event(30842, [['d', d], ['title', title], ['h', 'team']])
const projectRoot = (d: string) => event(30850, [['d', d], ['title', d], ['h', 'team']])
const issueRoot = (d: string) => event(30851, [['d', d], ['title', d], ['h', 'team']])
const projectAddr = (d: string) => `30850:${OWNER}:${d}`
const issueAddr = (d: string) => `30851:${OWNER}:${d}`

/** Ship's fold: projects and issues with their status; `archived` ones archived by themselves. */
function ship(projects: { d: string; status: string; archived?: boolean }[], issues: { d: string; status: string; project?: string; archived?: boolean }[]) {
  const fields = (archived?: boolean) => (archived ? { archived: { value: 'true', by: OWNER, at: 1 } } : {})
  const state = {
    projects: projects.map(({ d, status, archived }) => ({ addr: projectAddr(d), id: d, title: `Project ${d}`, status, fields: fields(archived) })),
    issues: issues.map(({ d, status, project, archived }) => ({ addr: issueAddr(d), id: d, title: `Issue ${d}`, status, ...(project ? { projectAddr: projectAddr(project) } : {}), fields: fields(archived) })),
    activity: [],
  } as unknown as FolderState
  return { state, archives: archivesOf(state as never) }
}

const page = () => document.querySelector('[data-surface="topic"]') as HTMLElement
const workRows = () => [...page().querySelectorAll('[data-topic-work]')].map((row) => row.textContent)

beforeEach(() => {
  held.length = 0
  asked.length = 0
  down = false
  refuseDocuments = false
  resetTopicsForTests()
  history.replaceState(null, '', `/topic/${D}`)
})

describe("A topic's page in Ship", () => {
  it('draws its title, Folder, summary and Peek link, its projects then its issues with their status, and its Leaf documents opening Leaf', async () => {
    held.push(manifest('ship', 'ship.estiva.app', ['30850', '30851']), manifest('peek', 'peek.estiva.app', ['30840']), manifest('leaf', 'leaf.estiva.app', ['30842']))
    held.push(projectRoot('p1'), issueRoot('i1'), leafDocument('doc1', 'Testing widgets'))
    held.push(topic(D, 'Widgets', { summary: 'Small live cards' }), lists(D, 'i1'), lists(D, 'p1'), lists(D, 'doc1'))
    const { state, archives } = ship(
      [{ d: 'p1', status: 'in_progress' }],
      [{ d: 'i1', status: 'todo', project: 'p1' }, { d: 'i2', status: 'done' }, { d: 'i3', status: 'done', project: 'p1' }, { d: 'i4', status: 'cancelled', project: 'p1' }],
    )
    render(<TopicPage d={D} state={state} folders={[{ id: 'team', name: 'HQ' } as never]} archives={archives} />)

    await waitFor(() => expect(page().querySelector('[data-topic-loaded]')).not.toBeNull())
    expect(screen.getByRole('heading', { name: 'Widgets' })).toBeTruthy()
    expect(within(page()).getByText('HQ')).toBeTruthy()
    expect(within(page()).getByText('Small live cards')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Conversation in Peek/ }).getAttribute('href')).toBe(`https://peek.estiva.app/topic/widgets-${D}`)
    // The project first though the topic listed the issue first; an issue it does not list is not drawn.
    const [project, issue, ...rest] = [...page().querySelectorAll<HTMLElement>('[data-topic-work]')]
    expect(rest).toEqual([])
    expect(within(project).getByRole('link').textContent).toBe('Project p1')
    // Done of all but the cancelled one, so a finished project reads full (Miky, 3 Nov, SHIPS-7).
    expect(within(project).getByText('1 / 2')).toBeTruthy()
    expect(within(issue).getByRole('link').textContent).toBe('Issue i1')
    expect(within(issue).getByText('Project p1')).toBeTruthy()
    expect(within(issue).getByText('Todo')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Project p1' }).getAttribute('href')).toBe('/project/project-p1-p1')
    expect(screen.getByRole('link', { name: 'Issue i1' }).getAttribute('href')).toBe('/issue/issue-i1-i1')
    await waitFor(() => expect(screen.getByRole('link', { name: /Testing widgets/ }).getAttribute('href')).toMatch(/^https:\/\/leaf\.estiva\.app\//))
    // The address bar gets the topic's slug.
    expect(location.pathname).toBe(`/topic/widgets-${D}`)
  })

  it('says "No projects or issues." for a topic listing none, with no Archived link', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic(D, 'Empty'))
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(within(page()).getByText('No projects or issues.')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Archived/ })).toBeNull()
  })

  it('keeps archived work behind "Archived · n", and when all of it is archived says so and shows it', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), issueRoot('live'), issueRoot('gone'))
    held.push(topic(D, 'Mixed'), lists(D, 'live'), lists(D, 'gone'))
    const { state, archives } = ship([], [{ d: 'live', status: 'todo' }, { d: 'gone', status: 'done', archived: true }])
    const { unmount } = render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(workRows()).toEqual(['Issue liveTodo']))
    fireEvent.click(screen.getByRole('button', { name: 'Archived · 1' }))
    expect(workRows()).toEqual(['Issue liveTodo', 'Issue goneDone'])
    unmount()

    const all = ship([], [{ d: 'live', status: 'todo', archived: true }, { d: 'gone', status: 'done', archived: true }])
    render(<TopicPage d={D} state={all.state} folders={[]} archives={all.archives} />)
    await waitFor(() => expect(within(page()).getByText('All of its projects and issues are archived.')).toBeTruthy())
    expect(workRows()).toEqual(['Issue liveTodo', 'Issue goneDone'])
  })

  it('reads the topics once more for a topic the held read lacks, then says it is not available', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic('other', 'Other'))
    await prefetchTopics()
    const before = asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByText("You can't open this topic")).toBeTruthy())
    expect(asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length).toBe(before * 2)
  })

  it('on a cold open, says a topic the reader cannot read is not available after one topics read, not two', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic('other', 'Other'))
    await prefetchTopics()
    const one = asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length
    resetTopicsForTests()
    asked.length = 0
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByText("You can't open this topic")).toBeTruthy())
    expect(asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length).toBe(one)
  })

  it('offers Try again, not "You can’t open this topic", when reading the topics again failed', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic('other', 'Other'))
    await prefetchTopics()
    down = true
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
    expect(screen.queryByText("You can't open this topic")).toBeNull()
    // The topic was started meanwhile, and the relay answers again.
    down = false
    held.push(topic(D, 'New one'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New one' })).toBeTruthy())
  })

  it('says its documents did not load, with Try again, rather than drawing no Documents', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), manifest('leaf', 'leaf.estiva.app', ['30842']), leafDocument('doc1', 'Testing widgets'))
    held.push(topic(D, 'Widgets'), lists(D, 'doc1'))
    await prefetchTopics()
    refuseDocuments = true
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByText('Documents didn’t load.')).toBeTruthy())
    refuseDocuments = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /Testing widgets/ })).toBeTruthy())
  })

  it('opens from a held read with no topics read of its own', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic(D, 'Held'))
    await prefetchTopics()
    asked.length = 0
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Held' })).toBeTruthy())
    expect(asked.some((f) => (f.kinds as number[] | undefined)?.includes(30840))).toBe(false)
  })

  it('sends a space on to Peek rather than drawing it', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', { ...window.location, replace, hostname: 'ship.estiva.app', pathname: `/topic/${D}`, search: '', hash: '' })
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic(D, 'Bugs'), spaceMark(D))
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`https://peek.estiva.app/topic/bugs-${D}`))
    expect(screen.queryByRole('heading', { name: 'Bugs' })).toBeNull()
    vi.unstubAllGlobals()
  })


  it('offers Try again when the topics read failed', async () => {
    down = true
    const { state, archives } = ship([], [])
    render(<TopicPage d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })
})
