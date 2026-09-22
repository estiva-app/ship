import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ConversationThread } from './ConversationThread'
import { THREADS } from '@/fixtures/issues'

/*
  One thread card, on its own.

  It is drawn inside every `Conversations` story and inside `Activity`'s, and
  for a while that was the argument for not giving it a page of its own. The
  argument Katerina made back (22 September) is that a part nobody can look at
  under its own name is a part nobody finds - and `subdued`, the form Activity
  draws a mention in, cannot be compared with the ordinary one at all unless
  the two sit side by side.
*/
const meta = {
  title: 'Conversations/ConversationThread',
  component: ConversationThread,
  args: { thread: THREADS[0], onReply: fn() },
  // The width an object page's content column gives it, as Activity's story does.
  decorators: [(Story) => <div className="w-[640px]"><Story /></div>],
} satisfies Meta<typeof ConversationThread>

export default meta
type Story = StoryObj<typeof meta>

/** The first message, its replies one level in behind a left rule, and a box to reply. */
export const OneCard: Story = {}

/** Activity's mentions. The card recedes rather than fading: no fill, so the hairline sits on the page's own ground and the text stays legible. */
export const Subdued: Story = { args: { subdued: true } }

/** Where "new since you last read this" begins — a rule above the first message this reader has not seen, not a badge. */
export const Unread: Story = { args: { unreadFrom: THREADS[0].replies[0]?.id } }

/** Nobody may write here: the reply box is disabled and says why, and the per-message controls are absent rather than dimmed. */
export const ReadOnly: Story = { args: { disabledReason: 'Sign in to reply.' } }
