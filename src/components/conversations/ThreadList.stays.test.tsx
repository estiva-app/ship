/**
 * The conversation is drawn once and stays as the read state lands (SHI-62, SHI-57).
 *
 * A page shows its comments before it knows what is unread. Ship used to draw the whole conversation again when that
 * arrived: the comment box was replaced under the person typing in it, and an edit opened early closed by itself.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'

// The edit box uploads through Ship's own upload, which needs a relay; a test answers for it.
vi.mock('@/api/blobs', async (original) => ({ ...(await original<typeof import('@/api/blobs')>()), uploadAttachment: vi.fn() }))

import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { ThreadListViewProps } from './shared'
import type { Resolution } from '@/api'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text nodes, and ProseMirror calls them
   when it scrolls the caret into view. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const ME = 'c'.repeat(64)
const BOB = 'b'.repeat(64)
const mine: ThreadData = { id: 'mine', root: { id: 'mine', author: { name: 'Me' }, at: 1_756_000_000, body: 'Blocked on the Stripe key.', by: ME }, replies: [] }
const answered: ThreadData = {
  id: 'answered',
  root: { id: 'answered', author: { name: 'Me' }, at: 1_756_000_100, body: 'Which key?', by: ME },
  replies: [{ id: 'reply-1', author: { name: 'Bob' }, at: 1_756_000_200, body: 'The live one.', by: BOB }],
}

type EditorBox = HTMLElement & { editor: Editor }
const view = (props: Partial<ThreadListViewProps>) => (
  <ThreadListView threads={[mine, answered]} onStart={async () => true} onReply={async () => true} onEditMessage={vi.fn()} viewer={ME} {...props} />
)
/** The kit's box asks for the caret on the next animation frame and its editor takes it on the one after: the test's clock draws both, and one more. */
const frame = () => act(() => void vi.advanceTimersToNextFrame().advanceTimersToNextFrame().advanceTimersToNextFrame())
/** A writing box once its editor is made (the box is loaded on first use), and the frame after it has been drawn. */
const box = async (name: string) => {
  const found = (await screen.findByRole('textbox', { name })) as EditorBox
  await waitFor(() => expect(found.editor.isInitialized).toBe(true))
  await frame()
  return found
}

describe('the conversation stays as drawn when the read state lands', () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }))
  afterEach(() => void vi.useRealTimers())

  it('keeps the comment box, the caret in it and what is typed (SHI-62)', async () => {
    const page = render(view({ unread: undefined }))
    const start = await box('Start a conversation…')
    start.focus()
    start.editor.commands.insertContent('probe typ')

    page.rerender(view({ unread: {} }))

    expect(screen.getByRole('textbox', { name: 'Start a conversation…' })).toBe(start)
    expect(start).toHaveFocus()
    expect(start).toHaveTextContent('probe typ')
  })

  it('keeps an edit opened before it landed open, with the comment’s text (SHI-57)', async () => {
    const page = render(view({ unread: undefined }))
    document.querySelectorAll('[data-comment-body]').forEach((card) => fireEvent.mouseEnter(card))
    fireEvent.click(screen.getAllByRole('button', { name: 'Message actions' })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
    const edit = await box('Edit message')

    page.rerender(view({ unread: {} }))

    expect(screen.getByRole('textbox', { name: 'Edit message' })).toBe(edit)
    expect(edit).toHaveTextContent('Blocked on the Stripe key.')
  })

  it('opens the thread holding a new reply by itself, and leaves the caret in the comment box', async () => {
    const page = render(view({ unread: undefined }))
    const start = await box('Start a conversation…')
    start.focus()

    page.rerender(view({ unread: { answered: ['reply-1'] } }))

    const reply = await box('Reply…')
    expect(screen.getByText('The live one.')).toBeInTheDocument()
    expect(reply).not.toHaveFocus()
    expect(start).toHaveFocus()
  })

  it('gives the reply box the caret when Reply is pressed on the thread that opened by itself', async () => {
    const page = render(view({ unread: undefined }))
    await box('Start a conversation…')
    page.rerender(view({ unread: { answered: ['reply-1'] } }))
    const reply = await box('Reply…')
    expect(reply).not.toHaveFocus()

    document.querySelectorAll('[data-comment-body]').forEach((card) => fireEvent.mouseEnter(card))
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' }).at(-1)!)

    await frame()
    expect(reply).toHaveFocus()
  })

  it('does the same for a resolved thread, which opens "Resolved" for itself: no caret as it opens, the caret on the first Reply', async () => {
    const resolution: Resolution = { id: 'e'.repeat(64), action: 'resolved', by: BOB, at: 1_756_000_300, orderMs: 1_756_000_300_000, message: 'Done', folder: 'f' }
    const page = render(view({ unread: undefined, resolvedBy: { answered: resolution }, onResolve: vi.fn() }))
    const start = await box('Start a conversation…')
    start.focus()
    page.rerender(view({ unread: { answered: ['reply-1'] }, resolvedBy: { answered: resolution }, onResolve: vi.fn() }))

    const reply = await box('Reply…')
    expect(reply).not.toHaveFocus()
    expect(start).toHaveFocus()
    document.querySelectorAll('[data-comment-body]').forEach((card) => fireEvent.mouseEnter(card))
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' }).at(-1)!)

    await frame()
    expect(reply).toHaveFocus()
  })
})
