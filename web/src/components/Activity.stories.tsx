import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ACTIVITY_ITEMS } from '@/fixtures/issues'
import { Activity } from './Activity'

/**
 * Conversations on files *related* to the one being read — CON-9's second list.
 *
 * One time-ordered list, with how each thread became related on the row rather
 * than as a section of its own. The two relations do not carry the same trust,
 * so they are not drawn with the same weight: a mention is anyone typing your
 * address, retroactively and permanently, and it recedes onto the page's own
 * ground behind a subtle border.
 */
const meta = {
  title: 'Conversations/Activity',
  component: Activity,
  args: { items: ACTIVITY_ITEMS, onReply: fn() },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Activity>

export default meta
type Story = StoryObj<typeof meta>

/** Both relations together — the only view that shows the weight difference. */
export const Default: Story = {}

/** A project's own subtree. Full weight: this is your work. */
export const SubFileOnly: Story = { args: { items: ACTIVITY_ITEMS.filter((i) => i.relation === 'sub-file') } }

/**
 * §5.1's case, and the reason the two lists exist: four messages of unrelated
 * discussion that name this object on the last one. It belongs here and would be
 * indefensible in the object's own comments.
 */
export const MentionOnly: Story = { args: { items: ACTIVITY_ITEMS.filter((i) => i.relation === 'mention') } }

/** A thread whose Folder Ship cannot name — a Peek topic paired with no project. */
export const NowhereNamed: Story = {
  args: { items: ACTIVITY_ITEMS.map((item) => ({ ...item, where: undefined })) },
}

/**
 * The horizon reached — `ACTIVITY_HORIZON`.
 *
 * The line under the list is the whole point of the story: CON-1's finding is
 * that an undocumented cap is indistinguishable from "nobody reacted", and here
 * it would be indistinguishable from "nothing else happened". On production
 * today this state is reachable on one project of eighteen.
 */
export const HorizonReached: Story = { args: { truncated: 10 } }

/** Nothing related yet. The empty state says what would appear, not "no data". */
export const Empty: Story = { args: { items: [] } }

/** Signed out: every composer disabled, with the reason as its tooltip. */
export const ReadOnly: Story = { args: { disabledReason: 'Sign in to reply.' } }
