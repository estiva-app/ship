import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArchiveDialog } from './ArchiveDialog'

const meta = {
  title: 'Overlays/ArchiveDialog',
  component: ArchiveDialog,
  args: {
    title: 'Folders & Sidebar',
    what: 'project',
    hides: ['its 14 issues'],
    onClose: () => {},
    onArchive: async () => true,
  },
} satisfies Meta<typeof ArchiveDialog>

export default meta
type Story = StoryObj<typeof meta>

/** A project: its issues go with it. */
export const Project: Story = {}

/** An issue on its own hides nothing else. */
export const Issue: Story = { args: { title: 'Archive is one concept for every file', what: 'issue', hides: [] } }

/** A Folder: what only it lists, and what another Folder keeps visible. */
export const Folder: Story = {
  args: {
    title: 'Steer',
    what: 'folder',
    hides: ['3 projects only in it', '41 issues only in it'],
    staysVisible: ['2 files also in Estiva HQ'],
  },
}
