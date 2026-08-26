import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Composer } from './Composer'

/** Ship's composer as production has it: one line and a button. Enter submits; empty never does. */
const meta = {
  title: 'Inputs/Composer',
  component: Composer,
  args: { onSubmit: fn() },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Composer>

export default meta
type Story = StoryObj<typeof meta>

/** Starting a conversation on a project or an issue. */
export const Conversation: Story = {}

/** Under a conversation, answering it. */
export const Reply: Story = { args: { kind: 'reply' } }

/** While the post is in flight the field and the button wait; a failed post keeps the text. */
export const PostFails: Story = {
  args: { onSubmit: fn(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1200))) },
}
