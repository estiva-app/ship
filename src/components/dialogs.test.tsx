import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MoveProjectDialog } from './MoveProjectDialog'
import { NewIssueDialog } from './NewIssueDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { suggestKey } from '../nostr/keys'

// PEE is held by another project, as on production.
const KEYS = {
  suggestKey: (title: string) => suggestKey(title, new Set(['PEE'])),
  keyProblem: (key: string) => (key === 'PEE' ? 'PEE is used by Peek: Feedback & Bugs.' : undefined),
}

const FOLDER = '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34'
const OTHER = '11111111-2222-4333-8444-555555555555'

describe('MoveProjectDialog', () => {
  const ship = { id: FOLDER, name: 'Ship', hasState: true }
  const peek = { id: OTHER, name: 'Peek', hasState: true }
  const bare = { id: 'bare', name: 'Bare', hasState: false }
  const options = async () => {
    fireEvent.click(screen.getByRole('combobox', { name: 'Destination Folder' }))
    // The label alone, without the selected row's check mark.
    return (await screen.findAllByRole('option')).map((option) => option.textContent?.replace(/\W+$/u, ''))
  }

  it('offers the Folders with state other than where it is, and moves to the one chosen', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<MoveProjectDialog title="P" current={[ship]} folders={[ship, peek, bare]} onMove={onMove} onClose={onClose} />)
    expect(await options()).toEqual(['Peek'])
    await userEvent.click(screen.getByRole('option', { name: 'Peek' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(peek))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('in two Folders after a half move, both are destinations', async () => {
    render(<MoveProjectDialog title="P" current={[ship, peek]} folders={[ship, peek]} onMove={vi.fn()} onClose={vi.fn()} />)
    expect(await options()).toEqual(['Ship', 'Peek'])
  })

  it('stays open, Move ready again, when the caller says the move did not finish', async () => {
    const onMove = vi.fn().mockResolvedValue(false)
    const onClose = vi.fn()
    render(<MoveProjectDialog title="P" current={[ship]} folders={[ship, peek]} onMove={onMove} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(peek))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says when there is nowhere else to go', () => {
    render(<MoveProjectDialog title="P" current={[ship]} folders={[ship, bare]} onMove={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('There is no other Folder it can be moved to.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled()
  })
})

describe('NewProjectDialog', () => {
  const teams = [
    { id: FOLDER, name: 'Ship', hasState: true },
    { id: OTHER, name: 'Peek', hasState: true },
  ]
  const chooseTeam = async (name: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: 'Folder' }))
    await userEvent.click(await screen.findByRole('option', { name }))
  }

  it('needs a title and a team, and hands over a trimmed draft filed into that team', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<NewProjectDialog {...KEYS} teams={teams} onClose={onClose} onCreate={onCreate} />)
    const create = screen.getByRole('button', { name: 'Create project' })
    expect(create).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: '  Design System ' } })
    expect(create).toBeDisabled()
    await chooseTeam('Peek')
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ title: 'Design System', summary: '', description: '', key: 'DES', team: { folder: OTHER, hasState: true } }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('takes an optional summary under the title and hands it over on one line (SUM-4)', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewProjectDialog {...KEYS} teams={teams} onClose={vi.fn()} onCreate={onCreate} />)
    const fields = screen.getAllByRole('textbox').map((box) => box.getAttribute('placeholder'))
    expect(fields.indexOf('What is it for, in a sentence?')).toBe(fields.indexOf('New project title') + 1)
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: 'Billing' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), { target: { value: '  Take card\npayments.  ' } })
    await chooseTeam('Peek')
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Billing', summary: 'Take card payments.' })))
  })

  it('prefills a free key from the title, and refuses a taken one before anything is published (SHI-4)', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewProjectDialog {...KEYS} teams={teams} onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: 'Peek: Onboarding' } })
    const key = screen.getByPlaceholderText('ABC')
    expect(key).toHaveValue('PEEK')
    await chooseTeam('Peek')
    fireEvent.change(key, { target: { value: 'pee' } })
    expect(key).toHaveValue('PEE')
    expect(screen.getByText('PEE is used by Peek: Feedback & Bugs.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
    fireEvent.change(key, { target: { value: 'onb-oard!' } })
    expect(key).toHaveValue('ONBOAR')
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ key: 'ONBOAR' })))
  })

  it('offers no Folder of its own and no pairing', () => {
    render(<NewProjectDialog {...KEYS} teams={teams} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Paste a Peek topic link/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Folder of its own/)).not.toBeInTheDocument()
  })

  it('cannot be submitted while the teams are read, or when there are none', () => {
    const { rerender } = render(<NewProjectDialog {...KEYS} teams={undefined} onClose={vi.fn()} onCreate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: 'X' } })
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
    rerender(<NewProjectDialog {...KEYS} teams={[]} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByText(/No Folders to file into/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
  })

  it('stays open when the caller says the write failed', async () => {
    const onClose = vi.fn()
    render(<NewProjectDialog {...KEYS} teams={teams} onClose={onClose} onCreate={vi.fn().mockResolvedValue(false)} />)
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: 'X' } })
    await chooseTeam('Ship')
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('NewIssueDialog', () => {
  const projects = [
    { value: '30850:a:des', label: 'Design System' },
    { value: '30850:a:rel', label: 'Relay Migration' },
  ]

  it('fixes the project when opened from one, and names it', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewIssueDialog projects={projects} project={{ addr: '30850:a:rel', title: 'Relay Migration' }} onClose={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByRole('dialog', { name: 'New issue in Relay Migration' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Project/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('New issue in Relay Migration'), { target: { value: 'Board loses order' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ title: 'Board loses order', summary: '', description: '', projectAddr: '30850:a:rel' }))
  })

  it('takes an optional summary under the title and hands it over on one line (SUM-4)', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewIssueDialog projects={projects} project={{ addr: '30850:a:rel', title: 'Relay Migration' }} onClose={vi.fn()} onCreate={onCreate} />)
    const fields = screen.getAllByRole('textbox').map((box) => box.getAttribute('placeholder'))
    expect(fields.indexOf('What is it for, in a sentence?')).toBe(fields.indexOf('New issue in Relay Migration') + 1)
    fireEvent.change(screen.getByPlaceholderText('New issue in Relay Migration'), { target: { value: 'Board loses order' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), { target: { value: '  Columns come back\n in the wrong order.\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Board loses order', summary: 'Columns come back in the wrong order.' })))
  })

  it('counts a summary past 240 characters and still creates the issue with all of it (SUM-4)', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewIssueDialog projects={projects} project={{ addr: '30850:a:rel', title: 'Relay Migration' }} onClose={vi.fn()} onCreate={onCreate} />)
    const long = 'a'.repeat(250)
    fireEvent.change(screen.getByPlaceholderText('New issue in Relay Migration'), { target: { value: 'Long one' } })
    const box = screen.queryByRole('textbox', { name: 'Summary' })
    expect(box).not.toBeNull()
    fireEvent.change(box!, { target: { value: 'a'.repeat(240) } })
    expect(screen.queryByText(/characters\. A summary reads best/)).toBeNull()
    fireEvent.change(box!, { target: { value: long } })
    expect(screen.queryByText('250 characters. A summary reads best in one or two sentences, under 240.')).not.toBeNull()
    const create = screen.getByRole('button', { name: 'Create issue' })
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ summary: long })))
  })

  it('asks for the project when opened from the Issues page, defaulting to the first', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<NewIssueDialog projects={projects} onClose={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByRole('combobox', { name: /^Project/ })).toHaveTextContent('Design System')
    fireEvent.change(screen.getByPlaceholderText('Issue title'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ projectAddr: '30850:a:des' })))
  })

  it('offers nothing to create when there is no project to put an issue in', () => {
    render(<NewIssueDialog projects={[]} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByText(/Create a project first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create issue' })).not.toBeInTheDocument()
  })
})
