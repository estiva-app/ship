/**
 * A thread whose comment is gone, as Ship draws it (ONE-9, SPEC §6.4–§6.5): "This comment was deleted." when its
 * author deleted it, "This comment can't be shown." when it was not read and nothing says it was deleted, its replies
 * under it either way, still resolved when its last resolve says so, and no new reply.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { Resolution } from '@/api'
import { createDraftStore, draftKeys } from '@/lib/drafts'

const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const COMMENT = 'c'.repeat(64)
const REPLY = 'd'.repeat(64)

// Its comment was not in the read: the earliest reply stands in for it.
const gone: ThreadData = {
  id: COMMENT,
  root: { id: REPLY, author: { name: 'Ravi' }, at: 1_790_000_100, body: 'The reply stays', by: RAVI },
  replies: [],
  rootMissing: true,
}
const resolution: Resolution = { id: 'e'.repeat(64), action: 'resolved', by: ANA, at: 1_790_000_200, orderMs: 1_790_000_200_000, message: 'Done in the other issue', folder: 'f' }

const noop = async (): Promise<true> => true
const show = (props: Partial<Parameters<typeof ThreadListView>[0]>) =>
  render(<ThreadListView threads={[gone]} onStart={noop} onReply={noop} viewer={RAVI} nameOf={(key) => (key === ANA ? 'Ana' : 'Ravi')} {...props} />)

describe('a thread whose comment was deleted', () => {
  it('stays resolved, with who resolved it and their note, its reply under "This comment was deleted."', () => {
    show({ resolvedBy: { [COMMENT]: resolution }, goneBy: { [COMMENT]: 'deleted' } })
    // Resolved threads wait closed under "Resolved": a closed group draws nothing of them.
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }))
    expect(screen.getByText('This comment was deleted.')).toBeInTheDocument()
    expect(screen.getByText(/Done in the other issue/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('This comment was deleted.'))
    expect(screen.getByText('The reply stays')).toBeInTheDocument()
    // No new reply under a gone comment, and Ship offers no Resolve or Reopen.
    expect(screen.getByText('This thread takes no new replies.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Reply|Resolve|Reopen)$/ })).toBeNull()
  })
})

describe('a comment deleted while a reply to it is being written (ONE-10)', () => {
  const comment: ThreadData = { id: COMMENT, root: { id: COMMENT, author: { name: 'Ana' }, at: 1_790_000_000, body: 'Is this ready?', by: ANA }, replies: [] }
  const memory = () => {
    const kept = new Map<string, string>()
    return createDraftStore({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value), removeItem: (key) => void kept.delete(key) })
  }

  it('with no replies, stays as "This comment was deleted." with the reply box and its text, not taken away', async () => {
    const drafts = memory()
    drafts.write(draftKeys.thread(COMMENT), 'Almost, one more test')
    const { rerender } = show({ threads: [comment], drafts })
    fireEvent.click(screen.getByText('Is this ready?'))
    expect(await screen.findByRole('textbox', { name: 'Reply…' })).toHaveTextContent('Almost, one more test')
    // The live delete: the comment, with no replies, leaves the read.
    rerender(<ThreadListView threads={[]} onStart={noop} onReply={noop} viewer={RAVI} drafts={drafts} />)
    expect(screen.getByText('This comment was deleted.')).toBeInTheDocument()
    expect(screen.queryByText('Is this ready?')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Reply…' })).toHaveTextContent('Almost, one more test')
    expect(screen.queryByText('This thread takes no new replies.')).toBeNull()
    // Send: the page no longer has the conversation, and says so as IssuePage does; the box says the message was deleted.
    const refused = async () => 'That conversation is no longer on this page.'
    rerender(<ThreadListView threads={[]} onStart={noop} onReply={refused} viewer={RAVI} drafts={drafts} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply…' }), { key: 'Enter' })
    expect(await screen.findByText('Not sent: this message was deleted, or you can no longer write here. Your text is back in the box.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Reply…' })).toHaveTextContent('Almost, one more test')
  })

  it('goes once its box is empty, as a deleted comment with no replies does', async () => {
    const drafts = memory()
    drafts.write(draftKeys.thread(COMMENT), 'Almost')
    const { rerender } = show({ threads: [comment], drafts })
    fireEvent.click(screen.getByText('Is this ready?'))
    await screen.findByRole('textbox', { name: 'Reply…' })
    drafts.clear(draftKeys.thread(COMMENT))
    rerender(<ThreadListView threads={[]} onStart={noop} onReply={noop} viewer={RAVI} drafts={drafts} />)
    expect(screen.queryByText('This comment was deleted.')).toBeNull()
  })

  it('with replies, keeps the reply box and its text under "This comment was deleted."', async () => {
    const drafts = memory()
    drafts.write(draftKeys.thread(COMMENT), 'Almost, one more test')
    show({ threads: [gone], goneBy: { [COMMENT]: 'deleted' }, drafts })
    fireEvent.click(screen.getByText('This comment was deleted.'))
    expect(await screen.findByRole('textbox', { name: 'Reply…' })).toHaveTextContent('Almost, one more test')
    expect(screen.getByText('The reply stays')).toBeInTheDocument()
    expect(screen.queryByText('This thread takes no new replies.')).toBeNull()
  })
})

describe('a thread whose comment was not read, with no sign it was deleted', () => {
  it('says "This comment can’t be shown.", never that it was deleted, with its reply under it', () => {
    show({ goneBy: { [COMMENT]: 'missing' } })
    expect(screen.getByText('This comment can’t be shown.')).toBeInTheDocument()
    expect(screen.queryByText('This comment was deleted.')).toBeNull()
    fireEvent.click(screen.getByText('This comment can’t be shown.'))
    expect(screen.getByText('The reply stays')).toBeInTheDocument()
    expect(screen.getByText('This thread takes no new replies.')).toBeInTheDocument()
  })
})
