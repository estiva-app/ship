import type { Meta, StoryObj } from '@storybook/react-vite'
import { ANA, ISSUE_STATUSES, ROWS, hrefFor } from '@/fixtures/issues'
import { IssueRow } from './IssueRow'

/** One line: ref · status shape · title, then the project chip, the conversations, the assignee's face and when it was opened. Hover it. */
const meta = {
  title: 'Issues/IssueRow',
  component: IssueRow,
  args: { issue: ROWS[0], statuses: ISSUE_STATUSES, href: hrefFor(ROWS[0]) },
  decorators: [
    (Story) => (
      <div className="w-[900px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IssueRow>

export default meta
type Story = StoryObj<typeof meta>

/** Everything present: a project, two conversations, an assignee. */
export const Default: Story = {}

/** No conversations yet: the count is simply absent, not a zero. */
export const NoConversations: Story = { args: { issue: ROWS[1] } }

/** Nobody assigned: no face, no placeholder. */
export const Unassigned: Story = { args: { issue: ROWS[4] } }

/** A parentless issue (B10): no chip. */
export const NoProject: Story = { args: { issue: ROWS[7] } }

/** Filed by another app without a ref: an em dash, not a blank. */
export const NoRef: Story = { args: { issue: ROWS[4] } }

/** A status the vocabulary does not know: a plain circle. */
export const UnknownStatus: Story = { args: { issue: ROWS[8] } }

/** A long title truncates and a long project name is cut in its chip; the count, the face and the time stay. */
export const LongTitle: Story = {
  args: {
    issue: {
      ...ROWS[0],
      title: 'A very long issue title that goes on and on about the columns and the archived project and the order they come back in after a reload',
      project: { title: 'Onboarding flow for new workspaces, the whole first ten minutes' },
      assignee: ANA,
    },
  },
}
