/**
 * A writer chooses a chip's card in the description (SPEC §13.3, Widgets): a
 * click on the chip opens its menu — Open, then None, Compact and Detailed —
 * and the choice is saved on the chip itself when they leave.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'

vi.mock('@/api/blobs', () => ({ blobObjectUrl: vi.fn(async () => 'blob:fetched'), uploadAttachment: vi.fn() }))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({ ...(await importOriginal()), resolveForeign: vi.fn(async () => null) }))

import { addrToNaddr, toRenderTree } from '@estiva-app/protocol'
import { LiveDescription } from './LiveDescription'
import { LineCards, MAX_LINKS_PER_DESCRIPTION, blockLineCards, linksInBlocks } from './DescriptionCards'
import { resolveForeign, type ForeignObject as ForeignObjectData } from '@/api/foreign'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const NADDR = 'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'
const DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text: NADDR, marks: [{ type: 'reference', attrs: { uri: NADDR } }] }] }],
})

type EditorBox = HTMLElement & { editor: Editor }

describe('choosing a chip\'s card in the description', () => {
  it('opens the chip\'s menu on a click, and saves the card chosen there on the chip', async () => {
    const onCommit = vi.fn(() => true)
    render(<LiveDescription value={DOC} format="blocks" onCommit={onCommit} />)
    const box = (await screen.findByRole('textbox', { name: 'Description' })) as EditorBox
    await waitFor(() => expect(box.editor.isInitialized).toBe(true))

    act(() => box.editor.commands.focus())
    const chip = box.querySelector('[data-node-view-wrapper]')
    expect(chip).not.toBeNull()
    fireEvent.click(chip!)
    // ui 0.83: a lone link offers Show as Row or Card (record a-lone-links-chip-menu-offers-row-or-card); Row is no card.
    const row = await screen.findByRole('menuitemradio', { name: 'Row' })
    expect(row.getAttribute('aria-checked')).toBe('true')
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: 'Card' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Link' })).toBeNull())

    act(() => box.editor.commands.blur())
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
    const saved = JSON.parse((onCommit.mock.calls[0] as unknown as [string])[0])
    expect(saved.content[0].id).toBe('p1')
    expect(saved.content[0].content[0].marks).toEqual([{ type: 'reference', attrs: { uri: NADDR, embed: 'detailed' } }])
  })
})

describe('linksInBlocks', () => {
  const doc = (content: unknown[]) => toRenderTree(JSON.stringify({ type: 'doc', content }), 'blocks')
  it('asks about a URL in the text and one a card hangs from, never one in code', () => {
    const blocks = doc([
      { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'See https://a.example/1.' }] },
      { type: 'paragraph', id: 'p2', content: [{ type: 'text', text: 'https://a.example/2', marks: [{ type: 'link', attrs: { href: 'https://a.example/2', embed: 'compact' } }] }] },
      { type: 'paragraph', id: 'p3', content: [{ type: 'text', text: 'https://a.example/3', marks: [{ type: 'code' }] }] },
    ])
    expect(linksInBlocks(blocks)).toEqual(['https://a.example/1', 'https://a.example/2'])
  })
  it('asks about the first ones only', () => {
    const text = Array.from({ length: MAX_LINKS_PER_DESCRIPTION + 3 }, (_, i) => `https://a.example/${i}`).join(' ')
    const asked = linksInBlocks(doc([{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text }] }]))
    expect(asked).toHaveLength(MAX_LINKS_PER_DESCRIPTION)
    expect(asked[0]).toBe('https://a.example/0')
  })
})

describe('a Folder\'s card after a description\'s line', () => {
  const object = (ref: string, title: string, over: Partial<ForeignObjectData> = {}) =>
    ({ ref, eventId: 'e'.repeat(64), kind: Number(ref.split(':')[0]), widget: 'card', slots: { title: { value: title } }, meta: [], comments: [], actions: [], viaRecommendation: true, ...over }) as ForeignObjectData
  // A Folder of its own for each test: a Folder's files are held for the tab, as they are in Ship.
  let folders = 0
  let FOLDER = ''

  beforeEach(() => {
    vi.useFakeTimers()
    FOLDER = `39000:${'c'.repeat(64)}:0b8b7c1e-5f0e-4b4a-9d55-2f1d3c8a7e${String(++folders).padStart(2, '0')}`
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(resolveForeign).mockImplementation(async () => null)
  })

  it('lists the files in the Folder, in its order, read for the card alone', async () => {
    const uri = `nostr:${addrToNaddr(FOLDER)}`
    const folder = object(FOLDER, 'Estiva HQ', { noun: 'folder' })
    const files = [object('30840:a:topic', 'Weekly notes', { noun: 'topic' }), object('30842:a:page', 'Handbook', { noun: 'document' })]
    vi.mocked(resolveForeign).mockImplementation(async (_reference, options) => (options?.folderFiles ? { ...folder, children: files } : folder))

    const [block] = toRenderTree(
      JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text: uri, marks: [{ type: 'reference', attrs: { uri, embed: 'detailed' } }] }] }] }),
      'blocks',
    )
    const { container } = render(<>{blockLineCards(block, { [uri]: folder })}</>)

    const links = () => [...container.querySelectorAll('[data-card="detailed"] a')].map((a) => a.textContent ?? '')
    expect(links().some((text) => text.includes('Estiva HQ'))).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(0))
    const rows = links().filter((text) => text.includes('Weekly notes') || text.includes('Handbook'))
    expect(rows).toEqual([expect.stringContaining('Weekly notes'), expect.stringContaining('Handbook')])
  })
})

describe('a project\'s card after a description\'s line (5ebf2756)', () => {
  it('shows its key, its issues and how many are done, as under a comment', () => {
    const PROJECT = `30850:${'c'.repeat(64)}:project-one`
    const uri = `nostr:${addrToNaddr(PROJECT)}`
    const issue = (n: number, status: string, colour: string, changedAt: number) =>
      ({
        ref: `30851:${'c'.repeat(64)}:i${n}`,
        address: `30851:${'c'.repeat(64)}:i${n}`,
        eventId: 'e'.repeat(64),
        kind: 30851,
        widget: 'row',
        slots: { title: { value: `Issue ${n}` }, status: { value: status, colour, field: 'status' } },
        meta: [{ value: `ABC-${n}`, field: 'ref' }],
        comments: [],
        actions: [],
        viaRecommendation: true,
        changedAt,
      }) as ForeignObjectData
    const project = {
      ref: PROJECT,
      address: PROJECT,
      eventId: 'f'.repeat(64),
      kind: 30850,
      widget: 'card',
      slots: { title: { value: 'Project one' } },
      meta: [{ value: 'ABC', field: 'key' }],
      comments: [],
      actions: [],
      viaRecommendation: true,
      children: [issue(1, 'Done', 'green', 10), issue(2, 'Todo', 'neutral', 20)],
    } as ForeignObjectData
    const [block] = toRenderTree(
      JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text: uri, marks: [{ type: 'reference', attrs: { uri, embed: 'detailed' } }] }] }] }),
      'blocks',
    )
    const { container } = render(<>{blockLineCards(block, { [uri]: project })}</>)
    const card = container.querySelector('[data-card="detailed"]')
    expect(card, 'the kit’s card, as under a comment').not.toBeNull()
    if (!card) return
    expect(card.textContent).toContain('ABC')
    expect(card.textContent).toContain('1/2')
    const rows = [...card.querySelectorAll('a')].map((a) => a.textContent ?? '').filter((text) => text.includes('Issue'))
    expect(rows).toEqual([expect.stringContaining('Issue 2'), expect.stringContaining('Issue 1')])
  })

  // Decided 21 Oct (leaf#59): pickers while the text is read, words while it is edited.
  it('has its Status picker while the description is read, and reads it as words while it is edited', () => {
    const ISSUE = `30851:${'c'.repeat(64)}:one`
    const uri = `nostr:${addrToNaddr(ISSUE)}`
    const issue = {
      ref: ISSUE,
      address: ISSUE,
      eventId: 'e'.repeat(64),
      kind: 30851,
      widget: 'row',
      slots: { title: { value: 'Issue one' }, status: { value: 'Todo', colour: 'neutral', field: 'status' } },
      meta: [],
      comments: [],
      actions: [{ id: 'set-issue-status', label: 'Change status', control: 'select', field: 'status', current: 'todo', options: [{ value: 'todo', label: 'Todo' }, { value: 'done', label: 'Done' }] }],
      viaRecommendation: true,
    } as unknown as ForeignObjectData
    const cards = [{ uri, layout: 'detailed' as const }]
    const read = render(<LineCards cards={cards} resolved={{ [uri]: issue }} />)
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeNull()
    read.unmount()
    render(<LineCards cards={cards} resolved={{ [uri]: issue }} editing />)
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
    expect(screen.getByText('Todo')).toBeTruthy()
  })
})
