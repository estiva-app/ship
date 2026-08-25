import type { Meta, StoryObj } from '@storybook/react-vite'
import { Person } from './Person'
import { Property } from './Property'
import { Select } from './Select'
import { StatusIcon } from './StatusIcon'

/** Peek's Property. `row` is Peek's; `stacked` is Ship's rail label — see Projects/ProjectRail for the rail itself. */
const meta = {
  title: 'Primitives/Property',
  component: Property,
  args: { label: 'Status', children: <span className="text-body-2 text-text-primary">In Progress</span> },
  decorators: [
    (Story) => (
      <div className="flex w-[250px] flex-col gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Property>

export default meta
type Story = StoryObj<typeof meta>

/** Peek's row: the 68px label column. */
export const Row: Story = {}

/** Ship's: the `menu`-token label, uppercase, above a full-width control. */
export const Stacked: Story = {
  args: {
    layout: 'stacked',
    children: (
      <Select
        value="in_progress"
        onChange={() => {}}
        options={[
          { value: 'planned', label: 'Planned' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        ariaLabel="Status"
      />
    ),
  },
}

/** Read-only values in Peek's row layout. */
export const RowValues: Story = {
  render: () => (
    <>
      <Property label="Status">
        <span className="flex items-center gap-1.5 text-body-2 text-text-primary">
          <StatusIcon value="in_progress" />
          In Progress
        </span>
      </Property>
      <Property label="Lead">
        <Person name="Ana Duarte" className="text-body-2 text-text-primary" />
      </Property>
      <Property label="Lead">
        <span className="text-body-2 text-text-muted">—</span>
      </Property>
    </>
  ),
}
