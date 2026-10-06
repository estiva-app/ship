// Moved from src/components/Composer.drafts.test.tsx
/**
 * The writing box keeps and forgets a draft — CON-10.
 *
 * `drafts.test.ts` asserts the store is right. This asserts the box *uses*
 * it, which is a different claim and the one PEE-7 is about: the text is held
 * in memory and not keyed by destination, so it survives a navigation it should
 * not and is lost on one it should survive.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { MessageBox } from './MessageBox'
import { createDraftStore, draftKeys } from '@/lib/drafts'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them when it scrolls the caret into view. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage
}

const textbox = () => screen.getByRole('textbox') as HTMLElement & { editor: Editor }
/* The editor seeds itself from the draft once it is created, a tick after the
   first render; a person cannot type sooner, so neither does a test. */
const ready = () => vi.waitFor(() => expect(textbox().editor.isInitialized).toBe(true))
/* The field is a ProseMirror editor: text goes in through its own command
   (jsdom cannot type into a contenteditable), and what it holds is its text. */
const type = (value: string) => act(() => void textbox().editor.commands.insertContent(value))
/* Enter sends, as a submit of the old field's form did. */
const submit = () => fireEvent.keyDown(textbox(), { key: 'Enter' })

describe('a writing box with a draft key', () => {
  it('keeps what was typed, and hands it back on the way in', async () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.thread('t1')
    const { unmount } = render(<MessageBox onSubmit={() => {}} draftKey={key} drafts={drafts} />)
    await ready()
    type('half a thought')
    unmount()

    render(<MessageBox onSubmit={() => {}} draftKey={key} drafts={drafts} />)
    // The editor is seeded from the draft once it exists, a tick after the first render.
    await vi.waitFor(() => expect(textbox()).toHaveTextContent('half a thought'))
  })

  /*
    CON-31: `!@Bob please sign`, left and come back to. The marker text of an
    urgent mention with a key is the same `nostr:npub…` as an ordinary one —
    the urgency is a tag (§13.1) — so the draft keeps whom it named urgently.
  */
  it('keeps an urgent mention urgent: typed, left, restored and sent', async () => {
    const BOB = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0'
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.thread('t1')
    const { unmount } = render(<MessageBox onSubmit={() => {}} draftKey={key} drafts={drafts} />)
    await ready()
    act(() => void textbox().editor.commands.insertContent([{ type: 'urgentMention', attrs: { id: 'bob', label: 'Bob', pubkey: BOB } }, { type: 'text', text: ' please sign' }]))
    expect(drafts.readDraft(key)?.urgent).toEqual([BOB])
    unmount()

    const onSubmit = vi.fn(() => true)
    const { container } = render(<MessageBox onSubmit={onSubmit} draftKey={key} drafts={drafts} />)
    await vi.waitFor(() => expect(textbox()).toHaveTextContent('please sign'))
    expect(container.querySelector('[data-urgent-mention]')).not.toBeNull()
    submit()
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]).toEqual([expect.any(String), [], { urgent: [BOB] }])
  })

  /*
    PEE-7's first symptom: "you start typing and you switch to a different
    topic, the text is kept there, which is weird". The component is reused as a
    list re-renders, so the destination changing is a prop change, not a mount.
  */
  it('does not carry text into a different destination', async () => {
    const drafts = createDraftStore(memoryStorage())
    const { rerender } = render(
      <MessageBox onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />,
    )
    await ready()
    type('meant for t1')
    rerender(<MessageBox onSubmit={() => {}} draftKey={draftKeys.thread('t2')} drafts={drafts} />)
    await vi.waitFor(() => expect(textbox()).toHaveTextContent(/^$/))
  })

  /* And back again: the second symptom, the draft being gone on return. */
  it('brings the text back when the destination returns', async () => {
    const drafts = createDraftStore(memoryStorage())
    const { rerender } = render(
      <MessageBox onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />,
    )
    await ready()
    type('meant for t1')
    rerender(<MessageBox onSubmit={() => {}} draftKey={draftKeys.thread('t2')} drafts={drafts} />)
    await vi.waitFor(() => expect(textbox()).toHaveTextContent(/^$/))
    rerender(<MessageBox onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />)
    await vi.waitFor(() => expect(textbox()).toHaveTextContent('meant for t1'))
  })

  it('forgets the draft once the relay took the message', async () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.object('30851:a:one')
    render(<MessageBox onSubmit={() => true} draftKey={key} drafts={drafts} />)
    await ready()
    type('about to send')
    submit()
    await vi.waitFor(() => expect(drafts.read(key)).toBeUndefined())
  })

  /*
    The case that matters more than the happy one. A refused publish must keep
    the text — losing a draft to a rejection is worse than never having had one,
    and `act` resolves false for exactly that.
  */
  it('keeps the draft when the send was refused', async () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.object('30851:a:one')
    const onSubmit = vi.fn(() => false)
    render(<MessageBox onSubmit={onSubmit} draftKey={key} drafts={drafts} />)
    await ready()
    type('the relay will refuse this')
    submit()
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await vi.waitFor(() => expect(textbox()).toHaveTextContent('the relay will refuse this'))
    expect(drafts.read(key)).toBe('the relay will refuse this')
  })

  /* No key means no stable destination, so nothing is kept — a draft that
     cannot be keyed correctly is worse than none. */
  it('keeps nothing when it has no key', async () => {
    const drafts = createDraftStore(memoryStorage())
    const { unmount } = render(<MessageBox onSubmit={() => {}} drafts={drafts} />)
    await ready()
    type('nowhere to put this')
    unmount()
    render(<MessageBox onSubmit={() => {}} drafts={drafts} />)
    await ready()
    expect(textbox()).toHaveTextContent(/^$/)
  })
})
