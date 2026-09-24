/**
 * A refused save says so — UIG-14 C6.
 *
 * The line "Could not save. Your text is still here." was driven by a ref, and
 * setting a ref re-renders nothing: after a refused save the editor stayed open
 * with the text, as it should, and said nothing about why. These pin that the
 * line appears when the save is refused, and goes when the next save succeeds
 * or the edit is left. `onLeave` is a mock here, so the surface stays mounted
 * and the line's going is the component's own doing, not its parent's.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/api/blobs', () => ({
  blobObjectUrl: vi.fn(async () => 'blob:fetched'),
  uploadAttachment: vi.fn(),
}))

import DescriptionEditing from './DescriptionEditing'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them on every document change. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const REFUSED = 'Could not save. Your text is still here.'

const editing = (onCommit: () => boolean | Promise<boolean>) => {
  const onLeave = vi.fn()
  render(<DescriptionEditing value="a description" format="marker" onCommit={onCommit} onLeave={onLeave} resolved={{}} />)
  return { onLeave, textbox: screen.getByRole('textbox', { name: 'Description' }) }
}

describe('a description whose save is refused', () => {
  it('says it could not save, and keeps the editor open', async () => {
    const onCommit = vi.fn(() => false)
    const { onLeave, textbox } = editing(onCommit)
    fireEvent.blur(textbox)
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
    expect(await screen.findByText(REFUSED)).toHaveAttribute('role', 'alert')
    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
  })

  it('stops saying so when the next save succeeds', async () => {
    const onCommit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { onLeave, textbox } = editing(onCommit)
    fireEvent.blur(textbox)
    await screen.findByText(REFUSED)
    fireEvent.blur(textbox)
    await waitFor(() => expect(onLeave).toHaveBeenCalled())
    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(REFUSED)).toBeNull()
  })

  it('stops saying so when the edit is left', async () => {
    const onCommit = vi.fn(() => false)
    const { onLeave, textbox } = editing(onCommit)
    fireEvent.blur(textbox)
    await screen.findByText(REFUSED)
    // Escape leaves without saving.
    fireEvent.keyDown(textbox, { key: 'Escape' })
    await waitFor(() => expect(onLeave).toHaveBeenCalled())
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(REFUSED)).toBeNull()
  })
})
