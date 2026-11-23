/**
 * A team's page (D6, Katerina 18 November: "a team's page as Peek's"; RFC 0.4 §4–5, narrowed by RFC 0.5 §10.7).
 *
 * What it claims: the kit's header — the team's name, who is in it, its ⋮ for owners and admins (Rename, Archive…); then its **initiatives** as Explore lists them (never a space, never another team's), its **projects** and
 * **issues** with the facts Ship's own lists show, read from the workspace Ship already holds; and what Ship does not
 * list, counted — a kind nobody here has heard of is "not mine" with no list of kinds in the rule, and a team of only
 * such files never reads as empty. Who is in it, and the rename at the wire, are FolderPage.team.wire.test.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FolderPage } from './FolderPage'

const ME = 'a'.repeat(64)
const ANA = 'b'.repeat(64)

// The rename's and the archive's writes, and the sidebar's listing: what is under test is which team and which name they get.
const renameFolder = vi.fn()
const reloadFolders = vi.fn(async () => {})
vi.mock('@/api', () => ({ renameFolder: (...args: unknown[]) => renameFolder(...args), archiveFolder: vi.fn(), me: 'a'.repeat(64) }))
vi.mock('@/api/useFolders', () => ({ reloadFolders: () => reloadFolders() }))
const say = vi.fn()

/** The team's own read and its roster; the rest of `@/api/foreign` is the real one (`topicAsDrawn`, which the rows use). */
const readFolder = vi.fn()
const readTeamMembers = vi.fn(async (_team: string) => [] as { pubkey: string; since: number }[])
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: (id: string) => readFolder(id),
  readTeamMembers: (id: string) => readTeamMembers(id),
  loadQuery: () => async () => [],
}))

/** The topics read every Ship page shares: what the team's initiatives come from. `failed`, or the read. */
const topicsNow = vi.hoisted(() => ({ value: undefined as unknown }))
const reloadTopics = vi.fn(async () => {})
vi.mock('@/api/topics', () => ({
  useTopics: () => topicsNow.value,
  useMuted: () => ({ muted: new Set(), settled: true }),
  useTopicActivity: () => ({ values: undefined }),
  useTopicMembers: () => ({ values: undefined }),
  reloadTopics: () => reloadTopics(),
}))

const file = (over: Partial<Record<string, unknown>> = {}) => ({
  ref: 'r',
  address: `30850:${ANA}:p`,
  eventId: 'e',
  kind: 30850,
  widget: 'card',
  appName: 'Estiva Ship',
  slots: { title: { value: 'A project' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
  ...over,
})

const folder = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'f1',
  name: 'Onboarding',
  hasState: true,
  // The viewer administers it, so it is offered Rename and Archive… (MAN-17).
  admins: [ME],
  source: 'state',
  files: [file()],
  ...over,
})

/** A topic as the shared read gives it: filed in a team, maybe one of its spaces. */
const topic = (d: string, title: string, team = 'f1', space = false) => ({
  address: `30840:${ANA}:${d}`,
  folder: team,
  createdAt: 1,
  listed: [],
  yours: false,
  ...(space ? { space: true } : {}),
  object: { slots: { title: { value: title } } },
})
const topics = (...list: ReturnType<typeof topic>[]) => ({ me: ME, topics: list })

const work = (kind: string) => [...document.querySelectorAll(`[data-work-kind="${kind}"]`)].map((row) => row as HTMLElement)
const titles = (kind: string) => work(kind).map((row) => within(row).getAllByText(/./)[0]!.textContent)

beforeEach(() => {
  readFolder.mockReset()
  readTeamMembers.mockReset()
  readTeamMembers.mockResolvedValue([])
  renameFolder.mockReset()
  reloadFolders.mockClear()
  reloadTopics.mockClear()
  say.mockReset()
  topicsNow.value = topics()
})

describe('FolderPage', () => {
  it('a team that cannot be read says so', async () => {
    // Rejects on a later tick: an already-rejected promise settles before React runs the effect that awaits it.
    readFolder.mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('nope')), 0)))
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(screen.getByText('This team could not be read.')).toBeInTheDocument())
  })

  it('names the team in the browser tab from its own read, so a rename made elsewhere shows (SFX-2)', async () => {
    readFolder.mockResolvedValue(folder({ name: 'Renamed in Peek' }))
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(document.title).toBe('Renamed in Peek – Ship'))
  })

  it('lists its projects and issues with the facts Ship’s own lists show, and counts another app’s file', async () => {
    const project = `30850:${ANA}:p1`
    const issue = `30851:${ANA}:i1`
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'p', address: project, kind: 30850, slots: { title: { value: 'Onboarding work' } } }),
          file({ ref: 'x', address: `30911:${ANA}:x`, kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }),
          file({ ref: 'i', address: issue, kind: 30851, slots: { title: { value: 'Broken link' } } }),
        ],
      }),
    )
    const state = {
      projects: [{ addr: project, id: 'p1', title: 'Onboarding work', status: 'in_progress', stage: 'started', lead: ANA, author: ANA, createdAt: 100, fields: {} }],
      issues: [
        { addr: issue, id: 'i1', title: 'Broken link', status: 'todo', stage: 'open', projectAddr: project, assignee: ANA, author: ANA, createdAt: 100, fields: {} },
        { addr: `30851:${ANA}:i2`, id: 'i2', title: 'Fixed link', status: 'done', stage: 'done', projectAddr: project, author: ANA, createdAt: 100, fields: {} },
      ],
    }
    const archives = { ofProject: () => undefined, ofIssue: () => undefined }
    const directory = { nameOf: () => 'Ana Duarte', personOf: () => ({ name: 'Ana Duarte' }), profileOf: () => undefined }
    render(<FolderPage id="f1" say={say} state={state as never} archives={archives} directory={directory} />)
    await waitFor(() => expect(titles('project')).toEqual(['Onboarding work']))
    expect(titles('issue')).toEqual(['Broken link'])
    const projectRow = work('project')[0]!
    // A project's status, its lead and its progress, as the Projects list draws them (progress as the kit's small ring).
    expect(within(projectRow).getByText('In Progress')).toBeInTheDocument()
    expect(within(projectRow).getByText('1/2')).toBeInTheDocument()
    expect(projectRow.querySelector('[aria-label="Ana Duarte"]')).not.toBeNull()
    // An issue's status and its assignee, as the Issues list draws them.
    const issueRow = work('issue')[0]!
    expect(within(issueRow).getByText('Todo')).toBeInTheDocument()
    expect(issueRow.querySelector('[aria-label="Ana Duarte"]')).not.toBeNull()
    // When: who changed each last, by first name, and when — Ship's words on an initiative's rows (Katerina, 23 November).
    expect(within(issueRow).getByText(/^Ana, /)).toBeInTheDocument()
    expect(within(projectRow).getByText(/^Ana, /)).toBeInTheDocument()
    // Navigation is by kind (§10.7): a kind nobody here has heard of is counted, and the count says where it is listed.
    expect(screen.queryByText('Spring tides')).not.toBeInTheDocument()
    expect(screen.getByText('1 other file, listed in Peek')).toBeInTheDocument()
  })

  it('before the workspace lands, a project’s and an issue’s facts are the kit’s “not read yet” dash, not empty cells', async () => {
    readFolder.mockResolvedValue(
      folder({
        files: [
          file({ ref: 'p', address: `30850:${ANA}:p1`, kind: 30850, slots: { title: { value: 'Onboarding work' } } }),
          file({ ref: 'i', address: `30851:${ANA}:i1`, kind: 30851, slots: { title: { value: 'Broken link' } } }),
        ],
      }),
    )
    // No `state` yet: the page draws from the team's own read while Ship's workspace is still read.
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(titles('project')).toEqual(['Onboarding work']))
    // A project has a status, a lead, progress and a last change: four dashes. An issue has no progress: three, and an empty cell.
    expect(within(work('project')[0]!).getAllByText('–')).toHaveLength(4)
    expect(within(work('issue')[0]!).getAllByText('–')).toHaveLength(3)
  })

  it('lists the initiatives filed in this team as Explore does: never a space, never another team’s', async () => {
    readFolder.mockResolvedValue(folder({ files: [] }))
    topicsNow.value = topics(topic('t1', 'Onboarding guide'), topic('t2', 'Elsewhere', 'f2'), topic('t3', 'A room', 'f1', true))
    render(<FolderPage id="f1" say={say} />)
    await waitFor(() => expect(titles('topic')).toEqual(['Onboarding guide']))
    expect(screen.getByText('Initiatives')).toBeInTheDocument()
  })

  it('initiatives that cannot be read say so, with Try again', async () => {
    readFolder.mockResolvedValue(folder())
    topicsNow.value = 'failed'
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByText('Its initiatives didn’t load.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadTopics).toHaveBeenCalledTimes(1)
  })

  it('a team holding only other apps’ files says how many, and never reads as empty', async () => {
    // Four topics that are none of its initiatives (Peek's rooms, another's): counted, not listed. A blank list here would be a lie.
    readFolder.mockResolvedValue(folder({ files: [1, 2, 3, 4].map((n) => file({ ref: `t${n}`, address: `30840:${ANA}:t${n}`, kind: 30840, appName: 'Peek', slots: { title: { value: `Topic ${n}` } } })) }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByText('4 other files, listed in Peek')).toBeInTheDocument()
    expect(screen.queryByText('Nothing in this team yet.')).not.toBeInTheDocument()
  })

  it('says so when the list came from channel containment rather than its own list', async () => {
    // The visible symptom of the approximation is a short list; without this line nothing on screen would say why.
    readFolder.mockResolvedValue(folder({ hasState: false, source: 'channel', files: [] }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByText(/has no list of its own yet/)).toBeInTheDocument()
  })

  it('an empty team says so rather than rendering nothing', async () => {
    readFolder.mockResolvedValue(folder({ files: [] }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByText('Nothing in this team yet.')).toBeInTheDocument()
  })

  it('an archived team shows the kit’s archived notice first, with Unarchive for its owners and admins', async () => {
    readFolder.mockResolvedValue(folder({ channel: `39000:${'f'.repeat(64)}:f1`, archived: { by: ANA, at: 1_700_000_000 } }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeInTheDocument()
    // Archived: nothing more to archive from its ⋮.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Archive…' })).not.toBeInTheDocument()
  })
})

describe('FolderPage renames its team from its ⋮ (FOL-8, D6)', () => {
  const rename = async (to: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename team' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Team name' }), { target: { value: to } })
    return dialog
  }

  it('writes the new name, then shows what the relay holds', async () => {
    readFolder.mockResolvedValueOnce(folder()).mockResolvedValueOnce(folder({ name: 'Onboarding 2' }))
    renameFolder.mockResolvedValue({ ok: true })
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    const dialog = await rename('Onboarding 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Onboarding 2' })).toBeInTheDocument())
    // The channel's name is the title's only home (SPEC §3.2, MAN-17): nothing to read before the write.
    expect(renameFolder).toHaveBeenCalledWith({ id: 'f1' }, 'Onboarding 2')
    // Read again after it, for the name, and the sidebar's listing.
    expect(readFolder).toHaveBeenCalledTimes(2)
    expect(reloadFolders).toHaveBeenCalledTimes(1)
  })

  it('an accepted rename that cannot be read back says so rather than showing the old name as though nothing happened', async () => {
    readFolder.mockResolvedValueOnce(folder()).mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('rate-limited')), 0)))
    renameFolder.mockResolvedValue({ ok: true })
    render(<FolderPage id="f1" say={say} />)
    const dialog = await rename('Onboarding 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(say).toHaveBeenCalledWith('Renamed to Onboarding 2, but the team could not be read back — reload to see it.', 'error', 'not-loaded'))
  })

  it('a refusal is said with its reason, the dialog stays open, and nothing is re-read', async () => {
    readFolder.mockResolvedValue(folder())
    renameFolder.mockResolvedValue({ ok: false, reason: 'restricted: not an admin' })
    render(<FolderPage id="f1" say={say} />)
    const dialog = await rename('Nope')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(say).toHaveBeenCalledWith('Rename rejected — restricted: not an admin', 'error', 'not-renamed'))
    expect(screen.getByRole('dialog', { name: 'Rename team' })).toBeInTheDocument()
    expect(reloadFolders).not.toHaveBeenCalled()
  })

  it('an empty name, or the name it has, is nothing to send', async () => {
    readFolder.mockResolvedValue(folder())
    render(<FolderPage id="f1" say={say} />)
    const dialog = await rename('   ')
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Team name' }), { target: { value: 'Onboarding' } })
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled()
    expect(renameFolder).not.toHaveBeenCalled()
  })
})

// SPEC §3.2: the relay refuses a rename, and every reader ignores an archive, from anybody but the team's owners and admins (MAN-17).
describe('FolderPage offers its ⋮ only to the team’s owners and admins', () => {
  const channel = `39000:${'f'.repeat(64)}:f1`

  it('not to a member', async () => {
    readFolder.mockResolvedValue(folder({ channel, admins: [ANA] }))
    render(<FolderPage id="f1" say={say} />)
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('to an admin: Rename and Archive…, Peek’s words (review of 23 November, B4)', async () => {
    readFolder.mockResolvedValue(folder({ channel, admins: [ME] }))
    render(<FolderPage id="f1" say={say} />)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive…' })).toBeInTheDocument()
  })
})
