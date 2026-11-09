// Moved from src/components/ConversationThread.references.test.tsx
/**
 * A comment shows the object it points at — SHI-1.
 *
 * Katerina's report was *"screenshots and reference widgets aren't rendered in
 * conversation or replies. Avatar + name + timestamp only."* Descriptions had
 * had this since PRO-7 and RIC-10 and conversations had never been given it, so
 * the assertions here are the ones `LiveHeader.test.tsx` already makes, on the
 * surface that lacked them.
 *
 * The failing case worth naming: `startConversation` appends the issue's
 * pointer as its own paragraph, and the caller used to delete **every** pointer
 * from a body before drawing it. A comment whose entire content was a pointer
 * at some *other* object therefore rendered as an empty paragraph under a name
 * and a time — which is exactly what the report describes.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

// Only the network call is stubbed. Resolving nothing is a real answer, and it
// is the one that isolates "which text reached the screen" from "what the relay
// happened to hold" — the same stub `LiveHeader.test.tsx` uses.
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const NADDR =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'

/** The address that pointer decodes to — the object a page carrying it would be. */
const ADDR = '30851:b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3:a742e679-ca8c-488e-8d60-9836cc81bde2'

const thread = (body: string, replyBody?: string): ThreadData => ({
  id: 't1',
  root: { id: 't1', author: { name: 'Bob' }, at: 1000, body, by: 'bob' },
  replies: replyBody ? [{ id: 'r1', author: { name: 'Ann' }, at: 2000, body: replyBody, by: 'ann' }] : [],
})

const noop = async (): Promise<true> => true
const show = (t: ThreadData) => render(<ThreadList threads={[t]} onStart={noop} onReply={noop} />).container

describe('a comment that points at an object', () => {
  it('draws a mid-sentence pointer in place, keeping the sentence', async () => {
    const c = show(thread(`Fixed in ${NADDR} yesterday.`))
    // Nothing resolves here: the chip says so in its type's word (Miky, 15 Oct), inside the sentence.
    // Changed on purpose: kit 0.103.0 (a chip says what a row and a card say, "You can't open this issue", not "Issue not available").
    await waitFor(() => expect(c.querySelector('[data-message-text] p')?.textContent).toBe("Fixed in You can't open this issue yesterday."))
    // Never the 200-character pointer the author typed.
    expect(c.textContent).not.toContain(NADDR)
  })

  /*
    The regression SHI-1 actually was. A body that is nothing but a pointer used
    to reach `MessageCard` as an empty string, so the card drew a name, a time
    and a blank line. §13.1 — never blank — is why the line still says what it
    pointed at when the object cannot be read: alone on its line, its row.
  */
  it('does not render a pointer-only body as an empty message', async () => {
    const c = show(thread(NADDR))
    await waitFor(() => expect(c.querySelector('[data-link-row]')?.textContent).toBe("You can't open this issue"))
    expect(c.textContent).not.toContain(NADDR)
  })

  // Replies wait behind the kit's replies row, so the thread is opened first.
  it('renders a pointer in a reply, not only in the root', async () => {
    const c = show(thread('Have a look at this.', `Here: ${NADDR}`))
    fireEvent.click(screen.getByRole('button', { name: '1 reply, open the thread' }))
    // Changed on purpose: kit 0.103.0 (a chip says what a row and a card say, "You can't open this issue", not "Issue not available").
    await waitFor(() => expect(c.querySelector('[data-reply-id="r1"] [data-message-text]')?.textContent).toBe("Here: You can't open this issue"))
    expect(c.textContent?.match(/can't open/g)).toHaveLength(1)
  })

  /*
    The marker dialect, on the surface that never parsed it. 41% of production
    message bodies carry markers, and every one of them used to reach the screen
    as literal asterisks and backticks.
  */
  it('draws the marker dialect rather than its punctuation', () => {
    const c = show(thread('That is **load-bearing**.'))
    expect(c.querySelector('strong')?.textContent).toBe('load-bearing')
    expect(c.textContent).not.toContain('**')
  })

  /* §13.5: the body is other people's text and is never markup. */
  it('renders a typed HTML tag as text', () => {
    const c = show(thread('<b>not bold</b>'))
    expect(c.querySelector('b')).toBeNull()
    expect(screen.getByText(/not bold/)).toBeTruthy()
  })
})

/*
  ONE-11 (Miky, 2026-11-09): a line that is only a link to the file a comment is
  on draws nothing, in every app — the line Ship appended to every issue comment.
*/
describe('a comment’s line that only links the file it is on', () => {
  const on = (address: string, body: string): ThreadData => ({
    id: 't1',
    root: { id: 't1', author: { name: 'Bob' }, at: 1000, body, by: 'bob', event: { id: 't1', pubkey: 'b'.repeat(64), created_at: 1, kind: 1111, tags: [['A', address], ['K', '30851']], content: body, sig: '' } },
    replies: [],
  })

  it('draws nothing, leaving the comment’s words', async () => {
    const c = show(on(ADDR, `Looks right.\n\n${NADDR}`))
    await waitFor(() => expect(c.querySelector('[data-message-text]')?.textContent).toBe('Looks right.'))
    // Not the issue's row under the words either: what Peek and Leaf drew before ONE-11.
    expect(c.querySelector('[data-link-row]')).toBeNull()
    expect(c.textContent).not.toContain("can't open")
  })

  it('is still the other file’s row on a comment on another file', async () => {
    const c = show(on(`${ADDR}-other`, `Looks right.\n\n${NADDR}`))
    await waitFor(() => expect(c.querySelector('[data-link-row]')?.textContent).toBe("You can't open this issue"))
  })

  it('keeps a link to it written inside a sentence', async () => {
    const c = show(on(ADDR, `Same as ${NADDR} then.`))
    await waitFor(() => expect(c.querySelector('[data-message-text] p')?.textContent).toBe("Same as You can't open this issue then."))
  })

  /* Editing an old comment must not hand the author back the line Ship used to
     append, or saving would keep it. jsdom has no client rects on text, and the
     edit box (ProseMirror) asks for them when it scrolls its caret into view. */
  it('is not in the edit box, nor in what saving an edit publishes', async () => {
    const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
    const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
      proto.getClientRects = rects
      proto.getBoundingClientRect = empty
    }
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    render(<ThreadList threads={[on(ADDR, `Looks right.\n\n${NADDR}`)]} onStart={noop} onReply={noop} viewer="bob" onEditMessage={onEditMessage} />)
    document.querySelectorAll('[data-comment-body]').forEach((card) => fireEvent.mouseEnter(card))
    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
    type Box = HTMLElement & { editor: { isInitialized: boolean; chain: () => { focus: (at: 'start') => { insertContent: (s: string) => { run: () => boolean } } } } }
    const box = (await screen.findByRole('textbox', { name: 'Edit message' })) as Box
    await waitFor(() => expect(box.editor.isInitialized).toBe(true))
    expect(box.textContent).toBe('Looks right.')
    // The author adds a word and saves: only their words go out, never the link back to the issue.
    act(() => void box.editor.chain().focus('start').insertContent('Yes. ').run())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('t1', 'Yes. Looks right.', undefined, [], undefined))
  })
})
