import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, screen, userEvent } from 'storybook/test'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { MoveProjectDialog } from './MoveProjectDialog'
import { NewFolderDialog } from './NewFolderDialog'
import { NewIssueDialog } from './NewIssueDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { suggestKey } from '../nostr/keys'

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

// PEE is held by another project, as on production (SHI-4).
const KEYS = {
  suggestKey: (title: string) => suggestKey(title, new Set(['PEE'])),
  keyProblem: (key: string) => (key === 'PEE' ? 'PEE is used by Peek: Feedback & Bugs.' : undefined),
}

const PROJECT_OPTIONS = SIDEBAR_PROJECTS.map((p) => ({ value: p.addr, label: p.title }))

const TEAMS = [
  { id: '05bebd5b-b699-4bd4-af50-f5377df0fd67', name: 'Estiva HQ', hasState: true },
  { id: 'fd03975a-eb00-49d6-a4b7-33ead1854672', name: 'Peek', hasState: true },
  { id: '3167adea-877f-43c4-96fb-517a2b2d5d24', name: 'Ship', hasState: true },
]

/** Production's form: a title, a description, and the team the project is filed into (FOL-2). */
export const NewProject: Story = {
  render: () => <NewProjectDialog {...KEYS} teams={TEAMS} onClose={fn()} onCreate={fn()} />,
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

/** No teams came back from the read: the picker says why it is shut, and nothing can be created. */
export const NewProjectNoTeams: Story = {
  render: () => <NewProjectDialog {...KEYS} teams={[]} onClose={fn()} onCreate={fn()} />,
  play: async () => {
    await userEvent.type(screen.getByPlaceholderText('New project title'), 'Relay migration')
  },
}

/** Move a project to another Folder (FOL-7): where it is now is not offered. */
export const MoveProject: Story = {
  render: () => <MoveProjectDialog title="Ship: Feedback & Bugs" current={[TEAMS[2]!]} folders={TEAMS} onClose={fn()} onMove={fn()} />,
}

/** A move that half-worked left it in two: both are destinations, and Move again is the retry. */
export const MoveProjectInTwo: Story = {
  render: () => <MoveProjectDialog title="Ship: Feedback & Bugs" current={[TEAMS[1]!, TEAMS[2]!]} folders={TEAMS} onClose={fn()} onMove={fn()} />,
}

/** Nowhere else it can go: said, and no Move. */
export const MoveProjectNowhere: Story = {
  render: () => <MoveProjectDialog title="Ship: Feedback & Bugs" current={[TEAMS[2]!]} folders={[TEAMS[2]!]} onClose={fn()} onMove={fn()} />,
}

/** "New folder" from the sidebar (FOL-8): one field, and Create folder stays off until it holds a name. */
export const NewFolder: Story = {
  render: () => <NewFolderDialog onClose={fn()} onCreate={fn(async () => true)} />,
}

/** Open each from a button, and close it with Cancel, ✕, the backdrop or Escape. */
export const OpenAndClose: Story = {
  render: () => {
    const [open, setOpen] = useState<'project' | 'issue' | 'delete' | null>(null)
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
        {open === 'project' && <NewProjectDialog {...KEYS} teams={TEAMS} onClose={() => setOpen(null)} onCreate={fn()} />}
        {open === 'issue' && <NewIssueDialog projects={PROJECT_OPTIONS} onClose={() => setOpen(null)} onCreate={fn()} />}
        {open === 'delete' && (
          <ConfirmDialog title="Delete “Relay Migration”?" confirmLabel="Delete project" destructive onConfirm={fn()} onClose={() => setOpen(null)}>
            <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
          </ConfirmDialog>
        )}
      </div>
    )
  },
}
