import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './Field'
import { Textarea } from './Textarea'

/** Peek's Textarea. Non-resizable; the height comes from `className`. */
const meta = {
  title: 'Inputs/Textarea',
  component: Textarea,
  args: { placeholder: 'Description (optional)', className: 'h-[109px]' },
  decorators: [
    (Story) => (
      <div className="flex w-[360px] flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Filled: Story = {
  args: { defaultValue: 'Take card payments. Start with the checkout, then the invoices, then the refunds.' },
}
export const Disabled: Story = { args: { defaultValue: 'Take card payments.', disabled: true } }

/** In its Field. */
export const InAField: Story = {
  render: (args) => (
    <Field label="Description">
      <Textarea {...args} />
    </Field>
  ),
}
