/**
 * A summary at the wire (SUM-4, part 2): what the person does on Ship's pages,
 * and the signed event that reaches the relay. Nothing between the click and
 * the relay is mocked — the page, `actInField`, `setIssueField` /
 * `setProjectField`, `createIssue` / `createProject`, the Store, the signer and
 * the relay client all run. The relay is faked at `fetch`: `POST /events` is
 * kept and accepted, `POST /query` answers nothing.
 *
 * Mocked, as `App.test.tsx` does: the workspace read (one issue and one project
 * in a fixed state), the people directory, the Folder listing reads, and the
 * clock check, which would otherwise ask the relay for its time.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'
import { press, rewrite, stubLayout } from '@/test/inlineText'

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

const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const D_PROJECT = '00000000-0000-4000-8000-000000000001'
const D_ISSUE = '00000000-0000-4000-8000-000000000011'
const AUTHOR = 'f'.repeat(64)
const PROJECT_ADDR = `30850:${AUTHOR}:${D_PROJECT}`
const ISSUE_ADDR = `30851:${AUTHOR}:${D_ISSUE}`

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
  readFolders: vi.fn(() => Promise.resolve([{ id: TEAM, name: 'Ship', hasState: true, addresses: [PROJECT_ADDR] }])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { useDirectory, useWorkspace } from '@/api'
import App from '@/App'

const STATE: WorkspaceState = {
  projects: [{ addr: PROJECT_ADDR, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker', contentFolder: TEAM, key: 'BIL', status: 'planned', archived: false, fields: {} }],
  issues: [{ addr: ISSUE_ADDR, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Invoice totals', description: '', descriptionFormat: 'marker', folder: TEAM, projectAddr: PROJECT_ADDR, ref: 'BIL-1', status: 'todo', fields: {} }],
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

beforeEach(() => {
  published.length = 0
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, partial: false, error: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
})

stubLayout()

/** Open the page, wait for its editors, and save a summary typed (pasted, line breaks and all) under the title. */
async function summarize(path: string, text: string) {
  goTo(path)
  render(<App />)
  const main = within(screen.getByRole('main'))
  await main.findByRole('textbox', { name: 'Description' }, { timeout: 5000 })
  const box = main.getByRole('textbox', { name: 'Summary' })
  await rewrite(box, '')
  await userEvent.paste(text)
  await press(box, 'Enter')
}

describe('a summary saved on its page goes on the wire as one kind:1851', () => {
  it('on an issue page: field `summary`, on the issue, in its Folder, one line, untagged by format', async () => {
    await summarize(`/issue/invoice-totals-${D_ISSUE}`, 'Totals are off\nby one cent.')
    await waitFor(() => expect(sent(1851).filter((event) => tag(event, 'field') === 'summary')).toHaveLength(1))
    const [change] = sent(1851).filter((event) => tag(event, 'field') === 'summary')
    expect(tag(change, 'value')).toBe('Totals are off by one cent.')
    expect(tag(change, 'a')).toBe(ISSUE_ADDR)
    expect(tag(change, 'h')).toBe(TEAM)
    expect(tag(change, 'content-format')).toBeUndefined()
    expect(change.sig).toMatch(/^[0-9a-f]{128}$/)
  })

  it('on a project page: field `summary`, on the project, in its Folder', async () => {
    await summarize(`/project/billing-${D_PROJECT}`, 'Take card payments.')
    await waitFor(() => expect(sent(1851).filter((event) => tag(event, 'field') === 'summary')).toHaveLength(1))
    const [change] = sent(1851).filter((event) => tag(event, 'field') === 'summary')
    expect(tag(change, 'value')).toBe('Take card payments.')
    expect(tag(change, 'a')).toBe(PROJECT_ADDR)
    expect(tag(change, 'h')).toBe(TEAM)
    expect(tag(change, 'content-format')).toBeUndefined()
  })
})

describe('a summary typed in a New dialog is the root’s `summary` tag', () => {
  async function newIssue(summary: string) {
    goTo(`/project/billing-${D_PROJECT}`)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add issue' }))
    const dialog = within(screen.getByRole('dialog', { name: /New issue/ }))
    fireEvent.change(dialog.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Rounding' } })
    const box = dialog.queryByRole('textbox', { name: 'Summary' })
    expect(box).not.toBeNull()
    fireEvent.change(box!, { target: { value: summary } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(sent(30851)).toHaveLength(1))
    return sent(30851)[0]
  }

  it('New issue: the tag on the issue’s root, on one line', async () => {
    const root = await newIssue('Totals are off\nby one cent.')
    expect(root.tags.filter((t) => t[0] === 'summary')).toEqual([['summary', 'Totals are off by one cent.']])
  })

  it('New issue with the summary left blank: no tag at all', async () => {
    const root = await newIssue('   ')
    expect(root.tags.filter((t) => t[0] === 'summary')).toEqual([])
  })

  it('New project: the tag on the project’s root', async () => {
    goTo('/projects')
    render(<App />)
    await screen.findByText('Ship')
    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New project' }))
    fireEvent.change(dialog.getByPlaceholderText('New project title'), { target: { value: 'Payments' } })
    const box = dialog.queryByRole('textbox', { name: 'Summary' })
    expect(box).not.toBeNull()
    fireEvent.change(box!, { target: { value: 'Take card payments.' } })
    await userEvent.click(dialog.getByRole('combobox', { name: 'Folder' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Ship' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(sent(30850)).toHaveLength(1))
    expect(sent(30850)[0].tags.filter((t) => t[0] === 'summary')).toEqual([['summary', 'Take card payments.']])
  })
})
