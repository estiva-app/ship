/**
 * A writer chooses a chip's card in the description (SPEC §13.3, Widgets): a
 * click on the chip opens its menu — Open, then None, Compact and Detailed —
 * and the choice is saved on the chip itself when they leave.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'

vi.mock('@/api/blobs', () => ({ blobObjectUrl: vi.fn(async () => 'blob:fetched'), uploadAttachment: vi.fn() }))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({ ...(await importOriginal()), resolveForeign: vi.fn(async () => null) }))

import { toRenderTree } from '@estiva-app/protocol'
import { LiveDescription } from './LiveDescription'
import { MAX_LINKS_PER_DESCRIPTION, linksInBlocks } from './DescriptionCards'

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
    const none = await screen.findByRole('menuitemradio', { name: 'None' })
    expect(none.getAttribute('aria-checked')).toBe('true')
    // The object is not readable here (resolveForeign is null), so the chip has no link: nothing to Open.
    expect(screen.queryByRole('menuitem', { name: 'Open' })).toBeNull()
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: 'Detailed' }))
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
