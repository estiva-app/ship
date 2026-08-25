import type { Meta, StoryObj } from '@storybook/react-vite'
import { ISSUE_STATUSES, ROWS, hrefFor } from '@/fixtures/issues'
import { IssueList } from './IssueList'

/** Grouped by status in the vocabulary's order; Done starts collapsed; an unknown status gets its own group, shown raw. */
const meta = {
  title: 'Issues/IssueList',
  component: IssueList,
  args: { issues: ROWS, statuses: ISSUE_STATUSES, hrefFor },
  decorators: [
    (Story) => (
      <div className="w-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IssueList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Every group open. */
export const AllOpen: Story = { args: { collapsed: [] } }

/** Only what is still open — the Issues page's "Open" filter. */
export const OpenOnly: Story = { args: { issues: ROWS.filter((issue) => issue.status !== 'done' && issue.status !== 'cancelled') } }

export const Empty: Story = { args: { issues: [] } }
