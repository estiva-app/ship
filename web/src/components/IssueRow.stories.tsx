import type { Meta, StoryObj } from '@storybook/react-vite'
import { ANA, ROWS, hrefFor } from '@/fixtures/issues'
import { IssueRow } from './IssueRow'

/** One 36px line: status · ref · title · assignee · time. The title is the only emphasised thing. */
const meta = {
  title: 'Issues/IssueRow',
  component: IssueRow,
  args: { issue: ROWS[0], href: hrefFor(ROWS[0]) },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IssueRow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Nobody assigned: no face, no placeholder. */
export const Unassigned: Story = { args: { issue: ROWS[2] } }

/** Filed by another app without a ref: an em dash, not a blank. */
export const NoRef: Story = { args: { issue: ROWS[4] } }

/** A status the vocabulary does not know: a plain circle. */
export const UnknownStatus: Story = { args: { issue: ROWS[8] } }

/** A long title truncates; the face and the time stay. */
export const LongTitle: Story = {
  args: {
    issue: { ...ROWS[0], title: 'A very long issue title that goes on and on about the columns and the archived project and the order they come back in after a reload', assignee: ANA },
  },
}
