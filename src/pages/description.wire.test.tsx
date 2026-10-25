/**
 * A description on Ship's pages while someone else saves it, or the relay
 * refuses yours (LTX-3): what the person reads. Nothing between the editor and
 * the relay is mocked — the page, `act`, `setIssueField` / `setProjectField`,
 * the Store, the signer and the relay client all run. The relay is faked at
 * `fetch`, as in `summary.wire.test.tsx`: `POST /events` is accepted, or
 * refused while `refusing` is set; `POST /query` answers nothing.
 *
 * Mocked: the workspace read (one issue and one project, in a state the test
 * swaps to bring in someone else's save), the people directory, the Folder
 * listing reads and the clock check.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeNpub } from '@estiva-app/protocol'
import type { WorkspaceState } from '@/api'
import { stubLayout } from '@/test/inlineText'

type Signed = { id: string; kind: number; tags: string[][]; content: string }

const relay = vi.hoisted(() => {
  const relay = { refusing: false, published: [] as Signed[], sent: [] as Signed[] }
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      relay.sent.push(event)
      if (relay.refusing) return new Response(JSON.stringify({ accepted: false, event_id: event.id, message: 'blocked: archived' }), { status: 200 })
      relay.published.push(event)
      return new Response(JSON.stringify({ accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return relay
})

const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const D_PROJECT = '00000000-0000-4000-8000-000000000001'
const D_ISSUE = '00000000-0000-4000-8000-000000000011'
const AUTHOR = 'f'.repeat(64)
const KATERINA = 'c'.repeat(64)
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

/** The workspace with the issue's and the project's description as `text`, saved last by `by`. */
const stateWith = (text: string, by = AUTHOR, format: 'marker' | 'blocks' = 'marker'): WorkspaceState => {
  const fields = { description: { value: text, by, at: 2, format } }
  return {
    projects: [{ addr: PROJECT_ADDR, id: D_PROJECT, author: AUTHOR, createdAt: 1, title: 'Billing', description: text, descriptionFormat: format, contentFolder: TEAM, key: 'BIL', status: 'planned', archived: false, fields }],
    issues: [{ addr: ISSUE_ADDR, id: D_ISSUE, author: AUTHOR, createdAt: 1, title: 'Invoice totals', description: text, descriptionFormat: format, folder: TEAM, projectAddr: PROJECT_ADDR, ref: 'BIL-1', status: 'todo', fields }],
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
}
const showing = (state: WorkspaceState) =>
  vi.mocked(useWorkspace).mockReturnValue({ state, error: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), live: false })

const goTo = (path: string) => act(() => {
  history.replaceState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
})

type EditorBox = HTMLElement & { editor: Editor }
async function openDescription(path: string) {
  goTo(path)
  const view = render(<App />)
  const box = (await within(screen.getByRole('main')).findByRole('textbox', { name: 'Description' }, { timeout: 5000 })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return { ...view, box }
}
/* jsdom fires no focus event when the editor focuses itself, and cannot type into a contenteditable: both go through the editor. */
const typeInto = (box: EditorBox, text: string) =>
  act(() => {
    // Tiptap's `focus` command focuses a frame later: the view is focused now, as ui's own tests do.
    box.editor.view.focus()
    fireEvent.focus(box)
    box.editor.chain().focus('end').insertContent(text).run()
  })

beforeEach(() => {
  relay.refusing = false
  relay.published.length = 0
  relay.sent.length = 0
  showing(stateWith('Totals are off.'))
  vi.mocked(useDirectory).mockReturnValue({
    directory: new Map(),
    // As the real directory: a shortened key for someone with no profile name.
    nameOf: (pubkey: string) => (pubkey === KATERINA ? 'Katerina' : `${pubkey.slice(0, 8)}…`),
    personOf: () => ({ name: 'Someone' }),
    profileOf: (pubkey: string) => (pubkey === KATERINA ? { name: 'Katerina' } : undefined),
  } as never)
})

stubLayout()

describe('someone else saves the description while you are typing in it', () => {
  for (const [page, path] of [['an issue', `/issue/invoice-totals-${D_ISSUE}`], ['a project', `/project/billing-${D_PROJECT}`]] as const) {
    it(`on ${page}'s page: a line names who saved, yours stays, and Load it shows theirs`, async () => {
      const { box, rerender } = await openDescription(path)
      typeInto(box, ' By one cent.')
      showing(stateWith('Katerina rewrote it.', KATERINA))
      rerender(<App />)
      expect(screen.getByText(/^Katerina saved a newer version\./)).toBeTruthy()
      expect(box.editor.getText()).toBe('Totals are off. By one cent.')
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Load it' }))
      fireEvent.click(screen.getByRole('button', { name: 'Load it' }))
      await waitFor(() => expect(box.editor.getText()).toBe('Katerina rewrote it.'))
      expect(relay.published).toEqual([])
    })
  }

  it('says "Someone", never a shortened key, when the saver has no profile name', async () => {
    const { box, rerender } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    typeInto(box, ' By one cent.')
    showing(stateWith('Rewritten.', 'd'.repeat(64)))
    rerender(<App />)
    expect(screen.getByText(/^Someone saved a newer version\./)).toBeTruthy()
  })
})

describe('a description saved as you leave the page, refused by the relay', () => {
  for (const [page, path, title] of [['an issue', `/issue/invoice-totals-${D_ISSUE}`, 'Invoice totals'], ['a project', `/project/billing-${D_PROJECT}`, 'Billing']] as const) {
    it(`on ${page}'s page: the toast names the file, on the page you went to`, async () => {
      relay.refusing = true
      const { box } = await openDescription(path)
      typeInto(box, ' By one cent.')
      goTo('/issues')
      // The refusal's toast, in whichever words: then it must be the one that names the file.
      await screen.findByText(/were not saved|Description rejected/, {}, { timeout: 5000 })
      expect(screen.getByText(`Your last changes to ${title} were not saved.`)).toBeTruthy()
      expect(screen.queryByText(/Description rejected/)).toBeNull()
    })
  }

  it('left while the save made on blur is still out: said once, with the file named', async () => {
    relay.refusing = true
    const { box } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    typeInto(box, ' By one cent.')
    act(() => void fireEvent.blur(box))
    goTo('/issues')
    await screen.findByText(/were not saved|Description rejected/, {}, { timeout: 5000 })
    await act(async () => {})
    // One save reached the relay: the same text was not sent again as you left, so its refusal is said once.
    expect(relay.sent).toHaveLength(1)
    expect(screen.getAllByText('Your last changes to Invoice totals were not saved.')).toHaveLength(1)
  })

  it('refused while you are still on the page: the reason in a toast and the line under the field, as before', async () => {
    relay.refusing = true
    const { box } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    typeInto(box, ' By one cent.')
    act(() => void fireEvent.blur(box))
    expect(await screen.findByText('Could not save. Your text is still here.', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(/Description rejected — .*blocked: archived/)).toBeTruthy()
    expect(screen.queryByText(/were not saved/)).toBeNull()
  })
})

/** Puts editor content at the end of the description, focused, as `typeInto` puts text. */
const insertInto = (box: EditorBox, content: unknown) =>
  act(() => {
    box.editor.view.focus()
    fireEvent.focus(box)
    box.editor.chain().focus('end').insertContent(content as never).run()
  })
const leave = (box: EditorBox) => act(() => void fireEvent.blur(box))
const tag = (event: Signed, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const descriptionSaves = () => relay.published.filter((event) => tag(event, 'field') === 'description')
const addsOf = (person: string) => relay.published.filter((event) => tag(event, 'field') === `member:${person}`)

describe('a mention in a description adds the person, as the Add button does (WBD-7)', () => {
  const KATERINA_URI = `nostr:${encodeNpub(KATERINA)}`
  for (const [page, path, file] of [['an issue', `/issue/invoice-totals-${D_ISSUE}`, ISSUE_ADDR], ['a project', `/project/billing-${D_PROJECT}`, PROJECT_ADDR]] as const) {
    it(`on ${page}'s page: a save that names someone new writes their Add to the file; a typo fix after it adds nobody`, async () => {
      const { box } = await openDescription(path)
      insertInto(box, [{ type: 'text', text: ' Ask ' }, { type: 'reference', attrs: { uri: KATERINA_URI } }])
      leave(box)
      await waitFor(() => expect(addsOf(KATERINA)).toHaveLength(1))
      const add = addsOf(KATERINA)[0]
      expect([tag(add, 'a'), tag(add, 'h'), tag(add, 'p'), tag(add, 'value')]).toEqual([file, TEAM, KATERINA, 'true'])
      // The save itself carries no `p` for her (SPEC §13.1): being added is the Add's alone.
      expect(descriptionSaves()).toHaveLength(1)
      expect(descriptionSaves()[0].tags.some((t) => t[0] === 'p' && t[1] === KATERINA)).toBe(false)
      // A typo fix in a text that already names her adds nobody, so someone who left stays out.
      typeInto(box, '!')
      leave(box)
      await waitFor(() => expect(descriptionSaves()).toHaveLength(2))
      await act(async () => {})
      expect(addsOf(KATERINA)).toHaveLength(1)
    })
  }

  it('names you beside someone else: their Add is written, and none for you', async () => {
    const { box } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    insertInto(box, [{ type: 'text', text: ' Ask ' }, { type: 'reference', attrs: { uri: KATERINA_URI } }, { type: 'text', text: ' and ' }, { type: 'reference', attrs: { uri: `nostr:${encodeNpub(me)}` } }])
    leave(box)
    await waitFor(() => expect(addsOf(KATERINA)).toHaveLength(1))
    expect(addsOf(me)).toHaveLength(0)
  })
})

describe('a link on words in a description (WBD-7)', () => {
  const HREF = 'https://example.com/docs'
  it('written in the editor, is still on its words in the text the relay gets', async () => {
    const { box } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    insertInto(box, { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href: HREF } }] })
    leave(box)
    await waitFor(() => expect(descriptionSaves()).toHaveLength(1))
    const value = tag(descriptionSaves()[0], 'value')!
    expect(value).toContain('"text":"the docs"')
    expect(value).toContain(`"href":"${HREF}"`)
  })

  it('already in a description, keeps its link through a save of another change', async () => {
    const saved = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', id: 'a1', content: [{ type: 'text', text: 'Read ' }, { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href: HREF } }] }] }],
    })
    showing(stateWith(saved, AUTHOR, 'blocks'))
    const { box } = await openDescription(`/issue/invoice-totals-${D_ISSUE}`)
    typeInto(box, ' first.')
    leave(box)
    await waitFor(() => expect(descriptionSaves()).toHaveLength(1))
    const value = tag(descriptionSaves()[0], 'value')!
    expect(value).toContain(`"href":"${HREF}"`)
    expect(value).toContain('first.')
  })
})
