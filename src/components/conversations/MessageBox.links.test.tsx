/**
 * A pasted app link in Ship's message box — OPT-19 (Miky, 14 Oct). Every app
 * link reads as its chip before sending, pasted alone, mid-sentence or inside
 * a passage, and the message is sent with the URL it was; Ctrl+Z gives the URL
 * back. A URL no app claims, a block link and a URL pasted over selected words
 * stay links. Each test pastes through ProseMirror's paste path, as a person does.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import { MessageBox } from './MessageBox'

const ISSUE_URL = 'https://ship.estiva.app/i/relay-search-1a2b3c4d5e6f'
const BLOCK_URL = `${ISSUE_URL}#block-8373a025427f`

vi.mock('@/api/linkCards', () => {
  const values: Record<string, string> = { 'https://ship.estiva.app/i/relay-search-1a2b3c4d5e6f': `30851:${'b'.repeat(64)}:1a2b3c4d5e6f` }
  return {
    knownLinkValue: (url: string) => values[url],
    askLinkValues: () => Promise.resolve(),
  }
})

beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
  Element.prototype.scrollIntoView ??= () => {}
})

type EditorBox = HTMLElement & { editor: Editor }
async function compose(onSubmit = vi.fn().mockResolvedValue(true)) {
  render(<MessageBox onSubmit={onSubmit} />)
  const box = screen.getByRole('textbox', { name: 'Start a conversation…' }) as EditorBox
  await waitFor(() => expect(box.editor?.view).toBeTruthy())
  await sleep(0)
  return { box, onSubmit }
}
const sleep = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))
const type = (box: EditorBox, text: string) => act(() => void box.editor.chain().focus().insertContent(text).run())
// jsdom has no ClipboardEvent: a plain event carrying the clipboard's text stands in.
const paste = (box: EditorBox, text: string) =>
  act(() => {
    const event = Object.assign(new Event('paste'), { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } })
    box.editor.view.pasteText(text, event as unknown as ClipboardEvent)
  })
const enter = (box: EditorBox) => act(() => void fireEvent.keyDown(box, { key: 'Enter' }))
const chips = (box: EditorBox) => {
  const found: Record<string, unknown>[] = []
  box.editor.state.doc.descendants((node) => {
    if (node.type.name === 'reference') found.push(node.attrs)
  })
  return found
}

describe('a pasted link in the message box (OPT-19)', () => {
  it('turns a pasted issue URL into its chip mid-sentence, and sends the URL', async () => {
    const { box, onSubmit } = await compose()
    await type(box, 'see ')
    await paste(box, ISSUE_URL)
    expect(chips(box)).toMatchObject([{ href: ISSUE_URL, uri: expect.stringMatching(/^nostr:naddr1/) }])
    await type(box, ' today')
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(`see ${ISSUE_URL} today`, [], { urgent: undefined })
  })

  it('gives the URL back on Ctrl+Z, and the paste away on a second', async () => {
    const { box } = await compose()
    await type(box, 'see ')
    await paste(box, ISSUE_URL)
    expect(chips(box)).toHaveLength(1)
    await act(() => void box.editor.commands.undo())
    expect(chips(box)).toHaveLength(0)
    expect(box.editor.getText()).toBe(`see ${ISSUE_URL}`)
    // The paste goes with whatever history grouped it with: here the words typed just before.
    await act(() => void box.editor.commands.undo())
    expect(box.editor.getText()).not.toContain('https://')
  })

  it('turns the app links inside a pasted passage into chips, and a typed one once the caret leaves it', async () => {
    const { box } = await compose()
    await paste(box, `two links: ${ISSUE_URL} and https://example.com/x`)
    expect(chips(box)).toMatchObject([{ href: ISSUE_URL }])
    await act(() => void box.editor.commands.clearContent())
    await type(box, `typed ${ISSUE_URL}`)
    expect(chips(box)).toHaveLength(0)
    await type(box, ' then')
    expect(chips(box)).toMatchObject([{ href: ISSUE_URL }])
  })

  it('leaves a URL no app claims and a block link as text', async () => {
    const { box, onSubmit } = await compose()
    await paste(box, 'https://example.com/x')
    await type(box, ' ')
    await paste(box, BLOCK_URL)
    expect(chips(box)).toHaveLength(0)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(`https://example.com/x ${BLOCK_URL}`, [], { urgent: undefined })
  })

  it('makes a URL pasted over selected words a link on them, not a chip', async () => {
    const { box, onSubmit } = await compose()
    await type(box, 'read the plan first')
    await act(() => void box.editor.commands.setTextSelection({ from: 6, to: 14 }))
    await paste(box, ISSUE_URL)
    expect(chips(box)).toHaveLength(0)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(`read [the plan](${ISSUE_URL}) first`, [], { urgent: undefined })
  })

})
