/**
 * Editing a comment — CON-4.
 *
 * Two claims, and the second is the one a future reader will be tempted to
 * "fix" back: an edit is offered on **every** message, and an edited message
 * **says so**.
 *
 * The relay takes an edit from the target's effective author or the NIP-OA
 * owner of an authoring agent (`validate_edit_ownership`), and no client can
 * evaluate the second half. So an author gate here would hide the control from
 * the one other party the relay would accept — the same rule, and the same
 * mistake, as SPEC §6.5's withdrawn one for deletion.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConversationThread, type ThreadData } from './ConversationThread'

const AGENT = 'b'.repeat(64)

const thread: ThreadData = {
  id: 'root-1',
  root: { id: 'root-1', author: { name: 'Claude (steered by Miky)' }, at: 1_756_000_000, body: 'Blocked on the Stripe key.', by: AGENT },
  replies: [],
}

function open(props: Partial<Parameters<typeof ConversationThread>[0]> = {}) {
  return render(<ConversationThread thread={thread} onReply={() => true} {...props} />)
}

const openEditor = () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Message actions' })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
}

describe('the edit control', () => {
  it('is offered on somebody else’s message, because the relay decides', () => {
    open({ onEditMessage: vi.fn() })
    expect(screen.getAllByRole('button', { name: 'Message actions' })).toHaveLength(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Message actions' })[0])
    expect(screen.getByRole('menuitem', { name: 'Edit message' })).toBeTruthy()
  })

  it('is absent, not disabled, where nobody may write', () => {
    open()
    expect(screen.queryAllByRole('button', { name: 'Message actions' })).toHaveLength(0)
  })

  /* A message is marker text (SPEC §13.2), so what is edited is the text that
     was published — not a rich document that would round-trip lossily. */
  it('opens with the current text, as text', () => {
    open({ onEditMessage: vi.fn() })
    openEditor()
    expect((screen.getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement).value).toBe(
      'Blocked on the Stripe key.',
    )
  })

  it('publishes the new body for the message being edited', async () => {
    const onEditMessage = vi.fn(async () => true)
    open({ onEditMessage })
    openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Key is in 1Password.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('root-1', 'Key is in 1Password.'))
  })

  /* Nothing to publish, and a no-op edit would still cost an event that every
     reader has to fold. */
  it('will not save an unchanged body', () => {
    open({ onEditMessage: vi.fn() })
    openEditor()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('will not save an empty one', () => {
    open({ onEditMessage: vi.fn() })
    openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  /* The refusal path. Closing would throw away what was typed to no purpose —
     the same rule the composer and the delete dialog keep. */
  it('stays open when the relay refuses', async () => {
    const onEditMessage = vi.fn(async () => false)
    open({ onEditMessage })
    openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'a change' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEditMessage).toHaveBeenCalled())
    expect((screen.getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement).value).toBe('a change')
  })

  it('closes once the relay took it', async () => {
    open({ onEditMessage: vi.fn(async () => true) })
    openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'a change' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull())
  })

  it('abandons on Cancel without publishing', () => {
    const onEditMessage = vi.fn()
    open({ onEditMessage })
    openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'never mind' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onEditMessage).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull()
  })
})

describe('an edited message', () => {
  /*
    RFC 0.4 §7.2.1 makes this a MUST. The original event is immutable and still
    on the relay, so a body that quietly changed leaves two readers disagreeing
    with nothing to tell them which is current.
  */
  it('says it was edited', () => {
    render(
      <ConversationThread
        thread={{ ...thread, root: { ...thread.root, body: 'Key is in 1Password.', editedAt: 1_756_000_400 } }}
        onReply={() => true}
      />,
    )
    expect(screen.getByText('edited')).toBeTruthy()
    expect(screen.getByText('Key is in 1Password.')).toBeTruthy()
  })

  it('says nothing when it was not edited', () => {
    open()
    expect(screen.queryByText('edited')).toBeNull()
  })
})
