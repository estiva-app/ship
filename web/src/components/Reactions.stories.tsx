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
 * The pill is the package's `Reaction` (0.7.0). The picker is not in this row
 * any more (0.10.0, D34): it is the package's `ReactionPicker`, opened from
 * the "React" button among the message's tools — see the Conversations
 * stories. With nothing to show, this row draws nothing.
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

/** Momentarily unavailable, which is what `disabled` plus a reason is for. */
export const Unavailable: Story = { args: { onToggle: fn(), disabledReason: 'Sign in to react.' } }
