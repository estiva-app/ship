import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { BlockAnchor } from '@estiva-app/protocol'
import { ConversationThread, type ThreadData } from '@/components/ConversationThread'
import { THREADS } from '@/fixtures/issues'
import { BlockAnchorNote } from './BlockAnchorNote'

/*
  Drawn where it appears (Katerina, 22 September): above the first message of a
  thread, inside the card, which is the only place it is ever seen. On its own
  it is a line of muted text and a rule, and a line of muted text does not tell
  you that the two failures below mean opposite things.

  These are the first Ship stories to carry an anchor at all. No fixture did,
  which is why the component was drawn by nothing.
*/
const QUOTE = 'The board reads two folders and unions them, which is why an archived project lands last.'

const anchored = (anchor: BlockAnchor): ThreadData => ({
  ...THREADS[0],
  root: { ...THREADS[0].root, anchor },
  replies: THREADS[0].replies.slice(0, 1),
})

const resolved = {
  state: 'resolved',
  id: 'p3',
  block: { type: 'paragraph', id: 'p3', content: [{ type: 'text', text: QUOTE }] },
} as unknown as BlockAnchor

const meta = {
  title: 'Conversations/BlockAnchorNote',
  component: BlockAnchorNote,
  decorators: [(Story) => <div className="w-[640px]"><Story /></div>],
} satisfies Meta<typeof BlockAnchorNote>

export default meta
type Story = StoryObj<typeof meta>

/** The paragraph the comment is about, quoted above it, so the remark sits beside its subject instead of somewhere above the fold. */
export const Resolved: Story = {
  render: () => <ConversationThread thread={anchored(resolved)} onReply={fn()} />,
}

/** That paragraph has since been deleted. Said out loud — silence here is indistinguishable from a comment about the whole object. */
export const Detached: Story = {
  render: () => <ConversationThread thread={anchored({ state: 'detached', id: 'p3' } as BlockAnchor)} onReply={fn()} />,
}

/** A different fact, deliberately worded differently: nothing was deleted, this description simply has no parts to point at. */
export const Unaddressable: Story = {
  render: () => <ConversationThread thread={anchored({ state: 'unaddressable', id: 'p3' } as BlockAnchor)} onReply={fn()} />,
}

/** No `block` tag at all: a comment about the whole object, which is what every comment in the workspace used to be. Nothing is drawn, and the card looks as it always has. */
export const Unanchored: Story = {
  render: () => <ConversationThread thread={anchored({ state: 'unanchored' } as BlockAnchor)} onReply={fn()} />,
}
