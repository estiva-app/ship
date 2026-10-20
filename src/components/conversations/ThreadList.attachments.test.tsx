// Moved from src/components/ConversationThread.attachments.test.tsx
/**
 * A file on a message reaches the screen — CON-12, SHI-1's screenshot half.
 *
 * Three separate claims, and this file is about the middle one:
 *
 *   - `scripts/attachments.test.ts` — `imeta` folds into an index.
 *   - **here** — `threadFor` carries that index onto the message, and
 *     the thread list draws it.
 *   - `ui/Attachment.test.tsx` — the component's own states.
 *
 * The middle one is the one that has broken before. Peek's reply reactions had
 * a complete, tested persistence path and a caller that dropped two arguments
 * on the way in, so nothing about the fold or the component said anything was
 * wrong. A fold wired to nothing renders exactly like a message with no files.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { Imeta } from '@estiva-app/protocol'

const blobObjectUrl = vi.fn(async (_url: string) => 'blob:fake')
// `uploadAttachment` too: the writing box above the list takes it as its default upload.
vi.mock('@/api/blobs', () => ({ blobObjectUrl: (url: string) => blobObjectUrl(url), uploadAttachment: vi.fn() }))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { ThreadListView } from './ThreadList'
import type { MessageData } from '@/components/ConversationThread'
import { threadFor } from '@/pages/ProjectPage'

const SHA = 'a'.repeat(64)
const BOB = 'b'.repeat(64)

const file: Imeta = { url: `https://buzz.estiva.app/media/${SHA}.jpg`, m: 'image/jpeg', x: SHA, size: 900, filename: 'shot.jpg' }

const directory = {
  directory: {} as never,
  nameOf: () => 'Bob',
  personOf: () => ({ name: 'Bob' }),
  profileOf: () => undefined,
}

const message = (id: string) => ({
  id,
  author: BOB,
  createdAt: 1000,
  body: 'look at this',
  folder: 'f1',
  about: [],
})

const conversation = (id: string, replyId?: string) => ({
  id,
  root: message(id),
  replies: replyId ? [{ ...message(replyId), rootId: id, parentId: id }] : [],
  about: [],
  createdAt: 1000,
  lastAt: 1000,
})

describe('threadFor', () => {
  it('carries a message’s files from the index onto the card’s data', () => {
    const thread = threadFor(conversation('m1'), directory as never, undefined, undefined, undefined, { m1: [file] })
    expect(thread.root.files).toEqual([file])
  })

  /* A reply is a message too, and Peek attaches to replies. Handling only the
     root would drop half the attachments in a thread with no error anywhere. */
  it('carries them onto replies as well as roots', () => {
    const thread = threadFor(conversation('m1', 'r1'), directory as never, undefined, undefined, undefined, { r1: [file] })
    expect(thread.root.files).toBeUndefined()
    expect(thread.replies[0].files).toEqual([file])
  })

  /* The index is optional and nearly every message is absent from it. Reading
     it must not turn "no files" into an empty array the card then draws a row
     for. */
  it('leaves a message with no files undefined', () => {
    const thread = threadFor(conversation('m1'), directory as never, undefined, undefined, undefined, {})
    expect(thread.root.files).toBeUndefined()
    expect(threadFor(conversation('m1'), directory as never).root.files).toBeUndefined()
  })

  /* The same wiring for the cards a message asks for (SPEC §13.6.2, OPT-16), the last argument. */
  it('carries a message’s cards from the index onto roots and replies', () => {
    const card = { value: `30851:${SHA}:f78c3b96-2a3b-4d92-910a-ac25aba672cd`, layout: 'compact' as const }
    const thread = threadFor(conversation('m1', 'r1'), directory as never, undefined, undefined, undefined, undefined, undefined, undefined, { m1: [card], r1: [card] })
    expect(thread.root.embeds).toEqual([card])
    expect(thread.replies[0].embeds).toEqual([card])
  })
})

/* `MessageCard` is gone: a message is drawn inside the thread list, so it is
   handed to the list as a thread's first message. */
const show = (root: MessageData) =>
  render(<ThreadListView threads={[{ id: root.id, root, replies: [] }]} onStart={async () => true} onReply={async () => true} />).container

describe('a message in the thread list', () => {
  it('draws the file the thread handed it', async () => {
    const c = show({ id: 'm1', author: { name: 'Bob' }, at: 1000, body: 'look at this', by: BOB, files: [file] })
    await waitFor(() => expect(c.querySelector('[data-attachment="image"]')).toBeTruthy())
  })

  it('draws no attachment row at all for a message without one', () => {
    const c = show({ id: 'm1', author: { name: 'Bob' }, at: 1000, body: 'plain', by: BOB })
    expect(c.querySelector('[data-attachment]')).toBeNull()
  })
})
