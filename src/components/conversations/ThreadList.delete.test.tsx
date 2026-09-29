// Moved from src/components/ConversationThread.delete.test.tsx
/**
 * Deleting a comment — CON-3.
 *
 * The claim under test is not "a delete button exists". It is **who is offered
 * one**, because that is what the ticket was rewritten to change and it is the
 * part a future reader will be tempted to "fix" back.
 *
 * SPEC §6.5 used to say a relay honours a deletion only from the original
 * signer, and both apps were built to that: hide the control from a non-author
 * rather than offer one that fails. The rule was wrong.
 * `validate_standard_deletion_event` accepts the target's effective author
 * **or** the NIP-OA owner of an authoring agent, on the `a` branch and the `e`
 * branch alike — and **no client can evaluate the second half**, because
 * ownership is written from the attestation and read server-side only. So an
 * author gate here hides the control from the one other party the relay would
 * accept, which on this workspace is where the conversation is: 425 of 583
 * messages on 2026-09-06 were written by a single agent identity.
 *
 * Hence: the control is offered on every message, the write is attempted, and
 * a refusal is the relay's answer rather than an application error.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const ANA = 'a'.repeat(64)
const AGENT = 'b'.repeat(64)

const thread: ThreadData = {
  id: 'root-1',
  root: { id: 'root-1', author: { name: 'Claude (steered by Miky)' }, at: 1_756_000_000, body: 'Opening line.', by: AGENT },
  replies: [
    { id: 'reply-1', author: { name: 'Ana Duarte' }, at: 1_756_000_100, body: 'A reply.', by: ANA },
  ],
}

// Changed on purpose: replies are folded behind the replies button, so the thread is opened to reach the reply's menu.
function open(onDeleteMessage?: (id: string) => Promise<boolean | void> | boolean | void) {
  const view = render(
    <ThreadListView threads={[thread]} onStart={() => true} onReply={() => true} onDeleteMessage={onDeleteMessage} />,
  )
  fireEvent.click(screen.getByRole('button', { name: '1 reply' }))
  return view
}

/** The `…` triggers, in render order: the root's, then each reply's. */
const actions = () => screen.getAllByRole('button', { name: 'Message actions' })

describe('the delete control', () => {
  it('is offered on somebody else’s message, because the relay decides and this app cannot', () => {
    open(vi.fn())
    // Two messages, two menus — neither gated on who wrote it.
    expect(actions()).toHaveLength(2)
  })

  it('is absent, not disabled, where nobody may write at all', () => {
    open(undefined)
    expect(screen.queryAllByRole('button', { name: 'Message actions' })).toHaveLength(0)
  })

  it('asks before publishing, and says the relay may decline', () => {
    const onDelete = vi.fn()
    open(onDelete)
    fireEvent.click(actions()[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/NIP-09 deletion request/)).toBeTruthy()
    expect(screen.getByText(/Copies held by other relays or apps are unaffected/)).toBeTruthy()
  })

  /* Deleting a thread's opening line does not delete the thread: replies are
     separate events with their own authors, and `foldConversations` promotes
     the earliest survivor. Worth knowing before rather than after. */
  it('warns that a root’s replies survive it', () => {
    open(vi.fn())
    fireEvent.click(actions()[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    expect(screen.getByText(/1 reply is a separate event/)).toBeTruthy()
  })

  it('says nothing about replies when deleting one', () => {
    open(vi.fn())
    fireEvent.click(actions()[1])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    expect(screen.queryByText(/separate event/)).toBeNull()
  })

  it('publishes for the message whose menu was opened', async () => {
    const onDelete = vi.fn(async () => true)
    open(onDelete)
    fireEvent.click(actions()[1])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete message' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('reply-1'))
  })

  /*
    The refusal path, which is the one the rewritten ticket turns on: a relay
    saying "must be event author" is an answer, not a crash. `act` resolves
    false, ConfirmDialog keeps itself open, and the page's banner carries the
    words.
  */
  it('keeps the dialog open when the relay refuses', async () => {
    const onDelete = vi.fn(async () => false)
    open(onDelete)
    fireEvent.click(actions()[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete message' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
    expect(screen.getByText(/NIP-09 deletion request/)).toBeTruthy()
  })

  it('closes the dialog once the relay took it', async () => {
    const onDelete = vi.fn(async () => true)
    open(onDelete)
    fireEvent.click(actions()[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete message' }))
    await waitFor(() => expect(screen.queryByText(/NIP-09 deletion request/)).toBeNull())
  })
})
