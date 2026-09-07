import type { Meta, StoryObj } from '@storybook/react-vite'
import { Reactions } from './Reactions'

/**
 * Reactions on a message, as Ship can currently show them — CON-2.
 *
 * **Read-only, and that is a fact about the credential rather than a design
 * choice.** `estiva-ship`'s `allowedKinds` has no `7`, so this app cannot
 * publish one; `estiva-peek` can. Everything here was written in Peek and is
 * being read across the workspace.
 *
 * That is also why they are Chips. Chip's page rules itself out for anything
 * clickable — when Ship gets the grant these become controls and want the
 * package's `Reaction`, which does not exist yet.
 */
const NAMES: Record<string, string> = {
  ['a'.repeat(64)]: 'Ana Duarte',
  ['b'.repeat(64)]: 'Ravi Mehta',
  ['c'.repeat(64)]: 'Mara Sato',
}
const nameOf = (pubkey: string) => NAMES[pubkey] ?? `${pubkey.slice(0, 8)}…`

const meta = {
  title: 'Conversations/Reactions',
  component: Reactions,
  args: {
    nameOf,
    reactions: [
      { emoji: '👍', count: 2, by: ['a'.repeat(64), 'b'.repeat(64)] },
      { emoji: '🎉', count: 1, by: ['c'.repeat(64)] },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Reactions>

export default meta
type Story = StoryObj<typeof meta>

/** Two emoji, ordered most-reacted first. */
export const Default: Story = {}

/** One reactor — the tooltip reads "Ana Duarte reacted with 👍", not a list of one. */
export const Single: Story = { args: { reactions: [{ emoji: '👍', count: 1, by: ['a'.repeat(64)] }] } }

/** A reactor with no kind:0. An anonymous participant stays a shortened key rather than "unknown". */
export const NoProfile: Story = {
  args: { nameOf: undefined, reactions: [{ emoji: '🚀', count: 1, by: ['f'.repeat(64)] }] },
}

/** Many emoji on one message — the row wraps rather than pushing the card wide. */
export const Many: Story = {
  args: {
    reactions: ['👍', '🎉', '🚀', '💯', '🙏', '👀', '✅'].map((emoji, i) => ({
      emoji,
      count: 7 - i,
      by: Array.from({ length: 7 - i }, (_, j) => String(j).repeat(64).slice(0, 64)),
    })),
  },
}

/** Nobody reacted. Draws nothing at all — an empty row would be a gap under every message. */
export const None: Story = { args: { reactions: [] } }
