import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, screen, userEvent } from 'storybook/test'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { NewIssueDialog } from './NewIssueDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { PairFolderDialog } from './PairFolderDialog'

/**
 * The four dialogs the writes need (REW-5), every one built from the shared
 * DialogShell, Field, inputs and buttons. Each portals over the page; on a
 * Docs page they render in their own frame.
 */
const meta = {
  title: 'Overlays/Dialogs',
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '560px' } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const PROJECT_OPTIONS = SIDEBAR_PROJECTS.map((p) => ({ value: p.addr, label: p.title }))

/** Production's form: a title, a description, and an optional Folder link to pair with a Peek topic. */
export const NewProject: Story = {
  render: () => <NewProjectDialog onClose={fn()} onCreate={fn()} />,
}

/** From the Issues page: the project is chosen here. */
export const NewIssue: Story = {
  render: () => <NewIssueDialog projects={PROJECT_OPTIONS} onClose={fn()} onCreate={fn()} />,
}

/** From a project page: the project is fixed, and the title says so. */
export const NewIssueInAProject: Story = {
  render: () => <NewIssueDialog projects={PROJECT_OPTIONS} project={{ addr: SIDEBAR_PROJECTS[1].addr, title: SIDEBAR_PROJECTS[1].title }} onClose={fn()} onCreate={fn()} />,
}

/** No project yet: an issue has nowhere to live, and the form says to create one first. */
export const NewIssueWithoutProjects: Story = {
  render: () => <NewIssueDialog projects={[]} onClose={fn()} onCreate={fn()} />,
}

/** Delete project, with production's warning — the one write that asks first. */
export const DeleteProject: Story = {
  render: () => (
    <ConfirmDialog title="Delete “Relay Migration”?" confirmLabel="Delete project" destructive onConfirm={fn()} onClose={fn()}>
      <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
      <p>Its 6 issues are separate events and are not deleted — they stay in the Folder and stop being reachable from here.</p>
      <p className="text-text-secondary">Archiving is reversible and usually what you want.</p>
    </ConfirmDialog>
  ),
}

/** Pair with another Folder — replaces production's prompt(). */
export const PairFolder: Story = {
  render: () => <PairFolderDialog currentFolder="5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34" onClose={fn()} onPair={fn()} />,
}

/**
 * The error line is `Field`'s own since 0.10.0 (S7): it takes the helper's
 * place, marks the control invalid, and is announced. This canvas pastes
 * something that is not a link and presses Pair.
 */
export const PairFolderRefused: Story = {
  render: () => <PairFolderDialog currentFolder="5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34" onClose={fn()} onPair={fn()} />,
  play: async () => {
    await userEvent.type(screen.getByPlaceholderText(/Folder link/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Pair' }))
  },
}

/** The same line under the optional Folder field of a new project: the helper until there is an error. */
export const NewProjectRefused: Story = {
  render: () => <NewProjectDialog onClose={fn()} onCreate={fn()} />,
  play: async () => {
    await userEvent.type(screen.getByPlaceholderText('New project title'), 'Relay migration')
    await userEvent.type(screen.getByPlaceholderText(/Paste a Peek topic link/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
  },
}

/** Open each from a button, and close it with Cancel, ✕, the backdrop or Escape. */
export const OpenAndClose: Story = {
  render: () => {
    const [open, setOpen] = useState<'project' | 'issue' | 'delete' | 'pair' | null>(null)
    return (
      <div className="flex h-screen items-center justify-center gap-2">
        <Button variant="primary" onClick={() => setOpen('project')}>
          Add project
        </Button>
        <Button variant="primary" onClick={() => setOpen('issue')}>
          Add issue
        </Button>
        <Button variant="destructive" onClick={() => setOpen('delete')}>
          Delete project
        </Button>
        <Button variant="outlined" onClick={() => setOpen('pair')}>
          Pair with another Folder…
        </Button>
        {open === 'project' && <NewProjectDialog onClose={() => setOpen(null)} onCreate={fn()} />}
        {open === 'issue' && <NewIssueDialog projects={PROJECT_OPTIONS} onClose={() => setOpen(null)} onCreate={fn()} />}
        {open === 'delete' && (
          <ConfirmDialog title="Delete “Relay Migration”?" confirmLabel="Delete project" destructive onConfirm={fn()} onClose={() => setOpen(null)}>
            <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
          </ConfirmDialog>
        )}
        {open === 'pair' && <PairFolderDialog currentFolder="5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34" onClose={() => setOpen(null)} onPair={fn()} />}
      </div>
    )
  },
}
