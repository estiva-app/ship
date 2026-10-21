import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'

vi.mock('@/api/blobs', () => ({ blobObjectUrl: vi.fn(async () => 'blob:fetched'), uploadAttachment: vi.fn() }))

import { LiveDescription } from './LiveDescription'

/**
 * Someone saves the description while you are in it — LTX-3, Leaf's page's
 * behaviour (LEAF-3) brought to Ship, now that Leaf writes Ship's text. The
 * last save wins (record a-files-text-is-a-readable-snapshot): you are told,
 * and can load theirs. A save refused after you left is the page's to say:
 * `src/pages/description.wire.test.tsx`.
 */

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text nodes, and ProseMirror calls them on every change. */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})
afterEach(cleanup)

type EditorBox = HTMLElement & { editor: Editor }
const description = () => screen.getByRole('textbox', { name: 'Description' }) as EditorBox
const ready = async () => {
  await waitFor(() => expect(description().editor.isInitialized).toBe(true))
  return description()
}
/* jsdom fires no focus event when the editor focuses itself, so it is fired here, as a browser would. */
const enter = (box: EditorBox) =>
  act(() => {
    box.editor.commands.focus('end')
    fireEvent.focus(box)
  })
/* jsdom cannot type into a contenteditable: text goes in through the editor's own command. */
const type = (box: EditorBox, text: string) => {
  enter(box)
  act(() => void box.editor.chain().insertContent(text).run())
}
const leave = (box: EditorBox) => act(() => void fireEvent.blur(box))
const text = () => description().editor.getText()

type Commit = (value: string, contentFormat?: string, left?: () => boolean) => Promise<boolean>

function mount(onCommit = vi.fn<Commit>(async () => true)) {
  const props = { format: 'marker' as const, changedBy: 'Katerina', onCommit }
  const view = render(<LiveDescription value="mine" {...props} />)
  const arrive = (value: string) => view.rerender(<LiveDescription value={value} {...props} />)
  return { ...view, arrive, onCommit }
}

describe('someone else saves the description', () => {
  it('draws their text at once while you are not in the description', async () => {
    const { arrive } = mount()
    await ready()
    arrive('theirs')
    await waitFor(() => expect(text()).toBe('theirs'))
    expect(screen.queryByText(/saved a newer version/)).toBeNull()
  })

  it('waits while you are in it, says who saved, and Load it shows theirs without saving yours', async () => {
    const { arrive, onCommit } = mount()
    const box = await ready()
    type(box, ' and more')
    arrive('theirs')
    expect(screen.getByText('Katerina saved a newer version.')).toBeTruthy()
    expect(text()).toBe('mine and more')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Load it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load it' }))
    await waitFor(() => expect(text()).toBe('theirs'))
    expect(screen.queryByText(/saved a newer version/)).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('loads theirs as you leave when you changed nothing', async () => {
    const { arrive, onCommit } = mount()
    const box = await ready()
    enter(box)
    arrive('theirs')
    expect(screen.getByText(/saved a newer version/)).toBeTruthy()
    leave(box)
    await waitFor(() => expect(text()).toBe('theirs'))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('saves yours over theirs when you changed something: the last save wins, and theirs is not drawn back', async () => {
    const { arrive, onCommit } = mount()
    const box = await ready()
    type(box, ' and more')
    arrive('theirs')
    expect(screen.getByText(/saved a newer version/)).toBeTruthy()
    leave(box)
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    expect(onCommit.mock.calls[0][0]).toContain('mine and more')
    // The page still holds theirs until your save comes back; it must not replace yours.
    await act(async () => {})
    expect(text()).toBe('mine and more')
    expect(screen.queryByText(/saved a newer version/)).toBeNull()
  })

  it('says "Someone" when the saver has no name', async () => {
    const onCommit = vi.fn<Commit>(async () => true)
    const view = render(<LiveDescription value="mine" format="marker" onCommit={onCommit} />)
    const box = await ready()
    enter(box)
    view.rerender(<LiveDescription value="theirs" format="marker" onCommit={onCommit} />)
    expect(screen.getByText('Someone saved a newer version.')).toBeTruthy()
  })

  it('draws their save of the text yours replaced, once yours has come back', async () => {
    const { arrive, onCommit } = mount()
    const box = await ready()
    // Typed without the focus command, which focuses a frame later and, under load, after the blur below.
    act(() => void box.editor.chain().insertContent(' and more').run())
    leave(box)
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    // The relay has answered, and the page catches up with your save.
    await act(async () => void (await onCommit.mock.results[0].value))
    arrive(onCommit.mock.calls[0][0])
    await act(async () => {})
    // Katerina saves her text back, word for word what yours replaced.
    arrive('mine')
    await act(async () => {})
    expect(text()).toBe('mine')
  })

  it('does not take your own save coming back for someone else\'s', async () => {
    const { arrive, onCommit } = mount()
    const box = await ready()
    type(box, ' and more')
    leave(box)
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    enter(box)
    // The page catches up with your save: exactly what was saved, read back from the relay.
    arrive(onCommit.mock.calls[0][0])
    await act(async () => {})
    expect(screen.queryByText(/saved a newer version/)).toBeNull()
    expect(text()).toBe('mine and more')
  })
})
