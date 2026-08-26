import type { Meta, StoryObj } from '@storybook/react-vite'
import { ACTIVITY } from '@/fixtures/projects'
import { ActivityFeed } from './ActivityFeed'

/** An issue's history in words — labels, never wire values; the time under each entry. */
const meta = {
  title: 'Issues/ActivityFeed',
  component: ActivityFeed,
  args: { entries: ACTIVITY },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActivityFeed>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { entries: [] } }
