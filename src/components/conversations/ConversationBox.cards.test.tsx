/**
 * The card in the box (COMM-8), read as the message will be sent: an edit box
 * shows one too, for a file the edit names first, and its ✕ leaves it off the
 * save (Katerina, 30 Oct, item 37); a "Mentioned in" reply box shows none for
 * the thread's own file, which a reply never sends (item 49).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { addrToNaddr } from '@estiva-app/protocol'

const ISSUE_PK = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
const FIRST = `30851:${ISSUE_PK}:a0b27d90-d5b9-40e7-8078-865ab36a421c`
const OTHER = `30851:${ISSUE_PK}:c0b27d90-d5b9-40e7-8078-865ab36a421c`
const THREAD_FILE = `30851:${ISSUE_PK}:e0b27d90-d5b9-40e7-8078-865ab36a421c`
const ref = (address: string) => `nostr:${addrToNaddr(address, [])}`

const object = (address: string, title: string) => ({
  ref: address,
  address,
  eventId: 'e'.repeat(64),
  kind: 30851,
  widget: 'row',
  appName: 'Ship',
  slots: { title: { value: title } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
})
const TITLES: Record<string, string> = { [FIRST]: 'Named first', [OTHER]: 'Another issue', [THREAD_FILE]: 'The thread’s own' }

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async (reference: string) => {
    const address = Object.keys(TITLES).find((one) => ref(one) === reference)
    return (address ? object(address, TITLES[address]) : null) as never
  }),
}))
vi.mock('@/api/useCardConversation', () => ({ useCardConversation: () => undefined }))

import { MentionListView, ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

/* ProseMirror asks for rects jsdom does not draw, as `ThreadList.edit.test.tsx` says. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const ME = 'b'.repeat(64)
type EditorBox = HTMLElement & { editor: Editor }

const thread = (body: string): ThreadData => ({ id: 'root-1', root: { id: 'root-1', author: { name: 'Me' }, at: 1_756_000_000, body, by: ME }, replies: [] })

/** The box's whole text, replaced through the editor's own commands: jsdom cannot type into a contenteditable. */
const replace = (box: EditorBox, text: string) => act(() => void box.editor.chain().selectAll().insertContent({ type: 'text', text }).run())
const ready = async (name: string) => {
  const box = (await screen.findByRole('textbox', { name })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}
const inTheBox = () => document.querySelector<HTMLElement>('[data-box-under]')

describe('the edit box', () => {
  const edit = async (body: string) => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    render(<ThreadListView threads={[thread(body)]} onStart={async () => true} onReply={async () => true} viewer={ME} onEditMessage={onEditMessage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
    return { box: await ready('Edit message'), onEditMessage }
  }

  it('shows the card of a file the edit names first', async () => {
    const { box } = await edit('No link yet.')
    replace(box, `See ${ref(FIRST)}`)
    await waitFor(() => expect(inTheBox()?.textContent).toContain('Named first'))
  })

  it('shows none for a file the message already named', async () => {
    const { box } = await edit(`See ${ref(FIRST)}`)
    replace(box, `See ${ref(FIRST)} again`)
    // The box reads on every change, and a card would show at once (loading, then filled): none.
    await act(async () => {})
    expect(inTheBox()).toBeNull()
  })

  it('saves without the card its ✕ took off', async () => {
    const { box, onEditMessage } = await edit('No link yet.')
    const text = `See ${ref(FIRST)}`
    replace(box, text)
    await waitFor(() => expect(inTheBox()?.textContent).toContain('Named first'))
    fireEvent.click(within(inTheBox()!).getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', text, undefined, [], FIRST))
  })
})

describe('a "Mentioned in" reply box', () => {
  const replyBox = async () => {
    render(<MentionListView items={[{ thread: thread('Over here.'), relation: 'mention', file: THREAD_FILE }]} onReply={async () => true} viewer={ME} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    return ready('Reply…')
  }

  it('shows no card for the thread’s own file, which a reply never sends', async () => {
    const box = await replyBox()
    replace(box, `See ${ref(THREAD_FILE)}`)
    await act(async () => {})
    expect(inTheBox()).toBeNull()
  })

  it('shows the card of another file', async () => {
    const box = await replyBox()
    replace(box, `See ${ref(OTHER)}`)
    await waitFor(() => expect(inTheBox()?.textContent).toContain('Another issue'))
  })
})
