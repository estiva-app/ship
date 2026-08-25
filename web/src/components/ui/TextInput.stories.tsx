import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './Field'
import { TextInput } from './TextInput'

/** Peek's TextInput. Stretches to its container; sits inside a `Field`. */
const meta = {
  title: 'Inputs/TextInput',
  component: TextInput,
  args: { placeholder: 'New project title' },
  decorators: [
    (Story) => (
      <div className="flex w-[360px] flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextInput>

export default meta
type Story = StoryObj<typeof meta>

export const Placeholder: Story = {}
export const Filled: Story = { args: { defaultValue: 'Payment integration' } }
export const Disabled: Story = { args: { defaultValue: 'Payment integration', disabled: true } }

/** In its Field, as a dialog would place it. */
export const InAField: Story = {
  render: (args) => (
    <Field label="Title" required>
      <TextInput {...args} />
    </Field>
  ),
}
