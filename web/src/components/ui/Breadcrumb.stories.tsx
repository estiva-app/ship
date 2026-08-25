import type { Meta, StoryObj } from '@storybook/react-vite'
import { Breadcrumb } from './Breadcrumb'

/** Production's trail on an issue page: Issues / project / ref. */
const meta = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  args: {
    items: [
      { label: 'Issues', href: '#/issues' },
      { label: 'Relay Migration', href: '#/project/x' },
      { label: 'REL-6', mono: true },
    ],
  },
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

export const OnAnIssue: Story = {}

/** An issue with no project: "Inbox", muted, and no ref. */
export const InTheInbox: Story = {
  args: { items: [{ label: 'Issues', href: '#/issues' }, { label: 'Inbox', muted: true }] },
}

/** A project page: Projects / project. */
export const OnAProject: Story = {
  args: { items: [{ label: 'Projects', href: '#/projects' }, { label: 'Relay Migration' }] },
}

/** A long project name truncates; the ref stays. */
export const LongName: Story = {
  decorators: [(Story) => <div className="w-[320px]"><Story /></div>],
  args: {
    items: [
      { label: 'Issues', href: '#/issues' },
      { label: 'Onboarding flow for new workspaces, the whole first ten minutes', href: '#/project/x' },
      { label: 'ONB-12', mono: true },
    ],
  },
}
