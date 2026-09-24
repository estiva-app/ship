import type { Meta, StoryObj } from '@storybook/react-vite'
import { ACTIVITY } from '@/fixtures/projects'
import { History } from './History'

/** An issue's history in words — labels, never wire values; the time under each entry. */
const meta = {
  title: 'Issues/History',
  component: History,
  args: { entries: ACTIVITY },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof History>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { entries: [] } }
