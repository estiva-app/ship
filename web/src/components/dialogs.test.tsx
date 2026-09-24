import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { NewIssueDialog } from './NewIssueDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { PairFolderDialog } from './PairFolderDialog'

const FOLDER = '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34'
const OTHER = '11111111-2222-4333-8444-555555555555'

describe('NewProjectDialog', () => {
  const teams = [
    { id: FOLDER, name: 'Ship', hasState: true },
    { id: OTHER, name: 'Peek', hasState: true },
  ]
  const chooseTeam = async (name: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await userEvent.click(await screen.findByRole('option', { name }))
  }

  it('needs a title and a team, and hands over a trimmed draft filed into that team', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<NewProjectDialog teams={teams} onClose={onClose} onCreate={onCreate} />)
    const create = screen.getByRole('button', { name: 'Create project' })
    expect(create).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: '  Design System ' } })
    expect(create).toBeDisabled()
    await chooseTeam('Peek')
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ title: 'Design System', description: '', team: { folder: OTHER, hasState: true } }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('offers no Folder of its own and no pairing', () => {
    render(<NewProjectDialog teams={teams} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Paste a Peek topic link/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Folder of its own/)).not.toBeInTheDocument()
  })

  it('cannot be submitted while the teams are read, or when there are none', () => {
    const { rerender } = render(<NewProjectDialog teams={undefined} onClose={vi.fn()} onCreate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('New project title'), { target: { value: 'X' } })
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
    rerender(<NewProjectDialog teams={[]} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByText(/No teams to file into/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
  })

  it('stays open when the caller says the write failed', async () => {
    const onClose = vi.fn()
    render(<NewProjectDialog teams={teams} onClose={onClose} onCreate={vi.fn().mockResolvedValue(false)} />)
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
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ title: 'Board loses order', description: '', projectAddr: '30850:a:rel' }))
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

describe('ConfirmDialog', () => {
  it('runs the action and closes; a refused action keeps it open', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete project" destructive onConfirm={onConfirm} onClose={onClose}>
        <p>Sure?</p>
      </ConfirmDialog>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const stays = vi.fn()
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete project" destructive onConfirm={vi.fn().mockResolvedValue(false)} onClose={stays}>
        <p>Sure?</p>
      </ConfirmDialog>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete project' }).at(-1)!)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete project' }).at(-1)).toBeEnabled())
    expect(stays).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={vi.fn()} onClose={onClose}>
        <p>Sure?</p>
      </ConfirmDialog>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PairFolderDialog', () => {
  it('parses the link, refuses the current Folder, and pairs another', async () => {
    const onPair = vi.fn().mockResolvedValue(true)
    render(<PairFolderDialog currentFolder={FOLDER} onClose={vi.fn()} onPair={onPair} />)
    const input = screen.getByPlaceholderText(/Folder link/)
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByText(/does not look like a Folder link/)).toBeInTheDocument()
    fireEvent.change(input, { target: { value: `folder:${FOLDER}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByText('Already paired with that Folder.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: `https://peek.example/topic?folder=${OTHER}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }))
    await waitFor(() => expect(onPair).toHaveBeenCalledWith(OTHER))
  })
})
