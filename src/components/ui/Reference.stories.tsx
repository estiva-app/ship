import type { Meta, StoryObj } from '@storybook/react-vite'
import { encodeNpub } from '@estiva-app/protocol'
import { Reference } from './Reference'

/*
  A person named in text, by the workspace directory's name. A file or a
  message named in text is the kit's chip (`MessageChip`, the package's
  LinkChip stories), in a box being written in too: the kit has no kind for a
  person, so this is what stays of Ship's own chip.
*/
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const STRANGER = 'cd'.repeat(32)
const NPUB = `nostr:${encodeNpub(ADA)}`
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : `${pubkey.slice(0, 8)}…`)

const meta = {
  title: 'Primitives/Reference',
  component: Reference,
  args: { uri: NPUB, nameOf },
  argTypes: { nameOf: { control: false } },
  decorators: [
    (Story) => (
      <p className="max-w-[480px] text-body-2 text-text-primary">
        Ask <Story /> about it.
      </p>
    ),
  ],
} satisfies Meta<typeof Reference>

export default meta
type Story = StoryObj<typeof meta>

/** A person, from the workspace directory. A label: Ship has no page for a person. */
export const Person: Story = {}

/** Named urgently by the message (CON-24): the same chip in the urgent tone, for every reader. */
export const Urgent: Story = { args: { urgent: [ADA] } }

/** Somebody the directory cannot name: a short key, quiet, the whole address on hover — never blank, never the whole key. */
export const Unnamed: Story = { args: { uri: `nostr:${encodeNpub(STRANGER)}` } }
