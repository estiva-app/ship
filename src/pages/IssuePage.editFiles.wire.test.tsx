/**
 * Editing a comment's files on an issue page, at the wire (ONE-4, PEEKM-4): the
 * page hands the edit box's files to the write, so the signed kind:40003 that
 * reaches the relay carries exactly the files the box saved. Nothing between
 * Save and the relay is mocked — the page, `editMessage`, the Store, the signer
 * and the relay client all run. The relay is faked at `fetch`: `POST /events`
 * is kept and accepted, `POST /query` answers nothing.
 *
 * Mocked, as `projectFolder.wire.test.tsx` does: the workspace read, the people
 * directory, the Folder listing reads, and the clock check.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Imeta } from '@estiva-app/protocol'
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

import { me, useDirectory, useWorkspace } from '@/api'
import App from '@/App'

const SHA = 'a'.repeat(64)
const FILE: Imeta = { url: `/media/${SHA}.pdf`, m: 'application/pdf', x: SHA, size: 900, filename: 'brief.pdf' }
const AT = Math.floor(Date.now() / 1000) - 600
/** The viewer's own comment, with one file: Edit is offered only on one's own. */
const commentOn = (addr: string) => ({ id: 'c'.repeat(64), author: me, createdAt: AT, body: 'Totals are off', folder: TEAM, about: [addr] })
const comment = commentOn(ISSUE_ADDR)

/** The workspace with the comment on `addr`, the issue or its project. */
const stateWith = (addr: string) => ({
  ...STATE,
  conversations: [{ id: comment.id, root: commentOn(addr), replies: [], about: [addr], createdAt: AT, lastAt: AT }],
  anchors: { [comment.id]: [addr] },
  mentionsOf: [addr],
}) as WorkspaceState

const STATE = {
  projects: [{ addr: PROJECT_ADDR, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker', contentFolder: TEAM, key: 'BIL', status: 'planned', archived: false, fields: {} }],
  issues: [{ addr: ISSUE_ADDR, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Invoice totals', description: '', descriptionFormat: 'marker', folder: TEAM, projectAddr: PROJECT_ADDR, ref: 'BIL-1', status: 'todo', fields: {} }],
  activity: [],
  conversations: [{ id: comment.id, root: comment, replies: [], about: [ISSUE_ADDR], createdAt: AT, lastAt: AT }],
  anchors: { [comment.id]: [ISSUE_ADDR] },
  edits: {},
  attachments: { [comment.id]: [FILE] },
  urgent: {},
  parts: {},
  embeds: {},
  folders: [TEAM],
  events: [],
  threadsAt: { [TEAM]: 1 },
  mentionsOf: [ISSUE_ADDR],
} as unknown as WorkspaceState

type EditorBox = HTMLElement & { editor: Editor }

const edits = () => published.filter((event) => event.kind === 40003)
const values = (event: Signed, name: string) => event.tags.filter((t) => t[0] === name).map((t) => t.slice(1))
/** The `x` of every file the event lists. */
const filesOf = (event: Signed) => values(event, 'imeta').map((entries) => entries.find((entry) => entry.startsWith('x '))?.slice(2))

const workspace = (state: WorkspaceState) => ({ state, partial: false, error: null, clock: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  published.length = 0
  vi.mocked(useWorkspace).mockReturnValue(workspace(STATE))
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
  history.replaceState(null, '', `/issue/invoice-totals-${D_ISSUE}`)
})
afterEach(() => vi.useRealTimers())

stubLayout()

/** The page drawn, its comment's edit box open. */
async function openEdit() {
  render(<App />)
  await screen.findByText('Totals are off')
  document.querySelectorAll('[data-comment-body], [data-reply-id]').forEach((card) => fireEvent.mouseEnter(card))
  fireEvent.click(screen.getAllByRole('button', { name: 'Message actions' })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
  const box = (await screen.findByRole('textbox', { name: 'Edit message' })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement

describe("an issue page's comment edit carries the files the edit box saved, at the wire (ONE-4)", () => {
  it('words cleared, file kept: the kind:40003 has empty content and still lists the file', async () => {
    const box = await openEdit()
    act(() => void box.editor.chain().selectAll().insertContent({ type: 'text', text: '   ' }).run())
    await waitFor(() => expect(save().disabled).toBe(false))
    fireEvent.click(save())
    await waitFor(() => expect(edits()).toHaveLength(1))
    const [edit] = edits()
    expect(edit.content).toBe('')
    expect(edit.pubkey).toBe(me)
    expect(values(edit, 'e').map(([id]) => id)).toContain(comment.id)
    expect(filesOf(edit)).toEqual([SHA])
  })

  it('its only file taken off, words kept: the kind:40003 lists no file, so the file leaves the comment', async () => {
    await openEdit()
    fireEvent.click(screen.getByRole('button', { name: /Remove brief\.pdf/ }))
    await waitFor(() => expect(save().disabled).toBe(false))
    fireEvent.click(save())
    await waitFor(() => expect(edits()).toHaveLength(1))
    const [edit] = edits()
    expect(edit.content).toBe('Totals are off')
    expect(filesOf(edit)).toEqual([])
  })
})

describe("a project page's comment edit carries the files the edit box saved, at the wire (ONE-4)", () => {
  it('its only file taken off, words kept: the kind:40003 lists no file, so the file leaves the comment', async () => {
    vi.mocked(useWorkspace).mockReturnValue(workspace(stateWith(PROJECT_ADDR)))
    history.replaceState(null, '', `/project/billing-${D_PROJECT}`)
    await openEdit()
    fireEvent.click(screen.getByRole('button', { name: /Remove brief\.pdf/ }))
    await waitFor(() => expect(save().disabled).toBe(false))
    fireEvent.click(save())
    await waitFor(() => expect(edits()).toHaveLength(1))
    const [edit] = edits()
    expect(edit.content).toBe('Totals are off')
    expect(filesOf(edit)).toEqual([])
  })
})
