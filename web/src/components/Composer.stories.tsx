import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { Imeta } from '@estiva-app/protocol'
import { Composer } from './Composer'

/**
 * Ship's composer as production has it: one line, an attach button and a post
 * button. Enter submits; empty never does; a file alone is a message.
 *
 * `upload` is stubbed in every story. The default reaches the relay, and a
 * story that uploaded a file for real would need a session and would leave a
 * blob behind each time somebody opened this page.
 */
const FAKE_UPLOAD = (file: File): Promise<Imeta> =>
  Promise.resolve({ url: `/media/${'f'.repeat(64)}.png`, m: file.type, x: 'f'.repeat(64), size: file.size, filename: file.name })

const meta = {
  title: 'Inputs/Composer',
  component: Composer,
  args: { onSubmit: fn(), upload: FAKE_UPLOAD },
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

/** A file that the relay refused — its words, and nothing attached. */
export const UploadRefused: Story = {
  args: { upload: () => Promise.reject(new Error('file exceeds 10 MiB')) },
}
