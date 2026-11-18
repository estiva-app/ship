/**
 * An issue's page where issues are read by their fields (ISS-4): the load
 * holds each field's current change and no text, so its History is folded and
 * read when opened, as a project's, and its text cannot be edited until its
 * current one is read — a save from the first record's would overwrite it.
 * The relay is spied at its query; the workspace read is mocked, as
 * `IssuePage.markRead.test.tsx` does.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'

globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch

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
  markRead: vi.fn(),
}))
vi.mock('@/auth/estivaId', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/auth/estivaId')>()), signedIn: () => true }))
vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: vi.fn(() => new Promise(() => {})),
  readFolders: vi.fn(() => Promise.resolve([{ id: TEAM, name: 'Ship', hasState: true, addresses: [PROJECT_ADDR] }])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { useDirectory, useWorkspace } from '@/api'
import { relay } from '@/api/store'
import App from '@/App'

const queryAll = vi.spyOn(relay, 'queryAll').mockResolvedValue([])
/** The History read: every change to the issue, and nothing narrower (the members read asks by `#a` too, with its own fields). */
const askedForHistory = () => queryAll.mock.calls.some(([filters]) => JSON.stringify(filters) === JSON.stringify([{ kinds: [1851], '#a': [ISSUE_ADDR] }]))

/** The issue as a load holds it: `issueTexts` set where issues are read by their fields, holding its text or not. */
const state = (issueTexts: string[] | undefined) =>
  ({
    projects: [{ addr: PROJECT_ADDR, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker', contentFolder: TEAM, key: 'BIL', status: 'planned', archived: false, fields: {} }],
    issues: [{ addr: ISSUE_ADDR, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Invoice totals', description: 'The totals are off by a cent', descriptionFormat: 'marker', folder: TEAM, projectAddr: PROJECT_ADDR, ref: 'BIL-1', status: 'todo', fields: {} }],
    activity: [{ id: 'a'.repeat(64), target: ISSUE_ADDR, field: 'status', value: 'todo', author: AUTHOR, createdAt: 2, folder: TEAM, note: '' }],
    conversations: [],
    anchors: {}, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {},
    folders: [TEAM],
    events: [],
    threadsAt: { [TEAM]: 1 },
    mentionsOf: [ISSUE_ADDR],
    ...(issueTexts ? { texts: [], issueTexts } : {}),
  }) as unknown as WorkspaceState

const workspace = (issueTexts: string[] | undefined) => ({ state: state(issueTexts), partial: false, error: null, clock: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })

const historyToggle = () => screen.getByRole('button', { name: /History/ })
/** The editor holding the description's words, once it is up: whether it takes typing ("true") or not ("false"). */
const textEditable = () => [...document.querySelectorAll('[contenteditable]')].find((el) => el.textContent?.includes('The totals are off by a cent'))?.getAttribute('contenteditable')
/** The Overview, where History is, beside the page. */
const showOverview = async () => fireEvent.click(await screen.findByRole('button', { name: 'Show side panel' }))

beforeEach(() => {
  queryAll.mockClear()
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined } as never)
  history.replaceState(null, '', `/issue/invoice-totals-${D_ISSUE}`)
})

describe('an issue read by its fields (ISS-4)', () => {
  it('keeps History folded and reads none of its changes until it is opened, then reads every one', async () => {
    vi.mocked(useWorkspace).mockReturnValue(workspace([ISSUE_ADDR]))
    render(<App />)
    await screen.findByText('The totals are off by a cent')
    await showOverview()
    expect(historyToggle().getAttribute('aria-expanded')).toBe('false')
    expect(askedForHistory()).toBe(false)

    fireEvent.click(historyToggle())
    await waitFor(() => expect(queryAll).toHaveBeenCalledWith([{ kinds: [1851], '#a': [ISSUE_ADDR] }]))
  })

  it('cannot be edited until its current text is read, and can once it is', async () => {
    vi.mocked(useWorkspace).mockReturnValue(workspace([]))
    const { unmount } = render(<App />)
    await waitFor(() => expect(textEditable()).toBeDefined())
    expect(textEditable()).toBe('false')
    unmount()

    vi.mocked(useWorkspace).mockReturnValue(workspace([ISSUE_ADDR]))
    render(<App />)
    await waitFor(() => expect(textEditable()).toBe('true'))
  })

  it('where every change is read, shows History open and reads nothing more for it', async () => {
    vi.mocked(useWorkspace).mockReturnValue(workspace(undefined))
    render(<App />)
    await screen.findByText('The totals are off by a cent')
    await showOverview()
    expect(screen.queryByRole('button', { name: /History/, expanded: false })).toBeNull()
    expect(askedForHistory()).toBe(false)
  })
})
