// Moved from src/components/ConversationThread.edit.test.tsx
/**
 * Editing a comment — CON-4.
 *
 * Two claims: an edit is offered where the relay may accept it, and an edited
 * message **says so**.
 *
 * The relay takes an edit from the target's effective author or the NIP-OA
 * owner of an authoring agent (`validate_edit_ownership`), and no client can
 * evaluate the second half. SPEC §6.5 as decided 2026-10-06 (SHI-29): offered
 * only on the viewer's own message — not on another person's or an agent's,
 * where everybody but the owner met an Edit the relay refused.
 * `offersEditAndDelete` in `@estiva-app/conversation` is the rule.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { encodeNevent, encodeNpub, type Imeta } from '@estiva-app/protocol'

// The edit box uploads through Ship's own upload, which needs a relay; a test answers for it.
vi.mock('@/api/blobs', async (original) => ({ ...(await original<typeof import('@/api/blobs')>()), uploadAttachment: vi.fn() }))
// What a reference in the box names: the message the SHI-49 test quotes, nothing else; the lookup itself is `useForeignObjects`'.
const QUOTED_ID = 'f'.repeat(64)
vi.mock('@/api/foreign', async (original) => ({
  ...(await original<typeof import('@/api/foreign')>()),
  resolveForeign: vi.fn(async (reference: string) =>
    reference.startsWith('nostr:nevent1')
      ? { ref: QUOTED_ID, eventId: QUOTED_ID, kind: 9, widget: 'message', appName: 'Peek', openUrl: 'https://peek.estiva.app/o/x', slots: { title: { value: 'a'.repeat(64), isPubkey: true }, body: { value: 'The key is rotated.' } }, people: { ['a'.repeat(64)]: { displayName: 'Ann Lee' } }, meta: [], comments: [], actions: [], viaRecommendation: true }
      : null,
  ),
}))

import { uploadAttachment } from '@/api/blobs'
import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { ThreadListViewProps } from './shared'

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them when it scrolls the caret into view — the
   edit box focuses itself at the end of the text. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const AGENT = 'b'.repeat(64)

const thread: ThreadData = {
  id: 'root-1',
  root: { id: 'root-1', author: { name: 'Claude (steered by Miky)' }, at: 1_756_000_000, body: 'Blocked on the Stripe key.', by: AGENT },
  replies: [],
}

/** The agent viewing its own message. */
function open(props: Partial<ThreadListViewProps> = {}) {
  return render(<ThreadListView threads={[thread]} onStart={async () => true} onReply={async () => true} viewer={AGENT} {...props} />)
}

type EditorBox = HTMLElement & { editor: Editor }

/* The edit box is the writing box, loaded on first use: `findBy`, then wait for
   its editor to be made before typing into it. */
const openEditor = async () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Message actions' })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
  const box = (await screen.findByRole('textbox', { name: 'Edit message' })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}
/* The field is a ProseMirror editor: its whole text is replaced through the
   editor's own commands (jsdom cannot type into a contenteditable). */
const replace = (box: EditorBox, text: string) =>
  act(() => void box.editor.chain().selectAll().insertContent({ type: 'text', text }).run())
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement

describe('the edit control', () => {
  const HUMAN = 'c'.repeat(64)
  const as = (author: ThreadData['root']['author'], by: string): ThreadData => ({ ...thread, root: { ...thread.root, author, by } })
  const menuOffered = () => screen.queryAllByRole('button', { name: 'Message actions' }).length > 0

  it('is not offered on an agent’s message, even to a viewer who may own it (SHI-29)', () => {
    render(<ThreadListView threads={[as({ name: 'Claude', bot: true }, AGENT)]} onStart={async () => true} onReply={async () => true} viewer={HUMAN} onEditMessage={vi.fn()} onDeleteMessage={vi.fn()} />)
    expect(menuOffered()).toBe(false)
  })

  it('is not offered on another human’s message, which the relay refuses every time', () => {
    render(<ThreadListView threads={[as({ name: 'Somebody', bot: false }, AGENT)]} onStart={async () => true} onReply={async () => true} viewer={HUMAN} onEditMessage={vi.fn()} onDeleteMessage={vi.fn()} />)
    expect(menuOffered()).toBe(false)
  })

  it('is offered on the viewer’s own message', () => {
    render(<ThreadListView threads={[as({ name: 'Me', bot: false }, HUMAN)]} onStart={async () => true} onReply={async () => true} viewer={HUMAN} onEditMessage={vi.fn()} />)
    expect(menuOffered()).toBe(true)
  })

  it('is offered on nothing when nobody is signed in', () => {
    open({ onEditMessage: vi.fn(), viewer: undefined })
    expect(menuOffered()).toBe(false)
  })

  it('is absent, not disabled, where nobody may write', () => {
    open()
    expect(screen.queryAllByRole('button', { name: 'Message actions' })).toHaveLength(0)
  })

  /* A message is marker text (SPEC §13.2), so what is edited is the text that
     was published — not a rich document that would round-trip lossily. */
  // Changed on purpose: the edit box is the rich writing box, which starts from the marker text through the block
  // bridge and publishes marker text again; the text it opens with is its text content, not a textarea's value.
  it('opens with the current text, as text', async () => {
    open({ onEditMessage: vi.fn() })
    const box = await openEditor()
    expect(box.textContent).toBe('Blocked on the Stripe key.')
  })

  it('publishes the new body for the message being edited', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ onEditMessage })
    const box = await openEditor()
    replace(box, 'Key is in 1Password.')
    fireEvent.click(save())
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Key is in 1Password.', undefined, [], undefined))
  })

  /* The package Form (UIG-7): the keys every form has. Enter in the text is a
     new line; Ctrl+Enter saves, as Save does. */
  // Changed on purpose: the edit box is the writing box, whose keys are the same in every kind — Enter and
  // Ctrl+Enter save, and Shift+Enter is the new line (a new block, as a document has it).
  it('saves on Ctrl+Enter, and Shift+Enter in the text is a new line', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ onEditMessage })
    const box = await openEditor()
    replace(box, 'Key is in 1Password.')
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(box.querySelectorAll('p')).toHaveLength(2)
    expect(onEditMessage).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Key is in 1Password.', undefined, [], undefined))
  })

  /* Nothing to publish, and a no-op edit would still cost an event that every
     reader has to fold. Changed on purpose (COMM-7): the shared box's Save is
     always enabled, so an unchanged Save closes with nothing published. */
  it('publishes nothing for an unchanged body, and closes', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ onEditMessage })
    await openEditor()
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull())
    expect(onEditMessage).not.toHaveBeenCalled()
  })

  it('will not save an empty one, and says so under the box', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ onEditMessage })
    const box = await openEditor()
    replace(box, '   ')
    fireEvent.click(save())
    expect(await screen.findByText(/Not saved: a message needs words; Delete removes it/)).toBeInTheDocument()
    expect(onEditMessage).not.toHaveBeenCalled()
  })

  /* The refusal path. Closing would throw away what was typed to no purpose —
     the same rule the composer and the delete dialog keep. The relay's words go
     under the box, not in a toast (Decided 2026-10-17). */
  it('stays open when the relay refuses, with the words still in it and why under it', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => 'blocked: not your message')
    open({ onEditMessage })
    const box = await openEditor()
    replace(box, 'a change')
    fireEvent.click(save())
    await waitFor(() => expect(onEditMessage).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: 'Edit message' }).textContent).toBe('a change')
    expect(await screen.findByText(/Not saved: blocked: not your message/)).toBeInTheDocument()
  })

  /* SHI-49: the edit box showed a message reference as "nevent1…" and a person as "npub1…". Changed on purpose (Katerina,
     30 Oct, widget review 16): a message `[` knows draws as the kit's chip, its writer and words, not the caption it was picked with. */
  it('opens a message reference and a person as chips, not as their nostr: text', async () => {
    const ANN = 'a'.repeat(64)
    const quoted: ThreadData = { id: 'f'.repeat(64), root: { id: 'f'.repeat(64), author: { name: 'Ann' }, at: 1_756_000_000, body: 'The key is rotated.', by: ANN }, replies: [] }
    const body = `See nostr:${encodeNevent({ id: 'f'.repeat(64), relays: [] })} and ask nostr:${encodeNpub(ANN)}`
    open({ onEditMessage: vi.fn(async (): Promise<true | string> => true), threads: [{ ...thread, root: { ...thread.root, body } }, quoted], nameOf: (pubkey) => (pubkey === ANN ? 'Ann Lee' : 'Someone') })
    const box = await openEditor()
    expect(box.textContent).not.toMatch(/nevent1|npub1|nostr:/)
    await waitFor(() => expect(box.textContent).toContain('The key is rotated.'))
    expect(box.textContent).toContain('Ann Lee')
  })

  it('closes once the relay took it', async () => {
    open({ onEditMessage: vi.fn(async (): Promise<true | string> => true) })
    const box = await openEditor()
    replace(box, 'a change')
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull())
  })

  it('abandons on Cancel without publishing', async () => {
    const onEditMessage = vi.fn()
    open({ onEditMessage })
    const box = await openEditor()
    replace(box, 'never mind')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onEditMessage).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull()
  })
})

/*
  A file added or taken off while editing (Miky, 26 Oct, PEEKM-4): the save
  writes the whole set, so the box offers it. The write itself — a 40003 with
  the set as `imeta` — is `scripts/attachments.test.ts`.
*/
describe('the files of a message being edited', () => {
  const SHA = 'a'.repeat(64)
  const NEW = 'c'.repeat(64)
  const kept: Imeta = { url: `/media/${SHA}.pdf`, m: 'application/pdf', x: SHA, size: 900, filename: 'brief.pdf' }
  const added: Imeta = { url: `/media/${NEW}.txt`, m: 'text/plain', x: NEW, size: 1, filename: 'notes.txt' }
  const withFile: ThreadData = { ...thread, root: { ...thread.root, files: [kept] } }
  // The edit box's own picker (what `/` → Upload opens), not the writing box's under the list.
  const picker = () =>
    [...document.querySelectorAll('input[type="file"]')].find((input) => input.parentElement?.querySelector('[aria-label="Edit message"]')) as HTMLInputElement

  it('shows the message’s own, and saves one added with them, the whole set', async () => {
    vi.mocked(uploadAttachment).mockResolvedValue(added)
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ threads: [withFile], onEditMessage })
    await openEditor()
    expect(screen.getByText('brief.pdf')).toBeTruthy()
    await act(async () => void fireEvent.change(picker(), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } }))
    await screen.findByText('notes.txt')
    await waitFor(() => expect(save().disabled).toBe(false))
    fireEvent.click(save())
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Blocked on the Stripe key.', undefined, [kept, added], undefined))
  })

  it('lists the files again on an edit that did not touch them, since an edit is the whole new message', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ threads: [withFile], onEditMessage })
    const box = await openEditor()
    replace(box, 'Key is in 1Password.')
    fireEvent.click(save())
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Key is in 1Password.', undefined, [kept], undefined))
  })

  it('takes the last one off: the edit saves with no files (SPEC §6.8)', async () => {
    const onEditMessage = vi.fn(async (): Promise<true | string> => true)
    open({ threads: [withFile], onEditMessage })
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /Remove brief\.pdf/ }))
    fireEvent.click(save())
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Blocked on the Stripe key.', undefined, [], undefined))
    expect(screen.queryByText(/cannot be taken off/)).toBeNull()
  })
})

describe('an edited message', () => {
  /*
    RFC 0.4 §7.2.1 makes this a MUST. The original event is immutable and still
    on the relay, so a body that quietly changed leaves two readers disagreeing
    with nothing to tell them which is current.
  */
  // Changed on purpose: the word is drawn in brackets beside the time, "(edited)", rather than "· edited".
  it('says it was edited', () => {
    open({ threads: [{ ...thread, root: { ...thread.root, body: 'Key is in 1Password.', editedAt: 1_756_000_400 } }] })
    expect(screen.getByText('(edited)')).toBeTruthy()
    expect(screen.getByText('Key is in 1Password.')).toBeTruthy()
  })

  it('says nothing when it was not edited', () => {
    open()
    expect(screen.queryByText(/edited/)).toBeNull()
  })
})
