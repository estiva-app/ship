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
