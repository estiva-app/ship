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

/** Names by the key's first 8 characters, as the directory draws a key with no profile. */
const nameOf = (pubkey: string | undefined) => (pubkey === OWNER ? 'Ana Duarte' : (pubkey ?? '').slice(0, 8))
const DIRECTORY = { directory: new Map(), nameOf, personOf: (pubkey: string) => ({ name: nameOf(pubkey) }), profileOf: () => undefined } as never
const WORKSPACE = { conversations: [], activity: [], anchors: {}, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {} }
/** The page as App draws it: Ship's fold as the workspace hands it, with no conversations unless a test gives some. */
function Page(props: { d: string; state: FolderState; folders: never[] | { id: string; name: string }[]; archives: ReturnType<typeof archivesOf> }) {
  const state = { ...WORKSPACE, ...props.state } as never
  return <TopicPage d={props.d} state={state} folders={props.folders as never} archives={props.archives} directory={DIRECTORY} say={() => {}} refresh={async () => {}} />
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
  it('draws its title, team and summary, its projects as the Projects page does, its issues with their status, its Leaf documents opening Leaf, and Open in Peek in its ⋯ (TOPI-8)', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    held.push(manifest('ship', 'ship.estiva.app', ['30850', '30851']), manifest('peek', 'peek.estiva.app', ['30840']), manifest('leaf', 'leaf.estiva.app', ['30842']))
    held.push(projectRoot('p1'), issueRoot('i1'), leafDocument('doc1', 'Testing widgets'))
    held.push(topic(D, 'Widgets', { summary: 'Small live cards' }), lists(D, 'i1'), lists(D, 'p1'), lists(D, 'doc1'))
    const { state, archives } = ship(
      [{ d: 'p1', status: 'in_progress' }],
      [{ d: 'i1', status: 'todo', project: 'p1' }, { d: 'i2', status: 'done' }, { d: 'i3', status: 'done', project: 'p1' }, { d: 'i4', status: 'cancelled', project: 'p1' }],
    )
    render(<Page d={D} state={state} folders={[{ id: 'team', name: 'HQ' } as never]} archives={archives} />)

    await waitFor(() => expect(page().querySelector('[data-topic-loaded]')).not.toBeNull())
    expect(screen.getByRole('heading', { name: 'Widgets' })).toBeTruthy()
    expect(within(page()).getByText('HQ')).toBeTruthy()
    expect(within(page()).getByText('Small live cards')).toBeTruthy()
    // No "Conversation in Peek" link: the ⋯ opens the topic in Peek, and the conversation is in the column beside the page.
    expect(screen.queryByRole('link', { name: /Conversation in Peek/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open in Peek' }))
    expect(opened).toHaveBeenCalledWith(`https://peek.estiva.app/topic/widgets-${D}`, '_blank', 'noopener')
    expect(screen.queryByRole('menuitem', { name: /Archive|Delete|Move/ })).toBeNull()
    opened.mockRestore()
    // The project first though the topic listed the issue first, drawn as the Projects page draws it, under All.
    const [project, ...more] = [...page().querySelectorAll<HTMLElement>('[data-project]')]
    expect(more).toEqual([])
    expect(within(project!).getByRole('link').textContent).toBe('Project p1')
    expect(screen.getByRole('tab', { name: /All/ }).getAttribute('aria-selected')).toBe('true')
    // Done of all but the cancelled one, so a finished project reads full (Miky, 3 Nov, SHIPS-7).
    expect(within(project!).getByText('1 / 2')).toBeTruthy()
    // An issue it does not list is not drawn.
    const [issue, ...rest] = [...page().querySelectorAll<HTMLElement>('[data-topic-work]')]
    expect(rest).toEqual([])
    expect(within(issue!).getByRole('link').textContent).toBe('Issue i1')
    expect(within(issue!).getByText('Project p1')).toBeTruthy()
    expect(within(issue!).getByText('Todo')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Project p1' }).getAttribute('href')).toBe('/project/project-p1-p1')
    expect(screen.getByRole('link', { name: 'Issue i1' }).getAttribute('href')).toBe('/issue/issue-i1-i1')
    await waitFor(() => expect(screen.getByRole('link', { name: /Testing widgets/ }).getAttribute('href')).toMatch(/^https:\/\/leaf\.estiva\.app\//))
    // The address bar gets the topic's slug.
    expect(location.pathname).toBe(`/topic/widgets-${D}`)
  })

  it('keeps the topic’s one order within each kind: the projects as placed, then the issues as placed (TOPI-5)', async () => {
    held.push(manifest('ship', 'ship.estiva.app', ['30850', '30851']), manifest('peek', 'peek.estiva.app', ['30840']))
    held.push(projectRoot('p1'), projectRoot('p2'), issueRoot('i1'), issueRoot('i2'))
    held.push(topic(D, 'Widgets'), lists(D, 'p1'), lists(D, 'i1'), lists(D, 'p2'), lists(D, 'i2'))
    // Somebody dragged the second issue to the top, then the second project above the first.
    const place = (file: string, key: string) => event(1851, [['a', address(D)], ['O', D], ['field', `order:${file}`], ['value', key], ['h', 'team'], ['ts', String(Date.now())], ['o', file]])
    held.push(place('i2', 'a'), place('p2', 'b'), place('p1', 'c'), place('i1', 'd'))
    const { state, archives } = ship([{ d: 'p1', status: 'todo' }, { d: 'p2', status: 'todo' }], [{ d: 'i1', status: 'todo' }, { d: 'i2', status: 'todo' }])
    render(<Page d={D} state={state} folders={[{ id: 'team', name: 'HQ' } as never]} archives={archives} />)

    await waitFor(() => expect(page().querySelector('[data-topic-loaded]')).not.toBeNull())
    const titles = [...page().querySelectorAll<HTMLElement>('[data-project], [data-topic-work]')].map((row) => within(row).getAllByRole('link')[0]!.textContent)
    expect(titles).toEqual(['Project p2', 'Project p1', 'Issue i2', 'Issue i1'])
  })

  it('says "No projects, issues or documents yet." for a topic listing none, with no Archived link', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic(D, 'Empty'))
    const { state, archives } = ship([], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(within(page()).getByText('No projects, issues or documents yet.')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Archived/ })).toBeNull()
  })

  it('draws its projects under the Projects page’s tabs: Active holds only the one in progress, in the topic’s order (TOPI-8)', async () => {
    held.push(manifest('ship', 'ship.estiva.app', ['30850', '30851']), manifest('peek', 'peek.estiva.app', ['30840']))
    held.push(projectRoot('p1'), projectRoot('p2'), projectRoot('p3'))
    held.push(topic(D, 'Widgets'), lists(D, 'p3'), lists(D, 'p1'), lists(D, 'p2'))
    const { state, archives } = ship([{ d: 'p1', status: 'in_progress' }, { d: 'p2', status: 'planned' }, { d: 'p3', status: 'completed' }], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(page().querySelectorAll('[data-project]').length).toBe(3))
    const names = () => [...page().querySelectorAll<HTMLElement>('[data-project]')].map((row) => within(row).getByRole('link').textContent)
    expect(names()).toEqual(['Project p3', 'Project p1', 'Project p2'])
    fireEvent.click(screen.getByRole('tab', { name: /Active/ }))
    expect(names()).toEqual(['Project p1'])
    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }))
    expect(names()).toEqual(['Project p3'])
  })

  it('says who edited an issue and a document last, and folds a document open to its pages (TOPI-8)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date((1_700_000_000 + 3 * 3600) * 1000))
    const KATERINA = 'b'.repeat(64)
    // Leaf's documents list the pages under them, as a project lists its issues.
    const leaf = manifest('leaf', 'leaf.estiva.app', ['30842'])
    const own = JSON.parse(leaf.content) as { projections: Record<string, { slots: Record<string, unknown> }> }
    const projection = own.projections['30842']!
    leaf.content = JSON.stringify({ ...own, projections: { 30842: { ...projection, slots: { ...projection.slots, list: { children: { kind: 30842, via: 'a', limit: 200, movedBy: 'parent', anyParent: true } } } } } })
    held.push(manifest('ship', 'ship.estiva.app', ['30850', '30851']), manifest('peek', 'peek.estiva.app', ['30840']), leaf)
    // Katerina made the document an hour in, and nothing changed it since (interop's child-fold test covers a later
    // change by someone else: `changedBy` is its author). The page under it is the owner's.
    const SPEC = `30842:${KATERINA}:spec`
    held.push({ ...event(30842, [['d', 'spec'], ['title', 'Widgets spec'], ['h', 'team']], KATERINA), created_at: 1_700_000_000 + 3600 })
    held.push(event(30842, [['d', 'row'], ['title', 'Row widget'], ['h', 'team'], ['a', SPEC]]))
    held.push(issueRoot('i1'), topic(D, 'Widgets'), lists(D, 'i1'), lists(D, 'spec'))
    const { state, archives } = ship([], [{ d: 'i1', status: 'todo' }])
    const issue = (state as unknown as { issues: Record<string, unknown>[] }).issues[0]!
    Object.assign(issue, { author: OWNER, createdAt: 1_700_000_000, fields: { status: { value: 'todo', by: KATERINA, at: 1_700_000_000 + 2 * 3600 } } })
    render(<Page d={D} state={state} folders={[]} archives={archives} />)

    await waitFor(() => expect(page().querySelector('[data-topic-work]')).not.toBeNull())
    expect(within(page().querySelector<HTMLElement>('[data-topic-work]')!).getByText('bbbbbbbb, 1h ago')).toBeTruthy()
    const row = await waitFor(() => {
      const found = page().querySelector<HTMLElement>(`[data-topic-document="${SPEC}"]`)
      expect(found).not.toBeNull()
      return found!
    })
    expect(within(row).getByText('bbbbbbbb, 2h ago')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Row widget' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Show the pages in Widgets spec' }))
    expect(screen.getByRole('link', { name: 'Row widget' })).toBeTruthy()
    vi.useRealTimers()
  })

  it('keeps archived work behind "Archived · n", and when all of it is archived says so and shows it', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), issueRoot('live'), issueRoot('gone'))
    held.push(topic(D, 'Mixed'), lists(D, 'live'), lists(D, 'gone'))
    const { state, archives } = ship([], [{ d: 'live', status: 'todo' }, { d: 'gone', status: 'done', archived: true }])
    const { unmount } = render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(workRows()).toEqual(['Issue liveTodo']))
    fireEvent.click(screen.getByRole('button', { name: 'Archived · 1' }))
    expect(workRows()).toEqual(['Issue liveTodo', 'Issue goneDone'])
    unmount()

    const all = ship([], [{ d: 'live', status: 'todo', archived: true }, { d: 'gone', status: 'done', archived: true }])
    render(<Page d={D} state={all.state} folders={[]} archives={all.archives} />)
    await waitFor(() => expect(within(page()).getByText('All of its projects and issues are archived.')).toBeTruthy())
    expect(workRows()).toEqual(['Issue liveTodo', 'Issue goneDone'])
  })

  it('reads the topics once more for a topic the held read lacks, then says it is not available', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic('other', 'Other'))
    await prefetchTopics()
    const before = asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length
    const { state, archives } = ship([], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
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
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByText("You can't open this topic")).toBeTruthy())
    expect(asked.filter((f) => (f.kinds as number[] | undefined)?.includes(30840)).length).toBe(one)
  })

  it('offers Try again, not "You can’t open this topic", when reading the topics again failed', async () => {
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic('other', 'Other'))
    await prefetchTopics()
    down = true
    const { state, archives } = ship([], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
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
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
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
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Held' })).toBeTruthy())
    expect(asked.some((f) => (f.kinds as number[] | undefined)?.includes(30840))).toBe(false)
  })

  it('sends a space on to Peek rather than drawing it', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', { ...window.location, replace, hostname: 'ship.estiva.app', pathname: `/topic/${D}`, search: '', hash: '' })
    held.push(manifest('peek', 'peek.estiva.app', ['30840']), topic(D, 'Bugs'), spaceMark(D))
    const { state, archives } = ship([], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`https://peek.estiva.app/topic/bugs-${D}`))
    expect(screen.queryByRole('heading', { name: 'Bugs' })).toBeNull()
    vi.unstubAllGlobals()
  })


  it('offers Try again when the topics read failed', async () => {
    down = true
    const { state, archives } = ship([], [])
    render(<Page d={D} state={state} folders={[]} archives={archives} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })
})
