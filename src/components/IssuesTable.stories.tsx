import type { Meta, StoryObj } from '@storybook/react-vite'
import { ISSUES, ISSUE_STATUSES, hrefFor } from '@/fixtures/issues'
import { IssuesTable } from './IssuesTable'

/** The project page's table view, as production: ref · Title (with the summary under it, one line) · Status · Assignee · Opened by · Updated. Scrolls inside itself. */
const meta = {
  title: 'Issues/IssuesTable',
  component: IssuesTable,
  args: { issues: ISSUES, statuses: ISSUE_STATUSES, hrefFor },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof IssuesTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Narrower than its columns: the table scrolls, the page does not. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
}
