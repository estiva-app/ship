// Moved from src/components/ConversationThread.react.test.tsx
/**
 * The message's tools: the package's add-reaction button and reaction row
 * (COMM-7), and the `…` menu. "…" sits at the end of the message's header
 * line; the reactions sit under the message, the add button after the pills
 * (Linear's order, Katerina 29–30 September).
 *
 * Changed on purpose (COMM-7, Decided 2026-10-17): where nothing can be written
 * the tools are not offered at all, where they were offered disabled — the box
 * is a line saying why instead.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MentionListView, ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { ThreadListViewProps } from './shared'

const thread: ThreadData = {
  id: 'm1',
  root: { id: 'm1', author: { name: 'Bob' }, at: 1000, body: 'a message', by: 'bob' },
  replies: [],
}

const show = (props: Partial<ThreadListViewProps> = {}) =>
  render(<ThreadListView threads={[thread]} onStart={async () => true} onReply={async () => true} viewer="bob" {...props} />)

const answered = () => vi.fn(async (): Promise<true | string> => true)

describe('the message tools', () => {
  it('offers the add-reaction button and the menu on a message', () => {
    show({ onReact: answered(), onEditMessage: answered(), onDeleteMessage: vi.fn() })
    expect(screen.getByRole('button', { name: 'Add a reaction' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Message actions' })).toBeInTheDocument()
  })

  it('offers no add-reaction button without a handler, and no menu without one', () => {
    const { unmount } = show({ onDeleteMessage: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Message actions' })).toBeInTheDocument()
    unmount()
    show({ onReact: answered() })
    expect(screen.getByRole('button', { name: 'Add a reaction' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull()
  })

  it('opens the picker from the add button, and picking hands back the message and the emoji and closes it', async () => {
    const user = userEvent.setup()
    const onReact = answered()
    show({ onReact })
    await user.click(screen.getByRole('button', { name: 'Add a reaction' }))
    const picker = await screen.findByRole('dialog', { name: 'Add a reaction' })
    // Each control is named by its meaning — a bare glyph is not a name.
    await user.click(screen.getByRole('button', { name: 'Thank you' }))
    expect(onReact).toHaveBeenCalledTimes(1)
    expect(onReact.mock.calls[0]).toEqual(['m1', '🙏', undefined])
    await waitFor(() => expect(picker).not.toBeInTheDocument())
  })

  it('takes back your own reaction from its pill, naming the reaction event a retraction targets', async () => {
    const user = userEvent.setup()
    const onReact = answered()
    show({ onReact, reactionsBy: { m1: [{ emoji: '🙏', count: 1, by: ['bob'], mine: 'r1' }] } })
    await user.click(screen.getByRole('button', { name: /Thank you/ }))
    expect(onReact.mock.calls[0]).toEqual(['m1', '🙏', 'r1'])
  })

  it('says a refused reaction under the row, in the relay’s words', async () => {
    const user = userEvent.setup()
    show({ onReact: vi.fn(async () => 'rate-limited: slow down') })
    await user.click(screen.getByRole('button', { name: 'Add a reaction' }))
    await user.click(await screen.findByRole('button', { name: 'Thank you' }))
    expect(await screen.findByText('Not reacted: rate-limited: slow down')).toBeInTheDocument()
  })

  it('offers no reaction, edit or delete where nothing can be written, and draws the pills only', () => {
    show({ onReact: answered(), onEditMessage: answered(), onDeleteMessage: vi.fn(), disabledReason: 'Archived. Unarchive it to comment.', reactionsBy: { m1: [{ emoji: '🙏', count: 1, by: ['ann'] }] } })
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Thank you, 1' })).toBeDisabled()
  })

  it('offers no reaction under "Mentioned in" on a thread whose own file is archived, and still does on one that is not', () => {
    const open = { ...thread, id: 'm2', root: { ...thread.root, id: 'm2', by: 'ann' } }
    render(
      <MentionListView
        items={[
          { thread, relation: 'mention', closed: 'Archived. Unarchive it to comment.' },
          { thread: open, relation: 'mention' },
        ]}
        onReply={async () => true}
        onReact={answered()}
        viewer="bob"
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Add a reaction' })).toHaveLength(1)
    expect(document.querySelector('[data-thread="m1"]')?.querySelector('button[aria-label="Add a reaction"]')).toBeNull()
  })
})
