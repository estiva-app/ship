// Moved from src/components/ConversationThread.react.test.tsx
/**
 * The message's tools: "React" and the `…` menu, and the package's picker
 * opening from the first. What is pinned is the controls and the picking; which
 * reaction is yours is the pills' business (`Reactions.test.tsx`).
 *
 * Changed on purpose (Katerina, 29–30 September): the two are no longer one
 * strip beside the name. "…" sits at the end of the message's header line,
 * always there; "React" sits under the message, after its reaction pills
 * (Linear's order).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { ThreadListViewProps } from './shared'

const thread: ThreadData = {
  id: 'm1',
  root: { id: 'm1', author: { name: 'Bob' }, at: 1000, body: 'a message', by: 'bob' },
  replies: [],
}

const show = (props: Partial<ThreadListViewProps> = {}) =>
  render(<ThreadListView threads={[thread]} onStart={() => true} onReply={() => true} viewer="bob" {...props} />)

describe('the message tools', () => {
  it.todo(
    'is one strip, one Tab stop, with React and the menu on it — no longer applies: React moved under the message and "…" to the header line, so they are two separate controls, each its own Tab stop (Katerina, 29–30 September)',
  )

  // Changed on purpose: the strip's assertion, kept for what still holds — both controls are offered on a message.
  it('offers React and the menu on a message', () => {
    show({ onReact: vi.fn(), onEditMessage: vi.fn(), onDeleteMessage: vi.fn() })
    expect(screen.getByRole('button', { name: 'React' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Message actions' })).toBeInTheDocument()
  })

  it('offers no React without a handler, and no menu without one', () => {
    const { unmount } = show({ onDeleteMessage: vi.fn() })
    expect(screen.queryByRole('button', { name: 'React' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Message actions' })).toBeInTheDocument()
    unmount()
    show({ onReact: vi.fn() })
    expect(screen.getByRole('button', { name: 'React' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull()
  })

  it('opens the picker from React, and picking hands back the emoji and closes it', async () => {
    const user = userEvent.setup()
    const onReact = vi.fn()
    show({ onReact })
    await user.click(screen.getByRole('button', { name: 'React' }))
    const picker = await screen.findByRole('dialog', { name: 'Reactions' })
    // Each control is named by its meaning — a bare glyph is not a name.
    await user.click(screen.getByRole('button', { name: 'Thank you' }))
    expect(onReact).toHaveBeenCalledTimes(1)
    // Changed on purpose: the list hands back the message too, so the emoji is the second argument.
    expect(onReact.mock.calls[0][0]).toBe('m1')
    expect(onReact.mock.calls[0][1]).toBe('🙏')
    await waitFor(() => expect(picker).not.toBeInTheDocument())
  })

  it('says why when nothing can be written, on both controls, and neither opens', async () => {
    const user = userEvent.setup()
    show({ onReact: vi.fn(), onDeleteMessage: vi.fn(), disabledReason: 'Sign in to react.' })
    for (const name of ['React', 'Message actions']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    await user.click(screen.getByRole('button', { name: 'React' }))
    expect(screen.queryByRole('dialog', { name: 'Reactions' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Message actions' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
