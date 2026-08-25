import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { Chip } from './Chip'
import { Person } from './Person'
import { Property } from './Property'
import { Select } from './Select'
import { StatusIcon } from './StatusIcon'

/** Peek's Property. `row` is Peek's; `stacked` is Ship's rail, as production has it. */
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

/** Ship's: the label above, a SectionLabel, the control full width. */
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

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
const PEOPLE = [
  { value: '', label: 'Unassigned' },
  { value: 'ana', label: 'Ana Duarte' },
  { value: 'ravi', label: 'Ravi Mehta' },
]

/**
 * The project page's rail as production lays it out: Status and Lead as
 * controls, Progress and Folder read-only, each label above its value.
 */
export const TheRail: Story = {
  render: () => {
    const [status, setStatus] = useState('in_progress')
    const [lead, setLead] = useState('ana')
    return (
      <>
        <Property layout="stacked" label="Status">
          <Select value={status} onChange={setStatus} options={STATUSES} ariaLabel="Status" />
        </Property>
        <Property layout="stacked" label="Lead">
          <Select value={lead} onChange={setLead} options={PEOPLE} ariaLabel="Lead" />
        </Property>
        <Property layout="stacked" label="Progress">
          <span className="text-body-2 tabular-nums text-text-primary">2/11 done</span>
        </Property>
        <Property layout="stacked" label="Folder">
          <div className="flex flex-col gap-2">
            <Chip label="Paired" type="info" className="self-start" />
            <div className="flex gap-2">
              <Button size="small" variant="outlined">Copy Folder link</Button>
              <Button size="small" variant="outlined">Pair with another Folder…</Button>
            </div>
          </div>
        </Property>
      </>
    )
  },
}

/** Read-only values in Peek's row layout, for comparison. */
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
