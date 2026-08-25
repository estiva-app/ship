import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconPaperclip } from '@tabler/icons-react'
import { fn } from 'storybook/test'
import { ComposeBox } from './ComposeBox'
import { IconButton } from './IconButton'

/** The shell of Peek's composer over a plain text area. Enter sends, Shift+Enter breaks a line, empty never sends. */
const meta = {
  title: 'Inputs/ComposeBox',
  component: ComposeBox,
  args: { onSend: fn() },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComposeBox>

export default meta
type Story = StoryObj<typeof meta>

/** Starting a conversation on a project or an issue. */
export const Default: Story = {}

/** Under a conversation. */
export const Reply: Story = { args: { placeholder: 'Reply…' } }

/** A tool on the left — the slot exists; attachments are a later ticket (SHI-2). */
export const WithATool: Story = {
  args: {
    tools: (
      <IconButton aria-label="Attach file" tooltip="Attach file" disabled>
        <IconPaperclip size={16} stroke={1.5} />
      </IconButton>
    ),
  },
}

export const Disabled: Story = { args: { disabled: true } }
