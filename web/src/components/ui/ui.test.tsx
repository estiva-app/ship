import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../Composer'
import { DialogShell } from './DialogShell'
import { IconButton } from './IconButton'
import { Select } from './Select'

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

describe('Select', () => {
  it('opens from the keyboard, moves with arrows, picks with Enter, and returns focus', () => {
    const onChange = vi.fn()
    render(<Select value="planned" onChange={onChange} options={STATUSES} ariaLabel="Status" />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('in_progress')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape and on a click outside', () => {
    render(<Select value="planned" onChange={vi.fn()} options={STATUSES} ariaLabel="Status" />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the placeholder, muted, when nothing matches', () => {
    render(<Select value="" onChange={vi.fn()} options={STATUSES} placeholder="Choose" ariaLabel="Status" />)
    expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Choose')
  })
})

describe('DialogShell', () => {
  it('closes on Escape, on the backdrop, and on the close button', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DialogShell title="New project" onClose={onClose} footer={<span>footer</span>}>
        body
      </DialogShell>,
    )
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('.fixed.inset-0.z-40')!)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(container.textContent).toBe('')
  })
})

describe('Composer', () => {
  it('submits trimmed text on Enter, never submits empty, and clears only when the post succeeded', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<Composer onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Start a conversation…' })
    const post = screen.getByRole('button', { name: 'Post' })
    expect(post).toBeDisabled()

    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  hello  ' } })
    expect(post).toBeEnabled()
    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('hello')
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('keeps the text when the post fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<Composer kind="reply" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Reply…' })
    fireEvent.change(input, { target: { value: 'still here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled())
    expect(input).toHaveValue('still here')
  })
})

describe('IconButton', () => {
  it('carries its name, shows its tooltip, and cannot be pressed when disabled', () => {
    const onClick = vi.fn()
    render(
      <IconButton aria-label="More" tooltip="More" onClick={onClick} disabled>
        <span>…</span>
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'More' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.mouseEnter(button.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('More')
  })
})
