import type { Meta, StoryObj } from '@storybook/react-vite'
import { ACTIVITY } from '@/fixtures/projects'
import { History } from './History'

/** An issue's history in words — labels, never wire values — one line a change, newest first, the time at the end with the date on hover. */
const meta = {
  title: 'Issues/History',
  component: History,
  args: { entries: ACTIVITY },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof History>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { entries: [] } }

/** A long change wraps rather than being cut: every word of a rename is shown. */
export const LongChange: Story = {
  args: {
    entries: [
      ...ACTIVITY,
      { id: 'long', by: { name: 'Ana Duarte' }, at: Math.floor(Date.now() / 1000) - 600, text: 'renamed it to "Board columns lose their order after an archived project comes back from the folder union"' },
    ],
  },
}
