import type { Meta, StoryObj } from '@storybook/react-vite'
import { NavItem } from './NavItem'

const meta = {
  title: 'Navigation/NavItem',
  component: NavItem,
  args: { label: 'Issues', href: '#/', count: 18 },
  decorators: [
    (Story) => (
      <div className="w-60 bg-bg-surface px-2.5 py-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NavItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Quiet selected background, text stays primary (ruling A3). */
export const Active: Story = { args: { active: true } }

/** Nothing open: no counter at all, not a zero. */
export const NoCount: Story = { args: { count: 0 } }

/** A project title that does not fit truncates; the count keeps its place. */
export const LongLabel: Story = {
  args: { label: 'Onboarding flow for new workspaces across every surface', count: 4 },
}
