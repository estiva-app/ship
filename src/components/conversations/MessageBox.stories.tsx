import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Imeta } from '@estiva-app/protocol'
import { fn } from 'storybook/test'
import { installFakeRelay } from '@/fixtures/fakeRelay'
import { uploadAttachment } from '@/api/blobs'
import { MessageBox } from './MessageBox'

installFakeRelay()

/** Nothing is kept between visits to a story. */
const noDrafts = { read: () => undefined, write: () => {}, clear: () => {} }

/**
 * The writing box for conversations: Peek's box, on production's rules. What
 * it sends is the same marker text the old one-line field sent, so every other
 * app reads it as before.
 *
 * Enter sends. Shift+Enter is Enter as a document has it: a new bullet in a
 * list ("- " or "1. "), a new line in code ("```"), a new paragraph. `/` opens
 * the Format and Insert menu; selecting words shows bold, italic, underline and
 * code. A file uploads when it is picked (against a pretend relay here) and
 * waits as a card with its ✕.
 */
const meta = {
  title: 'Inputs/Message box',
  component: MessageBox,
  args: { onSubmit: fn(async () => true), drafts: noDrafts, upload: uploadAttachment },
  // Padded, not centred: in the centred layout a column has no width to take, and a short one shrank to its words.
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageBox>

export default meta
type Story = StoryObj<typeof meta>

/** Starting a conversation: the tall box, attach beside Send. */
export const NewConversation: Story = { args: { kind: 'conversation' } }

/** A reply: one 38px line, the height of estiva-ui's text field. Escape in an empty reply closes it. */
export const Reply: Story = { args: { kind: 'reply' } }

/** Editing a message in place: Cancel and Save, and today's note that the original stays on the relay. */
export const Edit: Story = { args: { kind: 'edit', initial: 'Moving this to **in progress**.\nWill pair with Ana on the fix tomorrow.', onCancel: fn() } }

/** Signed out: the box says why, and nothing can be typed or pressed. */
export const SignedOut: Story = { args: { kind: 'conversation', disabledReason: 'Sign in to react or reply.' } }

/** The relay refused the post: the text and the files stay, ready to send again. */
export const Refused: Story = { args: { kind: 'conversation', onSubmit: fn(async () => false) } }

/** The relay refused a file: its words under the box. */
export const UploadRefused: Story = {
  args: {
    kind: 'conversation',
    upload: async (): Promise<Imeta> => {
      throw new Error('upload failed: 413 file too large: the limit is 5 MB')
    },
  },
}
