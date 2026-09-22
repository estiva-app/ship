import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConversationCount } from './ConversationCount'

/*
  Three stories, and none of them is the `unit`.

  `unit` changes what the number *means* - an issue row counts threads at the
  root, a foreign file counts comments with their replies - but it changes
  nothing on screen: it is the sentence a screen reader is given. A second
  story drawing the same glyph beside a different number would say that the
  two look different, and they do not (Katerina, 22 September). It is on the
  page instead.
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

/** Zero draws nothing at all. A zero is a real answer on the wire, but a column of noughts says less than their absence. */
export const Zero: Story = { args: { count: 0 } }
