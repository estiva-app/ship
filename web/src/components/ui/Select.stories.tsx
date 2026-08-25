import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './Field'
import { Property } from './Property'
import { Select, type SelectOption } from './Select'

/** Production's vocabulary, exactly as `src/kinds.ts` labels it. */
const PROJECT_STATUSES: SelectOption[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PEOPLE: SelectOption[] = [
  { value: '', label: 'Unassigned' },
  { value: 'ana', label: 'Ana Duarte' },
  { value: 'ravi', label: 'Ravi Mehta' },
]

function Controlled({ options, initial, ...rest }: { options: SelectOption[]; initial: string; size?: 'default' | 'small'; disabled?: boolean; ariaLabel?: string; placeholder?: string }) {
  const [value, setValue] = useState(initial)
  return <Select value={value} onChange={setValue} options={options} {...rest} />
}

/** Peek's Select — the control that replaces Ship's native dropdowns (ruling C11). Keyboard: arrows, Home/End, Enter/Space, Escape. */
const meta = {
  title: 'Inputs/Select',
  component: Select,
  args: { value: 'planned', onChange: () => {}, options: PROJECT_STATUSES },
  decorators: [
    (Story) => (
      <div className="flex w-[300px] flex-col gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: () => <Controlled options={PROJECT_STATUSES} initial="planned" ariaLabel="Status" /> }

/** Nothing chosen yet: the placeholder, muted. */
export const Placeholder: Story = {
  render: () => <Controlled options={PROJECT_STATUSES} initial="" placeholder="Choose a status" ariaLabel="Status" />,
}

export const Disabled: Story = { render: () => <Controlled options={PROJECT_STATUSES} initial="planned" disabled ariaLabel="Status" /> }

/** In a Field, as the new-project dialog will have it. */
export const InAField: Story = {
  render: () => (
    <Field label="Status">
      <Controlled options={PROJECT_STATUSES} initial="in_progress" />
    </Field>
  ),
}

/** `small`, in a property rail — Status and Lead as the project page will show them. */
export const InARail: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Property label="Status">
        <Controlled options={PROJECT_STATUSES} initial="in_progress" size="small" ariaLabel="Status" />
      </Property>
      <Property label="Lead">
        <Controlled options={PEOPLE} initial="ana" size="small" ariaLabel="Lead" />
      </Property>
    </div>
  ),
}
