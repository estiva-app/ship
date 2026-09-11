/**
 * Attaching a file to a description — SHI-2.
 *
 * The behaviour under test is the one that is easy to get wrong and invisible
 * when you do: **this editor commits on blur.** A control that took focus would
 * save and close the description the moment it was pressed, and the file would
 * arrive with nowhere to go. So the paperclip must not take focus, and the
 * assertion for that is that `onCommit` has not fired.
 *
 * The upload is injected, so none of this needs a relay.
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

const SHA = 'f'.repeat(64)
const META = { url: `/media/${SHA}.png`, m: 'image/png', x: SHA, size: 12, filename: 'shot.png' }

const pick = (container: HTMLElement, name = 'shot.png') =>
  fireEvent.change(container.querySelector('[data-description="picker"]')!, {
    target: { files: [new File(['x'], name, { type: 'image/png' })] },
  })

const editing = (overrides: Partial<Parameters<typeof DescriptionEditing>[0]> = {}) => {
  const onCommit = vi.fn(() => true)
  const upload = vi.fn(async () => META)
  const container = render(
    <DescriptionEditing
      value="a description"
      format="marker"
      onCommit={onCommit}
      onLeave={vi.fn()}
      resolved={{}}
      upload={upload}
      {...overrides}
    />,
  ).container
  return { container, onCommit, upload }
}

describe('the paperclip in a description', () => {
  it('uploads the chosen file and puts it in the document', async () => {
    const { container, onCommit, upload } = editing()
    pick(container)
    await waitFor(() => expect(upload).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('[data-attachment]')).not.toBeNull())
    // The insert is an edit, not a save: nothing is published until the editor
    // is left, exactly as typing a word is.
    expect(onCommit).not.toHaveBeenCalled()
  })

  /*
    The whole reason the control is built the way it is. `onMouseDown` is
    prevented so focus stays in ProseMirror; without that the button steals it,
    the editor blurs, `finish` runs, and the description closes under the person
    before the file picker has even opened.
  */
  it('does not commit the description when pressed', () => {
    const { onCommit } = editing()
    const paperclip = screen.getByRole('button', { name: 'Attach a file to the description' })
    const prevented = !fireEvent.mouseDown(paperclip)
    expect(prevented, 'mousedown must be prevented or the editor commits').toBe(true)
    expect(onCommit).not.toHaveBeenCalled()
  })

  /*
    The bug SHI-2 shipped with, and the reason the first version of these tests
    proved the wrong half.

    A native file dialog takes focus off the page and the browser fires `blur`
    on the editor. This surface commits on blur — so the description saved and
    closed while the person was still choosing a file, and the upload resolved
    into an unmounted editor. Production showed three description changes in
    twenty-five seconds, none carrying an attachment.

    `preventDefault` on mousedown does not help: it stops the *button* taking
    focus, and it is the *dialog* that takes it. A Playwright repro cannot see
    it either — it intercepts the file chooser, so no native dialog opens.
    Which leaves this: press the paperclip, then blur the way a dialog would.
  */
  it('does not commit when the file dialog takes focus away', async () => {
    const { onCommit } = editing()
    fireEvent.click(screen.getByRole('button', { name: 'Attach a file to the description' }))
    fireEvent.blur(screen.getByRole('textbox', { name: 'Description' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument())
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits on an ordinary blur, once the dialog is done with', async () => {
    const { onCommit } = editing()
    fireEvent.blur(screen.getByRole('textbox', { name: 'Description' }))
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
  })

  it('says why an upload was refused, and attaches nothing', async () => {
    const upload = vi.fn(async () => {
      throw new Error('media contains metadata or a non-canonical metadata channel')
    })
    const { container } = editing({ upload })
    pick(container)
    expect(await screen.findByRole('alert')).toHaveTextContent('non-canonical metadata channel')
    expect(container.querySelector('[data-attachment]')).toBeNull()
  })
})
