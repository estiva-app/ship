import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConversationCount } from './ConversationCount'

/*
  Two stories carry the whole component: the unit, which changes what the
  number means, and the zero, which is the only state you cannot see.
*/
const meta = {
  title: 'Primitives/ConversationCount',
  component: ConversationCount,
  args: { count: 7, unit: 'conversation' },
} satisfies Meta<typeof ConversationCount>

export default meta
type Story = StoryObj<typeof meta>

/** An issue row counts *conversations* — threads at the root. */
export const Conversations: Story = {}

/** One. The screen reader is given "1 conversation", not "1 conversations". */
export const One: Story = { args: { count: 1 } }

/** A foreign file counts *comments* addressed to it, replies included. Same glyph, different sentence. */
export const Comments: Story = { args: { count: 23, unit: 'comment' } }

/** Zero draws nothing at all. A zero is a real answer on the wire, but a column of noughts says less than their absence. */
export const Zero: Story = { args: { count: 0 } }
