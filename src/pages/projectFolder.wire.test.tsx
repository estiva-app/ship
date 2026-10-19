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
    { id: TEAM, name: 'Team', hasState: true, addresses: [PROJECT_ADDR] },
    { id: OWN, name: 'Own', hasState: true, addresses: [] },
  ])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { useDirectory, useWorkspace } from '@/api'
import App from '@/App'

const project = (id: string, title: string, contentFolder: string, key: string) =>
  ({ addr: `30850:${AUTHOR}:${id}`, id, author: AUTHOR, createdAt: 1, title, description: '', descriptionFormat: 'marker', contentFolder, key, status: 'planned', archived: false, fields: {} })

const STATE: WorkspaceState = {
  // "Loose" is a record that names no Folder, and no Folder lists it.
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

describe('a project that names no Folder, and that no Folder lists, writes nothing', () => {
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
    await refusedNotSent(1111)
  })
})
