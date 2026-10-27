/**
 * Where a project's new issues and new comments go, at the wire (LTX-4): the
 * project's own Folder, never the other Folder whose listing it is drawn
 * under, so they keep the project's readers once a Folder can be private
 * (record what-belongs-to-a-file-is-stored-with-it). Nothing between the
 * click and the relay is mocked — the page, `createIssue` / `startConversation`,
 * `workFolder`, the Store, the signer and the relay client all run. The relay
 * is faked at `fetch`: `POST /events` is kept and accepted, `POST /query`
 * answers nothing.
 *
 * Mocked, as `summary.wire.test.tsx` does: the workspace read, the people
 * directory, the Folder listing reads, and the clock check.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'
import { stubLayout } from '@/test/inlineText'

type Signed = { id: string; kind: number; pubkey: string; sig: string; tags: string[][]; content: string }

const { published } = vi.hoisted(() => {
  const published: Signed[] = []
  // Before any module loads: the relay client looks `fetch` up when it sends, and this is the wire.
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      published.push(event)
      return new Response(JSON.stringify({ accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { published }
})

/** The project's own Folder, its record's `h`. */
const OWN = '11111111-1111-4111-8111-111111111111'
/** Another Folder, whose listing the project is drawn under (moved there). */
const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const D_PROJECT = '00000000-0000-4000-8000-000000000001'
const D_LOOSE = '00000000-0000-4000-8000-000000000002'
const AUTHOR = 'f'.repeat(64)
const PROJECT_ADDR = `30850:${AUTHOR}:${D_PROJECT}`
const LOOSE_ADDR = `30850:${AUTHOR}:${D_LOOSE}`

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  useWorkspace: vi.fn(),
  useDirectory: vi.fn(),
  resolveInbound: vi.fn(),
}))
vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: vi.fn(() => new Promise(() => {})),
  readFolders: vi.fn(() => Promise.resolve([
    { id: TEAM, name: 'Team', hasState: true, addresses: [PROJECT_ADDR, LOOSE_ADDR] },
    { id: OWN, name: 'Own', hasState: true, addresses: [] },
  ])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { useDirectory, useWorkspace } from '@/api'
import { readFolders } from '@/api/foreign'
import { reloadFolders } from '@/api/useFolders'
import App from '@/App'

const project = (id: string, title: string, contentFolder: string, key: string) =>
  ({ addr: `30850:${AUTHOR}:${id}`, id, author: AUTHOR, createdAt: 1, title, description: '', descriptionFormat: 'marker', contentFolder, key, status: 'planned', archived: false, fields: {} })

const STATE: WorkspaceState = {
  // "Loose" is a record that names no Folder; the team Folder lists it.
  projects: [project(D_PROJECT, 'Billing', OWN, 'BIL'), project(D_LOOSE, 'Loose', '', 'LOO')],
  issues: [],
  activity: [],
  conversations: [],
  anchors: {},
  edits: {},
  attachments: {},
  urgent: {},
  parts: {},
  embeds: {},
  folders: [],
  events: [],
} as unknown as WorkspaceState

const goTo = (path: string) => {
  history.replaceState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}
const tag = (event: Signed, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const sent = (kind: number) => published.filter((event) => event.kind === kind)

/** The workspace re-read the page asks for after a write, by the Folders it names. */
const refresh = vi.fn()

beforeEach(() => {
  published.length = 0
  refresh.mockReset().mockResolvedValue(undefined)
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, loading: false, busy: false, refresh, live: false })
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
})

stubLayout()

async function addIssue(path: string) {
  goTo(path)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add issue' }))
  const dialog = within(screen.getByRole('dialog', { name: /New issue/ }))
  fireEvent.change(dialog.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Rounding' } })
  fireEvent.click(dialog.getByRole('button', { name: 'Create issue' }))
}

async function comment(path: string, text: string) {
  goTo(path)
  render(<App />)
  const main = within(screen.getByRole('main'))
  const box = (await main.findByRole('textbox', { name: 'Start a conversation…' }, { timeout: 5000 })) as HTMLElement & { editor: { commands: { insertContent: (s: string) => void } } }
  act(() => box.editor.commands.insertContent(text))
  fireEvent.click(main.getByRole('button', { name: 'Send' }))
}

describe('an archived project offers no new issue until it is unarchived (PEEKM-2, Decided 2026-10-23)', () => {
  it('has no Add issue, where the same project unarchived has one', async () => {
    const archived = { ...STATE.projects[0], fields: { archived: { value: 'true', by: AUTHOR, at: 2, format: 'marker' } } } as WorkspaceState['projects'][number]
    vi.mocked(useWorkspace).mockReturnValue({ state: { ...STATE, projects: [archived, STATE.projects[1]] }, error: null, loading: false, busy: false, refresh, live: false })
    goTo(`/project/billing-${D_PROJECT}`)
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: 'Unarchive project' })
    expect(screen.queryByRole('button', { name: 'Add issue' })).toBeNull()
    unmount()
    vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, loading: false, busy: false, refresh, live: false })
    goTo(`/project/billing-${D_PROJECT}`)
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Add issue' })).toBeInTheDocument()
  })

  it('has no Add issue either when it is archived only with its team, every Folder listing it being archived', async () => {
    const teams = [
      { id: TEAM, name: 'Team', hasState: true, addresses: [PROJECT_ADDR, LOOSE_ADDR], archived: { by: AUTHOR, at: 3 } },
      { id: OWN, name: 'Own', hasState: true, addresses: [] },
    ]
    vi.mocked(readFolders).mockResolvedValue(teams as Awaited<ReturnType<typeof readFolders>>)
    try {
      await reloadFolders()
      goTo(`/project/billing-${D_PROJECT}`)
      render(<App />)
      await screen.findByText(/Archived with its Folder/)
      expect(screen.queryByRole('button', { name: 'Add issue' })).toBeNull()
    } finally {
      vi.mocked(readFolders).mockResolvedValue([
        { id: TEAM, name: 'Team', hasState: true, addresses: [PROJECT_ADDR, LOOSE_ADDR] },
        { id: OWN, name: 'Own', hasState: true, addresses: [] },
      ] as Awaited<ReturnType<typeof readFolders>>)
      await reloadFolders()
    }
  })

  it('an issue cannot be moved into it: the Project picker leaves it out, and keeps the live ones', async () => {
    const D_ISSUE = 'c1d2e3f4-0000-4000-8000-000000000001'
    const loose = { ...STATE.projects[1], fields: { archived: { value: 'true', by: AUTHOR, at: 2, format: 'marker' } } } as WorkspaceState['projects'][number]
    const issue = { addr: `30851:${AUTHOR}:${D_ISSUE}`, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Rounding', description: '', descriptionFormat: 'marker', folder: OWN, projectAddr: STATE.projects[0].addr, ref: 'BIL-1', status: 'todo', fields: {} }
    vi.mocked(useWorkspace).mockReturnValue({ state: { ...STATE, projects: [STATE.projects[0], loose], issues: [issue] } as unknown as WorkspaceState, error: null, loading: false, busy: false, refresh, live: false })
    goTo(`/issue/rounding-${D_ISSUE}`)
    render(<App />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Project' }))
    expect(await screen.findByRole('option', { name: 'Billing' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Loose' })).toBeNull()
  })
})

describe("a moved project's new work goes into its own Folder, not the one that lists it", () => {
  it('New issue on its page: the kind:30851 carries h = the project’s own Folder, and that Folder is re-read so it shows', async () => {
    await addIssue(`/project/billing-${D_PROJECT}`)
    await waitFor(() => expect(sent(30851)).toHaveLength(1))
    expect(tag(sent(30851)[0], 'h')).toBe(OWN)
    await waitFor(() => expect(refresh).toHaveBeenCalledWith([OWN]))
    expect(refresh).not.toHaveBeenCalledWith([TEAM])
  })

  it('A comment started on its page: the kind:1111 about it carries h = the project’s own Folder, and that Folder is re-read', async () => {
    await comment(`/project/billing-${D_PROJECT}?tab=activity`, 'hello')
    await waitFor(() => expect(sent(1111)).toHaveLength(1))
    expect(tag(sent(1111)[0], 'h')).toBe(OWN)
    expect(tag(sent(1111)[0], 'A')).toBe(PROJECT_ADDR)
    await waitFor(() => expect(refresh).toHaveBeenCalledWith([OWN]))
    expect(refresh).not.toHaveBeenCalledWith([TEAM])
  })
})

describe('a project that names no Folder of its own writes nothing, not even into the Folder that lists it', () => {
  /** Whichever comes first, any refusal said or an event sent; then only this refusal may be there. */
  async function refusedNotSent(kind: number) {
    await waitFor(() => expect(sent(kind).length + screen.queryAllByText(/rejected/).length).toBeGreaterThan(0))
    expect(sent(kind)).toHaveLength(0)
    expect(screen.getByText(/names no Folder/)).toBeInTheDocument()
  }

  it('New issue is refused with the reason, and nothing reaches the relay', async () => {
    await addIssue(`/project/loose-${D_LOOSE}`)
    await refusedNotSent(30851)
  })

  it('A comment is refused with the reason, and nothing reaches the relay', async () => {
    await comment(`/project/loose-${D_LOOSE}?tab=activity`, 'hello')
    // Said under the box with the words still in it, not in a toast (COMM-7, Decided 2026-10-17).
    expect(await screen.findByText(/^Not sent: .*names no Folder/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Start a conversation…' }).textContent).toBe('hello')
    expect(sent(1111)).toHaveLength(0)
  })
})
