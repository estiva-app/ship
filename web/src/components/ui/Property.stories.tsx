import type { Meta, StoryObj } from '@storybook/react-vite'
import { Chip } from './Chip'
import { Person } from './Person'
import { Property } from './Property'
import { StatusIcon } from './StatusIcon'

/** Peek's Property: a 68px label column and whatever value sits beside it. */
const meta = {
  title: 'Primitives/Property',
  component: Property,
  args: { label: 'Status', children: <span className="text-body-2 text-text-primary">In Progress</span> },
  decorators: [
    (Story) => (
      <div className="flex w-[250px] flex-col gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Property>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The project page's rail, read-only: the values line up in a column of their own. */
export const ARail: Story = {
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
      <Property label="Progress">
        <span className="text-body-2 tabular-nums text-text-primary">2/11 done</span>
      </Property>
      <Property label="Folder">
        <Chip label="Paired" type="info" />
      </Property>
    </>
  ),
}

/** An empty value is an em dash, never a blank. */
export const EmptyValue: Story = {
  args: { label: 'Lead', children: <span className="text-body-2 text-text-muted">—</span> },
}
