import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { THREADS } from '@/fixtures/issues'
import { Conversations } from './ConversationThread'

/** As production: a composer to start one, then each thread with its replies one level in and a reply line. */
const meta = {
  title: 'Conversations/Conversations',
  component: Conversations,
  args: { threads: THREADS, onStart: fn(), onReply: fn() },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Conversations>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { threads: [] } }

/** A single thread with no replies yet. */
export const OneThread: Story = { args: { threads: [THREADS[1]] } }

/**
 * "New since you last read this" — the divider CRO-13 added.
 *
 * It had no colour at all until 2026-09-07: `text-accent-default` and
 * `bg-accent-default/40` are not classes the preset defines (the accent tokens
 * are `accent-primary`, `accent-muted`, `accent-hover`), so both compiled to
 * nothing and the marker rendered in the inherited body colour. A story would
 * have shown it; there was not one, which is why there is one now.
 */
export const Unread: Story = { args: { threads: THREADS, unread: { [THREADS[0].id]: THREADS[0].replies[1].id } } }
