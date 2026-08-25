import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './Field'
import { Select } from './Select'
import { TextInput } from './TextInput'
import { Textarea } from './Textarea'

/** Peek's Field: a label above its control, `gap-2` between. */
const meta = {
  title: 'Inputs/Field',
  component: Field,
  args: { label: 'Title', children: <TextInput placeholder="New project title" /> },
  decorators: [
    (Story) => (
      <div className="flex w-[360px] flex-col gap-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Required: Story = { args: { required: true } }

/** A form the way a dialog composes it: three fields, three controls. */
export const AForm: Story = {
  render: () => (
    <>
      <Field label="Title" required>
        <TextInput placeholder="New project title" />
      </Field>
      <Field label="Description">
        <Textarea placeholder="Description (optional)" className="h-[109px]" />
      </Field>
      <Field label="Status">
        <Select
          value="planned"
          onChange={() => {}}
          options={[
            { value: 'planned', label: 'Planned' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </Field>
    </>
  ),
}
