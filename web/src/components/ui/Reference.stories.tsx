import type { Meta, StoryObj } from '@storybook/react-vite'
import { addrToNaddr, encodeNevent, encodeNpub } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { Reference } from './Reference'

/*
  One chip for every kind of reference (RIC-10), drawn with what the URI
  turned out to name. The objects are the shapes the runtime hands back —
  Ship's own issue through Ship's manifest, and a Peek message through
  Peek's (RIC-11): titled by its author's key, the text as `body`, drawn as a
  `message`. Nothing here is looked up; a story has no relay to ask.

  A chip that names something leads to it (RIC-16): the issue to its page
  here, the message to Peek at the `openUrl` Peek's manifest gave. Both carry
  what the runtime carries — an `address` for the issue, an `openUrl` for the
  message — so the chips are anchors here the way they are on production.
*/
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const STRANGER = 'cd'.repeat(32)
const D = '0212db6d-bcbf-40d0-890e-f4f056db2f5d'
const NPUB = `nostr:${encodeNpub(ADA)}`
const NADDR = `nostr:${addrToNaddr(`30851:${ADA}:${D}`)}`
const NEVENT = `nostr:${encodeNevent({ id: 'c'.repeat(64), relays: [], kind: 9 })}`
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : `${pubkey.slice(0, 8)}…`)

const issue = {
  ref: `30851:${ADA}:${D}`,
  address: `30851:${ADA}:${D}`,
  kind: 30851,
  widget: 'row',
  appName: 'Estiva Ship',
  slots: { title: { value: 'Ship the block model' }, status: { value: 'In Progress' } },
} as unknown as ForeignObject

const message = {
  ref: 'nevent1msg',
  kind: 9,
  widget: ['message', 'card'],
  appName: 'Peek',
  openUrl: `https://peek.estiva.app/o/${NEVENT.replace(/^nostr:/, '')}`,
  slots: {
    title: { value: ADA, isPubkey: true },
    body: { value: 'Green. Leaving the pin in place until Monday.' },
  },
  people: { [ADA]: { displayName: 'Ada Lovelace' } },
} as unknown as ForeignObject

const meta = {
  title: 'Primitives/Reference',
  component: Reference,
  args: { uri: NADDR, object: issue, nameOf },
  argTypes: { object: { control: false }, nameOf: { control: false } },
  decorators: [
    (Story) => (
      <p className="max-w-[480px] text-body-2 text-text-primary">
        Tracked in <Story /> for now.
      </p>
    ),
  ],
} satisfies Meta<typeof Reference>

export default meta
type Story = StoryObj<typeof meta>

/**
 * An object from its own projection: the title, and the status the manifest
 * declares. One of Ship's own, so it is a link to its page here (RIC-16).
 */
export const Object: Story = {}

/** A person, from the workspace directory. A label: Ship has no page for a person. */
export const Person: Story = { args: { uri: NPUB, object: undefined } }

/**
 * A Peek message (RIC-11). The manifest titles it by its author, so the chip
 * names the person and quotes the opening words — never the 64-hex key. It
 * opens in Peek, in a new tab (RIC-16).
 */
export const Message: Story = { args: { uri: NEVENT, object: message } }

/** The same message when the runtime found no profile: a short key, still never the whole one. */
export const MessageFromAStranger: Story = {
  args: {
    uri: NEVENT,
    object: { ...message, slots: { ...message.slots, title: { value: STRANGER, isPubkey: true } }, people: {} },
    nameOf: undefined,
  },
}

/** Still resolving, and resolved to nothing — drawn alike, marked apart (§13.1: never blank). */
export const Unresolved: Story = {
  render: (args) => (
    <>
      <Reference {...args} uri={NADDR} object={undefined} /> and <Reference {...args} uri={NADDR} object={null} />
    </>
  ),
}
