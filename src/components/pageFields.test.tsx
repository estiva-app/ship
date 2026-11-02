/**
 * The page's fields row and its ⋯, which took the details column's place (ONE-6, step 4b). Each behaviour the rail's
 * tests pinned (rails.test.tsx, gone with the rail) is pinned here on its new part; what was dropped on purpose says so.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IssueFields, ProjectFields, type IssueFieldsProps, type ProjectFieldsProps } from './PageFields'
import { PageActions, type PageActionsProps } from './PageActions'

const STATUSES = [
  { value: 'planned', label: 'Planned', colour: 'neutral' as const },
  { value: 'in_progress', label: 'In Progress', colour: 'blue' as const },
]
const PEOPLE = [{ value: 'ana', name: 'Ana Duarte' }, { value: 'bot', name: 'Reviewer', bot: true }]
const PROJECTS = [{ value: '', label: 'No project' }, { value: '30850:x:hive', label: 'Hive' }]
const LOCKED = 'Unarchive to edit'
const REASON = 'You do not have write access to this Folder.'

const projectFields = (extra: Partial<ProjectFieldsProps> = {}) => (
  <ProjectFields status="in_progress" statuses={STATUSES} onStatusChange={vi.fn()} lead="ana" people={PEOPLE} onLeadChange={vi.fn()} done={10} total={14} {...extra} />
)
const issueFields = (extra: Partial<IssueFieldsProps> = {}) => (
  <IssueFields status="planned" statuses={STATUSES} onStatusChange={vi.fn()} assignee="" people={PEOPLE} onAssigneeChange={vi.fn()} project="30850:x:hive" projects={PROJECTS} onProjectChange={vi.fn()} {...extra} />
)
const menu = (extra: Partial<PageActionsProps> & Pick<PageActionsProps, 'what'>) => (
  <PageActions archive="none" onArchive={vi.fn()} onDelete={vi.fn()} onCopyLink={vi.fn()} {...extra} />
)

/** Opens the ⋯ and answers its rows by name, in order. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  return (await screen.findAllByRole('menuitem')).map((row) => row.textContent)
}

const shut = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true'

describe('the fields row', () => {
  it('a project: Status and Assignee as the kit’s pickers, the status in its colour, the person with a face, and the progress as a ring', async () => {
    const user = userEvent.setup()
    render(projectFields())
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('In Progress')
    // The status's shape before its word, and the chosen person's face before the name.
    expect(screen.getByRole('combobox', { name: 'Status' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Ana Duarte')
    expect(screen.getByRole('combobox', { name: 'Assignee' }).querySelector('[data-avatar], img, svg')).not.toBeNull()
    // "10/14" on the page; the words on hover are the ring's own (one tooltip, not two).
    await user.hover(screen.getByText('10/14'))
    expect((await screen.findByRole('tooltip')).textContent).toBe('10 of 14 done')
    // Changed on purpose (Katerina, 1 November: the page never names its Folder): no Folder line, no link to it.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers nobody as "Unassigned", and an agent with its robot face', async () => {
    const user = userEvent.setup()
    render(projectFields({ lead: '' }))
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Unassigned')
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }))
    const [nobody, person, agent, ...more] = await screen.findAllByRole('option')
    expect(more).toEqual([])
    expect(nobody.textContent).toMatch(/^Unassigned/)
    // A person's face says their initials; an agent's is the robot, with none (ui 0.97.0).
    expect(person.textContent).toBe('ADAna Duarte')
    expect(agent.textContent).toBe('Reviewer')
    expect(agent.querySelector('svg path')).not.toBeNull()
  })

  it('an issue: its project as a picker, "No project" kept, and a change says which', async () => {
    const user = userEvent.setup()
    const onProjectChange = vi.fn()
    render(issueFields({ onProjectChange }))
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent('Hive')
    await user.click(screen.getByRole('combobox', { name: 'Project' }))
    await user.click(await screen.findByRole('option', { name: 'No project' }))
    expect(onProjectChange).toHaveBeenCalledWith('')
  })

  // From "IssueRail, archived only with its project (PEEKM-2, SPEC §6.5)".
  it('an issue archived only with its project keeps the move out open, while status and assignee stay shut', () => {
    render(issueFields({ archived: false, lockedReason: 'Unarchive its project to edit' }))
    expect(shut(screen.getByRole('combobox', { name: 'Project' }))).toBe(false)
    for (const name of ['Status', 'Assignee']) expect(shut(screen.getByRole('combobox', { name }))).toBe(true)
  })

  // From "an archived file's rail: its fields shut (SHI-36)".
  it('an issue archived itself: all three shut, the move too', () => {
    render(issueFields({ archived: true, lockedReason: LOCKED }))
    for (const name of ['Status', 'Assignee', 'Project']) expect(shut(screen.getByRole('combobox', { name }))).toBe(true)
  })

  it('a project archived: both pickers shut, saying why on hover', async () => {
    const user = userEvent.setup()
    render(projectFields({ lockedReason: LOCKED }))
    for (const name of ['Status', 'Assignee']) expect(shut(screen.getByRole('combobox', { name }))).toBe(true)
    await user.hover(screen.getByRole('combobox', { name: 'Status' }))
    expect((await screen.findByRole('tooltip')).textContent).toBe(LOCKED)
  })

  it('nothing writable: every picker shut, kept where Tab reaches it', () => {
    render(issueFields({ readOnlyReason: REASON }))
    for (const name of ['Status', 'Assignee', 'Project']) {
      const box = screen.getByRole('combobox', { name })
      expect(shut(box)).toBe(true)
      expect(box.getAttribute('tabindex')).not.toBe('-1')
    }
  })
})

describe('the page’s ⋯', () => {
  it('a project: Move to Folder… first, Copy link, then Archive and Delete; each does what it says', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onCopyLink = vi.fn()
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    render(menu({ what: 'project', onMove, onCopyLink, onArchive, onDelete }))
    expect(await openMenu(user)).toEqual(['Move to Folder…', 'Copy link', 'Archive project', 'Delete project'])
    await user.click(screen.getByRole('menuitem', { name: 'Move to Folder…' }))
    expect(onMove).toHaveBeenCalledTimes(1)
    for (const [name, called] of [['Copy link', onCopyLink], ['Archive project', onArchive], ['Delete project', onDelete]] as const) {
      await openMenu(user)
      await user.click(screen.getByRole('menuitem', { name }))
      expect(called).toHaveBeenCalledTimes(1)
    }
    // No pairing is left (FOL-3): nothing to pair with, no Folder link to copy.
    expect(screen.queryByText(/Pair|Folder link/)).toBeNull()
  })

  // From '"Move to Folder…" sits under the Folder once the Folders are read (FOL-7)'.
  it('offers no Move to Folder… while the Folders are read, nor for an issue', async () => {
    const user = userEvent.setup()
    const { unmount } = render(menu({ what: 'project' }))
    expect(await openMenu(user)).toEqual(['Copy link', 'Archive project', 'Delete project'])
    unmount()
    render(menu({ what: 'issue' }))
    expect(await openMenu(user)).toEqual(['Copy link', 'Archive issue', 'Delete issue'])
  })

  it('Delete in the destructive colour', async () => {
    const user = userEvent.setup()
    render(menu({ what: 'issue' }))
    await openMenu(user)
    expect(within(screen.getByRole('menuitem', { name: 'Delete issue' })).getByText('Delete issue').className).toMatch(/text-error-default/)
  })

  // From "an archived file's rail: … Unarchive and Delete open (SHI-36)". Changed on purpose (Katerina, 1 November):
  // archived, the ⋯ holds only the way back and Delete — no Move, no Copy link (the rail showed Move shut).
  it('archived itself: Unarchive and Delete, both working, and nothing else', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    render(menu({ what: 'project', archive: 'own', onMove: vi.fn(), onArchive, onDelete, lockedReason: LOCKED }))
    expect(await openMenu(user)).toEqual(['Unarchive project', 'Delete project'])
    await user.click(screen.getByRole('menuitem', { name: 'Unarchive project' }))
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }))
    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  // From "IssueRail, archived only with its project": its own Archive stays offered (SPEC §6.5).
  it('an issue archived only with its project: its own Archive open', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(menu({ what: 'issue', archive: 'with', onArchive, lockedReason: 'Unarchive its project to edit' }))
    expect(await openMenu(user)).toEqual(['Archive issue', 'Delete issue'])
    const row = screen.getByRole('menuitem', { name: 'Archive issue' })
    expect(shut(row)).toBe(false)
    await user.click(row)
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  // The rail's "Locked only by its Folder's archive, archiving it again is an edit", now a shut row (ui 0.100.0).
  it('a project archived only with its Folder: Archive shown, shut, saying why; Delete open', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(menu({ what: 'project', archive: 'with', onArchive, lockedReason: 'Unarchive its Folder to edit' }))
    expect(await openMenu(user)).toEqual(['Archive project', 'Delete project'])
    const row = screen.getByRole('menuitem', { name: 'Archive project' })
    expect(shut(row)).toBe(true)
    await user.click(row)
    expect(onArchive).not.toHaveBeenCalled()
    await user.hover(row)
    expect((await screen.findByRole('tooltip')).textContent).toBe('Unarchive its Folder to edit')
    expect(shut(screen.getByRole('menuitem', { name: 'Delete project' }))).toBe(false)
  })

  // From "a write control that cannot succeed says why": every write shut and calling nothing; the link, a read, stays.
  it('nothing writable: Move, Archive and Delete shut and calling nothing; Copy link open', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    const onCopyLink = vi.fn()
    render(menu({ what: 'project', onMove, onArchive, onDelete, onCopyLink, readOnlyReason: REASON }))
    await openMenu(user)
    for (const name of ['Move to Folder…', 'Archive project', 'Delete project']) {
      const row = screen.getByRole('menuitem', { name })
      expect(shut(row)).toBe(true)
      await user.click(row)
    }
    expect(onMove).not.toHaveBeenCalled()
    expect(onArchive).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    expect(onCopyLink).toHaveBeenCalledTimes(1)
  })

  // From "leaves the issue rail's read-only actions alone when there is no reason".
  it('with no reason, Delete is open to everyone: the relay decides who may (SHI-14, SHI-3)', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(menu({ what: 'issue', onDelete }))
    await openMenu(user)
    const row = screen.getByRole('menuitem', { name: 'Delete issue' })
    expect(shut(row)).toBe(false)
    await user.click(row)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
