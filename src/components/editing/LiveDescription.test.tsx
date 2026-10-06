// Moved from src/components/ui/DescriptionEditing.attach.test.tsx and src/components/ui/DescriptionEditing.save.test.tsx
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'

vi.mock('@/api/blobs', () => ({
  blobObjectUrl: vi.fn(async () => 'blob:fetched'),
  uploadAttachment: vi.fn(),
}))

import { LiveDescription } from './LiveDescription'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them on every document change. Nor
   `scrollIntoView`, which the `/` menu calls to keep its highlighted row in view. */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

type EditorBox = HTMLElement & { editor: Editor }
const description = () => screen.getByRole('textbox', { name: 'Description' }) as EditorBox
/* The editor is made a tick after the first render; nothing is typed before it exists. */
const ready = async () => {
  await waitFor(() => expect(description().editor.isInitialized).toBe(true))
  return description()
}
/* jsdom cannot type into a contenteditable: text goes in through the editor's own command, at the end. */
const type = (box: EditorBox, text: string) => act(() => void box.editor.chain().focus('end').insertContent(text).run())

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
 *
 * Changed on purpose (Katerina, 29 September): there is no paperclip. A file is
 * `/` File, a row of the `/` menu, which is chosen inside the editor and so
 * never takes focus from it.
 */
const SHA = 'f'.repeat(64)
const META = { url: `/media/${SHA}.png`, m: 'image/png', x: SHA, size: 12, filename: 'shot.png' }

/* The picker is the package's FilePicker, out of the accessibility tree; it is reached by the element. */
const picker = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement
const pick = (container: HTMLElement, name = 'shot.png') =>
  fireEvent.change(picker(container), {
    target: { files: [new File(['x'], name, { type: 'image/png' })] },
  })

/* `/`, then the File row — chosen the way the menu takes a pointer, on mousedown, so focus stays in the editor. */
const slashFile = async (box: EditorBox) => {
  type(box, ' /')
  fireEvent.mouseDown(await screen.findByRole('option', { name: /File/ }))
}

const editing = (overrides: Partial<Parameters<typeof LiveDescription>[0]> = {}) => {
  const onCommit = vi.fn(() => true)
  const upload = vi.fn(async () => META)
  const container = render(
    <LiveDescription value="a description" format="marker" onCommit={onCommit} resolved={{}} upload={upload} {...overrides} />,
  ).container
  return { container, onCommit, upload }
}

describe('attaching a file to a description', () => {
  it('uploads the chosen file and puts it in the document', async () => {
    const { container, onCommit, upload } = editing()
    await ready()
    pick(container)
    await waitFor(() => expect(upload).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('[data-attachment]')).not.toBeNull())
    // The insert is an edit, not a save: nothing is published until the editor
    // is left, exactly as typing a word is.
    expect(onCommit).not.toHaveBeenCalled()
  })

  /*
    The whole reason the control is built the way it is: pressing it must not
    take focus from ProseMirror, or the editor blurs, saves, and the file
    arrives with nowhere to go.
  */
  // Changed on purpose: the paperclip's prevented mousedown is now `/` File, chosen from inside the editor.
  it('does not commit the description when File is chosen', async () => {
    const { container, onCommit } = editing()
    const box = await ready()
    const opened = vi.spyOn(picker(container), 'click').mockImplementation(() => {})
    await slashFile(box)
    // The file dialog was asked for, and nothing was saved on the way.
    expect(opened).toHaveBeenCalled()
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
    Which leaves this: ask for the file dialog, then blur the way a dialog would.
  */
  // Changed on purpose: something is typed first, because a blur with nothing new is not a save at all now —
  // without it this test would pass whether or not the file dialog is guarded.
  it('does not commit when the file dialog takes focus away', async () => {
    const { container, onCommit } = editing()
    const box = await ready()
    vi.spyOn(picker(container), 'click').mockImplementation(() => {})
    type(box, ' and more')
    await slashFile(box)
    fireEvent.blur(description())
    await waitFor(() => expect(description()).toBeInTheDocument())
    expect(onCommit).not.toHaveBeenCalled()
    // The dialog closing gives focus back to the window; a blur after that is an ordinary one again.
    fireEvent.focus(window)
    fireEvent.blur(description())
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
  })

  // Changed on purpose: only a blur with something new saves (each save is a line in History), so the text changes first.
  it('commits on an ordinary blur, once the dialog is done with', async () => {
    const { onCommit } = editing()
    const box = await ready()
    fireEvent.blur(box)
    expect(onCommit).not.toHaveBeenCalled()
    type(box, ' and more')
    fireEvent.blur(box)
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
  })

  it('says why an upload was refused, and attaches nothing', async () => {
    const upload = vi.fn(async () => {
      throw new Error('media contains metadata or a non-canonical metadata channel')
    })
    const { container } = editing({ upload })
    await ready()
    pick(container)
    expect(await screen.findByRole('alert')).toHaveTextContent('non-canonical metadata channel')
    expect(container.querySelector('[data-attachment]')).toBeNull()
  })
})

/**
 * A refused save says so — UIG-14 C6.
 *
 * The line "Could not save. Your text is still here." was driven by a ref, and
 * setting a ref re-renders nothing: after a refused save the editor stayed open
 * with the text, as it should, and said nothing about why. These pin that the
 * line appears when the save is refused, and goes when the next save succeeds.
 *
 * Changed on purpose: the description is always an editor, so there is no
 * `onLeave` to watch — "keeps the editor open" is the editor still being there
 * with the text in it. And a save needs something new, so each test types first.
 */
const REFUSED = 'Could not save. Your text is still here.'

const refusing = async (onCommit: () => boolean | Promise<boolean>) => {
  render(<LiveDescription value="a description" format="marker" onCommit={onCommit} resolved={{}} />)
  const textbox = await ready()
  type(textbox, ' and more')
  return { textbox }
}

describe('a description whose save is refused', () => {
  it('says it could not save, and keeps the editor open', async () => {
    const onCommit = vi.fn(() => false)
    const { textbox } = await refusing(onCommit)
    fireEvent.blur(textbox)
    await waitFor(() => expect(onCommit).toHaveBeenCalled())
    expect(await screen.findByText(REFUSED)).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveTextContent('a description and more')
  })

  it('stops saying so when the next save succeeds', async () => {
    const onCommit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { textbox } = await refusing(onCommit)
    fireEvent.blur(textbox)
    await screen.findByText(REFUSED)
    fireEvent.blur(textbox)
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(REFUSED)).toBeNull())
  })

  it.todo(
    'stops saying so when the edit is left — no longer applies: there is no leaving without saving; Escape blurs and saves again (Notion’s Esc), and the line stays until a save succeeds or the page is left',
  )

  // Changed on purpose: what Escape does now — it leaves the field and keeps the text, which is a save.
  it('saves again when Escape leaves the field', async () => {
    const onCommit = vi.fn(() => false)
    const { textbox } = await refusing(onCommit)
    fireEvent.blur(textbox)
    await screen.findByText(REFUSED)
    // jsdom does not treat a contenteditable as focusable, so it is given a tab stop to take the focus Escape gives up.
    textbox.tabIndex = -1
    act(() => textbox.focus())
    expect(document.activeElement).toBe(textbox)
    fireEvent.keyDown(textbox, { key: 'Escape' })
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2))
    expect(textbox).toHaveTextContent('a description and more')
  })

  it('closes an open / list on the first Escape and stays in the field; the second leaves (e33e9a4f)', async () => {
    const onCommit = vi.fn(async () => true)
    render(<LiveDescription value="" format="marker" onCommit={onCommit} resolved={{}} />)
    const box = await ready()
    box.tabIndex = -1
    await type(box, '/')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(document.activeElement).toBe(box)
    await act(() => void fireEvent.keyDown(box, { key: 'Escape' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(box)
    await act(() => void fireEvent.keyDown(box, { key: 'Escape' }))
    expect(document.activeElement).not.toBe(box)
  })
})

/*
  A page hands `onCommit` in as an inline arrow (`IssuePage`'s `onDescribe`), so
  every render of the page is a new one. The unmount save was keyed on it, and
  published the half-typed text each time the page re-rendered (MAN-9).
*/
describe('a description being typed while its page re-renders', () => {
  it('publishes nothing until the person leaves', async () => {
    const onCommit = vi.fn(() => true)
    const { rerender } = render(<LiveDescription value="a description" format="marker" onCommit={onCommit} resolved={{}} />)
    type(await ready(), ' and more')
    rerender(<LiveDescription value="a description" format="marker" onCommit={() => true} resolved={{}} />)
    rerender(<LiveDescription value="a description" format="marker" onCommit={onCommit} resolved={{}} />)
    expect(onCommit).not.toHaveBeenCalled()
  })
})
