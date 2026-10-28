/**
 * An issue's Activity tab marks it read only once its conversations are on
 * screen — APP-5. While they are on the way nothing is drawn, so a mark would
 * be the clock's, and Peek's unread dot would clear for comments nobody saw.
 *
 * `markRead` is spied at the read-state boundary: what it publishes, and when,
 * is `readStateSync.test.ts`'s. Mocked, as `summary.wire.test.tsx` does: the
 * workspace read, the people directory, the Folder listing reads and the clock check.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'

globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch

const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const ELSEWHERE = '4167adea-877f-43c4-96fb-517a2b2d5d24'
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
vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: vi.fn(() => new Promise(() => {})),
  readFolders: vi.fn(() => Promise.resolve([{ id: TEAM, name: 'Ship', hasState: true, addresses: [PROJECT_ADDR] }])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { fileContext, markRead, READ_DWELL_MS, useDirectory, useWorkspace } from '@/api'
import App from '@/App'

const COMMENT_AT = Math.floor(Date.now() / 1000) - 600
const comment = { id: 'c'.repeat(64), author: AUTHOR, createdAt: COMMENT_AT, body: 'Totals are off', folder: TEAM, about: [ISSUE_ADDR] }

/** The issue, with its own Folder's conversation held; its mentions held only when `mentions` is. */
const state = (mentions: boolean) =>
  ({
    projects: [{ addr: PROJECT_ADDR, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker', contentFolder: TEAM, key: 'BIL', status: 'planned', archived: false, fields: {} }],
    issues: [{ addr: ISSUE_ADDR, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Invoice totals', description: '', descriptionFormat: 'marker', folder: TEAM, projectAddr: PROJECT_ADDR, ref: 'BIL-1', status: 'todo', fields: {} }],
    activity: [],
    conversations: [{ id: comment.id, root: comment, replies: [], about: [ISSUE_ADDR], createdAt: COMMENT_AT, lastAt: COMMENT_AT }],
    // A comment on the issue, not a mention of it: its root anchors it there.
    anchors: { [comment.id]: [ISSUE_ADDR] }, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {},
    folders: [TEAM, ELSEWHERE],
    events: [],
    threadsAt: { [TEAM]: 1 },
    mentionsOf: mentions ? [ISSUE_ADDR] : [],
  }) as unknown as WorkspaceState

const workspace = (mentions: boolean) => ({ state: state(mentions), partial: false, error: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })
const markedIssue = () => vi.mocked(markRead).mock.calls.filter(([contexts]) => contexts.includes(fileContext(ISSUE_ADDR)))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(markRead).mockReset()
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
  history.replaceState(null, '', `/issue/invoice-totals-${D_ISSUE}?tab=activity`)
})
afterEach(() => vi.useRealTimers())

describe('the Activity tab marks the issue read (APP-5)', () => {
  it('not while its mentions are on the way, then at its newest drawn comment once they land', async () => {
    vi.mocked(useWorkspace).mockReturnValue(workspace(false))
    const { rerender } = render(<App />)
    // Its own conversation is drawn: only the mentions are on the way.
    await screen.findByText('Totals are off')
    await act(async () => vi.advanceTimersByTimeAsync(READ_DWELL_MS * 3))
    expect(markedIssue()).toEqual([])

    vi.mocked(useWorkspace).mockReturnValue(workspace(true))
    rerender(<App />)
    await act(async () => vi.advanceTimersByTimeAsync(READ_DWELL_MS * 3))
    expect(markedIssue().map(([, at]) => at)).toEqual([COMMENT_AT * 1000])
  })
})
