/**
 * `@` in a Ship message box offers the workspace's members, read from the
 * relay's `kind:13534` roster (CON-25, PEEKM-6) — not only the people who have
 * already touched the issues on the page. A teammate who has never written in
 * this workspace must still be someone you can mention.
 *
 * The relay is answered at `fetch`, as `ConversationBox.wire.test.tsx` does, so
 * the roster goes through the real read (`useRoster`) and the real list.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'
import { stubLayout } from '@/test/inlineText'

const { AUTHOR, NEWCOMER } = vi.hoisted(() => {
  const AUTHOR = 'f'.repeat(64)
  const NEWCOMER = 'a'.repeat(64)
  const roster = { id: '1'.repeat(64), kind: 13534, pubkey: 'd'.repeat(64), created_at: 1, sig: '2'.repeat(128), content: '', tags: [['member', AUTHOR], ['member', NEWCOMER]] }
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/query')) {
      const filters = JSON.parse(String(init.body)) as { kinds?: number[] }[]
      const asksRoster = filters.some((filter) => filter.kinds?.includes(13534))
      return new Response(JSON.stringify(asksRoster ? [roster] : []), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { AUTHOR, NEWCOMER }
})

const FOLDER = '11111111-1111-4111-8111-111111111111'
const D_PROJECT = '00000000-0000-4000-8000-000000000001'
const NAMES: Record<string, string> = { [AUTHOR]: 'Fiona', [NEWCOMER]: 'Nadia' }

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
  readFolders: vi.fn(() => Promise.resolve([{ id: FOLDER, name: 'Own', hasState: true, addresses: [] }])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
}))

import { useDirectory, useWorkspace } from '@/api'
import App from '@/App'

// The snapshot holds one project by Fiona and nothing by Nadia: only the roster knows her.
const STATE = {
  projects: [{ addr: `30850:${AUTHOR}:${D_PROJECT}`, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker', contentFolder: FOLDER, key: 'BIL', status: 'planned', archived: false, fields: {} }],
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

beforeEach(() => {
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, partial: false, error: null, clock: null, loading: false, busy: false, refresh: vi.fn(async () => {}), wantThreads: () => {}, live: false })
  vi.mocked(useDirectory).mockReturnValue({
    directory: new Map(),
    nameOf: (k: string) => NAMES[k] ?? k.slice(0, 8),
    personOf: (k: string) => ({ name: NAMES[k] ?? k.slice(0, 8) }),
    profileOf: (k: string) => (NAMES[k] ? { pubkey: k, name: NAMES[k], createdAt: 1 } : undefined),
  })
})

stubLayout()

type EditorBox = HTMLElement & { editor: { isInitialized: boolean; commands: { insertContent: (text: string) => void } } }

describe('whom @ offers in a Ship message box', () => {
  it('offers a member on the relay’s roster who has not touched anything in the workspace yet', async () => {
    history.replaceState(null, '', `/project/billing-${D_PROJECT}?tab=activity`)
    dispatchEvent(new PopStateEvent('popstate'))
    render(<App />)
    const main = within(screen.getByRole('main'))
    const box = (await main.findByRole('textbox', { name: 'Start a conversation…' }, { timeout: 5000 })) as EditorBox
    await waitFor(() => expect(box.editor.isInitialized).toBe(true))
    act(() => box.editor.commands.insertContent('@'))
    expect(await screen.findByRole('option', { name: /Nadia/ }, { timeout: 5000 })).toBeInTheDocument()
  })
})
