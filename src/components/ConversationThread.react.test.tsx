/**
 * The message's tools since 0.10.0 (D34): "React" beside the `…` menu, the two
 * as one strip, and the package's picker opening from the first. What is
 * pinned is the strip and the picking; which reaction is yours is the pills'
 * business (`Reactions.test.tsx`).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageActions } from './ConversationThread'

describe('the message tools', () => {
  it('is one strip, one Tab stop, with React and the menu on it', () => {
    render(<MessageActions onReact={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const strip = screen.getByRole('toolbar', { name: 'Message tools' })
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['React', 'Message actions'])
    // One Tab stop: exactly one of the two is in the Tab order at a time.
    expect(buttons.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(strip).toBeInTheDocument()
  })

  it('offers no React without a handler, and no menu without one', () => {
    render(<MessageActions onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'React' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Message actions' })).toBeInTheDocument()
  })

  it('opens the picker from React, and picking hands back the emoji and closes it', async () => {
    const user = userEvent.setup()
    const onReact = vi.fn()
    render(<MessageActions onReact={onReact} />)
    await user.click(screen.getByRole('button', { name: 'React' }))
    const picker = await screen.findByRole('dialog', { name: 'Reactions' })
    // Each control is named by its meaning — a bare glyph is not a name.
    await user.click(screen.getByRole('button', { name: 'Thank you' }))
    expect(onReact).toHaveBeenCalledTimes(1)
    expect(onReact.mock.calls[0][0]).toBe('🙏')
    await waitFor(() => expect(picker).not.toBeInTheDocument())
  })

  it('says why when nothing can be written, on both controls, and neither opens', async () => {
    const user = userEvent.setup()
    render(<MessageActions onReact={vi.fn()} onDelete={vi.fn()} disabledReason="Sign in to react." />)
    for (const name of ['React', 'Message actions']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    await user.click(screen.getByRole('button', { name: 'React' }))
    expect(screen.queryByRole('dialog', { name: 'Reactions' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Message actions' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
