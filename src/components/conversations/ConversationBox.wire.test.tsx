/**
 * What Ship's comment box sends, at the wire (COMM-7): the shared box's chips
 * become the tags SPEC §13.1 requires — a `p` per person named, `urgent` for
 * one named urgently, a `q` per message referenced — through Ship's own
 * `startConversation` and Store, signed and posted. And a send the relay
 * refuses puts the words back in the box with the relay's words under it, no
 * toast (Decided 2026-10-17). SHI-50: "Mentions in Ship are not working".
 *
 * Nothing between the box and the relay is mocked; the relay is faked at
 * `fetch`, as `projectFolder.wire.test.tsx` does, and refuses any event whose
 * text says "refuse".
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { composerDocument } from '@estiva-app/conversation'
import { encodeNevent, encodeNpub } from '@estiva-app/protocol'
import type { WorkspaceState } from '@/api'
import { stubLayout } from '@/test/inlineText'

type Signed = { id: string; kind: number; pubkey: string; sig: string; tags: string[][]; content: string }

const { published } = vi.hoisted(() => {
  const published: Signed[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      if (/refuse/.test(event.content)) return new Response(JSON.stringify({ accepted: false, message: 'blocked: not allowed here' }), { status: 200 })
      published.push(event)
      return new Response(JSON.stringify({ accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { published }
})

const FOLDER = '11111111-1111-4111-8111-111111111111'
const D_PROJECT = '00000000-0000-4000-8000-000000000001'
const AUTHOR = 'f'.repeat(64)
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const QUOTED = 'c'.repeat(64)

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
} as unknown as WorkspaceState

const tags = (event: Signed, name: string) => event.tags.filter((t) => t[0] === name).map((t) => t[1])
const comments = () => published.filter((event) => event.kind === 1111)

beforeEach(() => {
  published.length = 0
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, loading: false, busy: false, refresh: vi.fn(async () => {}), live: false })
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: () => 'Someone', personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
})

stubLayout()

type EditorBox = HTMLElement & { editor: { isInitialized: boolean; commands: { setContent: (doc: unknown) => void } } }

/** The project's conversation box, with `text` in it as chips — what `@`, `!@` and `[` put there. */
async function write(text: string, urgent?: string[]) {
  history.replaceState(null, '', `/project/billing-${D_PROJECT}?tab=activity`)
  dispatchEvent(new PopStateEvent('popstate'))
  render(<App />)
  const main = within(screen.getByRole('main'))
  const box = (await main.findByRole('textbox', { name: 'Start a conversation…' }, { timeout: 5000 })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  const doc = composerDocument(text, { personLabel: (pk) => (pk === ANA ? 'Ana' : 'Ravi'), referenceCaption: () => ({ label: 'Ana', snippet: 'The key is rotated.' }) }, urgent)
  act(() => box.editor.commands.setContent(doc))
  fireEvent.click(main.getByRole('button', { name: 'Send' }))
  return { main, box }
}

describe('a comment written in the shared box', () => {
  it('names each person it mentions in a p tag, the urgent one in an urgent tag, and the message it references in a q tag', async () => {
    const quoted = encodeNevent({ id: QUOTED, relays: [] })
    await write(`Ask nostr:${encodeNpub(ANA)} and nostr:${encodeNpub(RAVI)} about nostr:${quoted}`, [RAVI])
    await waitFor(() => expect(comments()).toHaveLength(1), { timeout: 5000 })
    const [sent] = comments()
    expect(sent.content).toContain(`nostr:${encodeNpub(ANA)}`)
    expect(tags(sent, 'p')).toEqual(expect.arrayContaining([ANA, RAVI]))
    expect(tags(sent, 'urgent')).toEqual([RAVI])
    expect(tags(sent, 'q')).toEqual([QUOTED])
  })

  it('puts the words back with the relay’s reason under the box when the relay refuses, and no toast', async () => {
    const { main, box } = await write('please refuse this')
    expect(await main.findByText('Not sent: blocked: not allowed here. Your text is back in the box.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(box.textContent).toBe('please refuse this')
    expect(comments()).toHaveLength(0)
    // No toast: the page's banner says nothing.
    expect(screen.queryByText(/rejected/)).toBeNull()
  })
})
