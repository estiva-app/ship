import type { Meta, StoryObj } from '@storybook/react-vite'
import type { BlockAnchor } from '@estiva-app/protocol'
import { BlockAnchorNote } from './BlockAnchorNote'

/*
  Four states, and the reason this component exists is that three of them must
  not collapse into one another (SPEC §13.6). A comment on a paragraph somebody
  deleted, and a comment on a description that never had paragraphs, mean
  opposite things and would otherwise read the same.
*/
const resolved = {
  state: 'resolved',
  id: 'p3',
  block: {
    type: 'paragraph',
    id: 'p3',
    content: [{ type: 'text', text: 'The board reads two folders and unions them, which is why an archived project lands last.' }],
  },
} as unknown as BlockAnchor

const meta = {
  title: 'Conversations/BlockAnchorNote',
  component: BlockAnchorNote,
  decorators: [(Story) => <div className="w-[560px]"><Story /></div>],
} satisfies Meta<typeof BlockAnchorNote>

export default meta
type Story = StoryObj<typeof meta>

/** The part of the description the comment is about, quoted above it, so the remark sits beside its subject. */
export const Resolved: Story = { args: { anchor: resolved } }

/** Something was there and is not. Said out loud, because a silent anchor is indistinguishable from a comment about the whole object. */
export const Detached: Story = { args: { anchor: { state: 'detached', id: 'p3' } as BlockAnchor } }

/** A different fact, deliberately worded differently: nothing was deleted, this description simply has no parts. */
export const Unaddressable: Story = { args: { anchor: { state: 'unaddressable', id: 'p3' } as BlockAnchor } }

/** No `block` tag at all: a comment about the whole object, which is what every comment in the workspace used to be. It draws nothing. */
export const Unanchored: Story = { args: { anchor: { state: 'unanchored' } as BlockAnchor } }
