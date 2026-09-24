import type { Meta, StoryObj } from '@storybook/react-vite'
import { ISSUE_STATUSES, ROWS, hrefFor } from '@/fixtures/issues'
import { Board } from './Board'

/** One column per status, cards of ref · title · face. Read-only until REW-5 wires the drag. */
const meta = {
  title: 'Issues/Board',
  component: Board,
  args: { issues: ROWS, statuses: ISSUE_STATUSES, hrefFor },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Board>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** A column with nothing in it says so. */
export const SparseBoard: Story = { args: { issues: ROWS.slice(0, 2) } }

/** Narrower than four columns: the board scrolls inside itself. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
}
