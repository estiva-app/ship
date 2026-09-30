import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArchivedNotice } from './ArchivedNotice'

const now = Math.floor(Date.now() / 1000)

const meta = {
  title: 'Projects/ArchivedNotice',
  component: ArchivedNotice,
  args: {
    archive: { by: 'a'.repeat(64), at: now - 2 * 86400, resolution: 'Shipped as interop 0.37.0. The follow-ups are FOL-49 and FOL-50.' },
    nameOf: () => 'Miky',
    onUnarchive: () => {},
  },
} satisfies Meta<typeof ArchivedNotice>

export default meta
type Story = StoryObj<typeof meta>

/** Archived itself, with a resolution: the banner and Unarchive, the summary in full under it. */
export const WithResolution: Story = {}

/** Archived with nothing said: the banner alone. */
export const NoResolution: Story = { args: { archive: { by: 'a'.repeat(64), at: now - 3600 } } }

/** An issue archived only because its project is: the parent is named, and opened rather than unarchived here. */
export const WithItsProject: Story = {
  args: {
    archive: { by: 'a'.repeat(64), at: now - 86400, resolution: 'Replaced by Folders & Sidebar.', with: { kind: 'project', addr: '30850:x:hive', title: 'Hive' } },
    onOpenParent: () => {},
  },
}
