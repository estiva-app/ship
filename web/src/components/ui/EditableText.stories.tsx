import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { EditableText } from './EditableText'

/** Text you click to edit. Enter commits, Escape cancels, blur commits; a failed commit keeps the field open. */
const meta = {
  title: 'Inputs/EditableText',
  component: EditableText,
  args: { label: 'Title', value: 'Relay Migration', placeholder: 'Untitled project', onCommit: fn(() => true) },
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EditableText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { value: '' } }

export const Multiline: Story = {
  args: {
    label: 'Description',
    multiline: true,
    placeholder: 'Add a description…',
    value: 'Moving every workspace read and write onto the relay.\nOne surface at a time.',
    className: 'text-body-2',
  },
}

/** Edits stick. */
export const Interactive: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value)
    return (
      <EditableText
        {...args}
        value={value}
        onCommit={(next) => {
          setValue(next)
          return true
        }}
      />
    )
  },
}
