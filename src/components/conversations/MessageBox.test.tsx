// Moved from src/components/Composer.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import { MessageBox } from './MessageBox'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them when it scrolls the caret into view — this
   box focuses itself after an upload and after a send. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

type EditorBox = HTMLElement & { editor: Editor }
const box = (name: string) => screen.getByRole('textbox', { name }) as EditorBox
/* The editor seeds itself (from the draft, or empty) once it is created, a tick
   after the first render; a person cannot type sooner, so neither does a test. */
const ready = async (name: string) => {
  const target = box(name)
  await waitFor(() => expect(target.editor.isInitialized).toBe(true))
  return target
}
/* The field is a ProseMirror editor, not an <input>: jsdom cannot type into it,
   so the text goes in through the editor's own command, as App.test.tsx does. */
const type = (target: EditorBox, text: string) => act(() => void target.editor.commands.insertContent(text))
const send = () => screen.getByRole('button', { name: 'Send' })
/* Send is disabled natively when there is nothing to send, and with
   `aria-disabled` (focusable, with the reason as its tooltip) while a file
   uploads or a message sends. Either way it cannot be pressed. */
const pressable = (button: HTMLElement) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true'

describe('MessageBox', () => {
  // Changed on purpose: the one-line field's "Post" is the writing box's "Send" icon button, and a form
  // submit is the Enter key in the editor (what the old field's Enter did).
  it('submits trimmed text on Enter, never submits empty, and clears only when the post succeeded', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<MessageBox onSubmit={onSubmit} />)
    const input = await ready('Start a conversation…')
    expect(pressable(send())).toBe(false)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()

    type(input, '  hello  ')
    expect(pressable(send())).toBe(true)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('hello', [], { urgent: undefined })
    await waitFor(() => expect(input).toHaveTextContent(/^$/))
  })

  // Changed on purpose: a reply's "Reply" button is the same "Send" icon button.
  it('keeps the text when the post fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<MessageBox kind="reply" onSubmit={onSubmit} />)
    const input = await ready('Reply…')
    type(input, 'still here')
    fireEvent.click(send())
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await waitFor(() => expect(pressable(send())).toBe(true))
    expect(input).toHaveTextContent('still here')
  })

  /*
    Attaching a file — SHI-2.

    The upload is injected, so none of this needs a relay. What it pins is the
    ordering the relay forces on us: `onSubmit` may only ever be handed files
    that already uploaded, because ingest refuses a message naming a blob it
    does not hold. Everything below is a way of getting that wrong.
  */
  const FILE_SHA = 'f'.repeat(64)
  const meta = { url: `/media/${FILE_SHA}.png`, m: 'image/png', x: FILE_SHA, size: 12, filename: 'shot.png' }
  /* The input is deliberately out of the accessibility tree — the button is the
     control — so it is reached the way the page reaches it, by the element. */
  const pick = (container: HTMLElement, name = 'shot.png') =>
    fireEvent.change(container.querySelector('[data-composer="picker"]')!, {
      target: { files: [new File(['x'], name, { type: 'image/png' })] },
    })

  it('uploads a chosen file and hands it to onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const upload = vi.fn().mockResolvedValue(meta)
    const { container } = render(<MessageBox onSubmit={onSubmit} upload={upload} />)
    await ready('Start a conversation…')

    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    type(box('Start a conversation…'), 'look')
    fireEvent.click(send())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('look', [meta], { urgent: undefined }))
    // Posted files do not carry over into the next message.
    await waitFor(() => expect(screen.queryByText('shot.png')).not.toBeInTheDocument())
  })

  it('posts a message that is only a file', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { container } = render(<MessageBox onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    await ready('Start a conversation…')
    expect(pressable(send())).toBe(false)

    pick(container)
    await waitFor(() => expect(pressable(send())).toBe(true))
    fireEvent.click(send())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('', [meta], { urgent: undefined }))
  })

  it('says why an upload was refused, and attaches nothing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const upload = vi.fn().mockRejectedValue(new Error('file exceeds 10 MiB'))
    const { container } = render(<MessageBox onSubmit={onSubmit} upload={upload} />)
    await ready('Start a conversation…')

    pick(container)
    // The relay's own words, not "upload failed" — this one is actionable.
    expect(await screen.findByRole('alert')).toHaveTextContent('file exceeds 10 MiB')

    type(box('Start a conversation…'), 'anyway')
    await waitFor(() => expect(pressable(send())).toBe(true))
    fireEvent.click(send())
    // The message still goes, carrying no file. A refused upload costs the
    // attachment and nothing else.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('anyway', [], { urgent: undefined }))
  })

  it('keeps an attachment when the post is refused, so a retry costs no upload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const { container } = render(<MessageBox onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    await ready('Start a conversation…')
    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    await waitFor(() => expect(pressable(send())).toBe(true))
    fireEvent.click(send())
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByText('shot.png')).toBeInTheDocument()
  })

  it('removes an attachment before it is posted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { container } = render(<MessageBox onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    await ready('Start a conversation…')
    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }))
    await waitFor(() => expect(screen.queryByText('shot.png')).not.toBeInTheDocument())
    expect(pressable(send())).toBe(false)
  })
})

// Found by Katerina, 30 September.
describe('the box as it opens and grows', () => {
  it('opens with a caret, not the line selected — so the formatting strip does not show', async () => {
    render(<MessageBox kind="reply" autoFocus onSubmit={() => true} drafts={{ read: () => undefined, write: () => {}, clear: () => {} }} />)
    const target = await ready('Reply…')
    await waitFor(() => expect(target.editor.state.selection.empty).toBe(true))
  })

  it('keeps no empty line after a list, so a bullet is no taller than a line of text', async () => {
    render(<MessageBox kind="conversation" onSubmit={() => true} drafts={{ read: () => undefined, write: () => {}, clear: () => {} }} />)
    const target = await ready('Start a conversation…')
    type(target, 'a')
    act(() => void target.editor.commands.toggleBulletList())
    expect(target.editor.getJSON().content?.map((n) => n.type)).toEqual(['bulletList'])
  })
})
