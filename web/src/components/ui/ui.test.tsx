import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ComposeBox } from './ComposeBox'
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

describe('ComposeBox', () => {
  it('sends trimmed text on Enter, never sends empty, and Shift+Enter is a new line', () => {
    const onSend = vi.fn()
    render(<ComposeBox onSend={onSend} placeholder="Reply…" />)
    const area = screen.getByRole('textbox', { name: 'Reply…' })
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    fireEvent.keyDown(area, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.change(area, { target: { value: '  hello  ' } })
    expect(send).toBeEnabled()
    fireEvent.keyDown(area, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(area, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(area).toHaveValue('')
    expect(send).toBeDisabled()
  })

  it('sends from the button too', () => {
    const onSend = vi.fn()
    render(<ComposeBox onSend={onSend} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a message' } })
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('a message')
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
