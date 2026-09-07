import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Reactions } from './Reactions'

/**
 * Reactions on a message — CON-2.
 *
 * Two shapes, and which one appears is not styling: with a handler a reaction
 * is a control (`Button` small, `aria-pressed` when it is yours) and the picker
 * appears; without one nobody may ever react here, and Button's page says such
 * a control is *absent, not disabled* — so it becomes a `Chip`, which is what
 * standing information is.
 *
 * The picker is a strip of `IconButton`s because `Menu`'s page sends reactions
 * there by name. A pill is what this really wants, and the package has none —
 * `Reaction` is proposed to `@estiva-app/ui`, and it would retire Peek's fork
 * of it too.
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

/** Two emoji, ordered most-reacted first, with the picker. */
export const Default: Story = { args: { onToggle: fn() } }

/**
 * Signed out — no handler at all.
 *
 * Chips, not disabled buttons: the reader may never react here, and a disabled
 * control that can never become enabled is a promise the surface cannot keep.
 */
export const ReadOnly: Story = {}

/** One of them is yours: `outlined` and `aria-pressed`, so clicking takes it back. */
export const Mine: Story = {
  args: {
    onToggle: fn(),
    reactions: [
      { emoji: '👍', count: 2, by: ['a'.repeat(64), 'b'.repeat(64)], mine: 'my-event-id' },
      { emoji: '🎉', count: 1, by: ['c'.repeat(64)] },
    ],
  },
}

/** Nothing yet, but you may react — the picker alone. */
export const NoneYet: Story = { args: { onToggle: fn(), reactions: [] } }

/** Momentarily unavailable, which is what `disabled` plus a reason is for. */
export const Unavailable: Story = { args: { onToggle: fn(), disabledReason: 'Sign in to react.' } }

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

/** Nobody reacted and nobody may — draws nothing at all, rather than an empty row under every message. */
export const None: Story = { args: { reactions: [] } }
