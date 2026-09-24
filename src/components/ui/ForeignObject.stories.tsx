import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { ForeignObject } from './ForeignObject'

/*
  The six states, because the six are the component (SPEC §13.3, RFC 0.4 §13.1).

  Everything here is the shape the runtime hands over — a title, some secondary
  values, maybe a status, maybe children, and a widget hint. Nothing is looked
  up: a story has no relay to ask. The statuses carry the *label*, not the raw
  key, because that is what the projection sends (`map` in the manifest
  replaces the value with the vocabulary's label before a consumer sees it).
*/
const obj = (over: Record<string, unknown>): ForeignObjectData =>
  ({
    ref: 'r',
    address: '30840:a:r',
    eventId: 'e',
    kind: 30840,
    widget: 'card',
    appName: 'Peek',
    slots: {},
    meta: [],
    comments: [],
    actions: [],
    viaRecommendation: false,
    ...over,
  }) as unknown as ForeignObjectData

const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'

const meta = {
  title: 'Primitives/ForeignObject',
  component: ForeignObject,
  // The width a project page's content column gives it, as Related's story does.
  decorators: [(Story) => <div className="w-[560px]"><Story /></div>],
} satisfies Meta<typeof ForeignObject>

export default meta
type Story = StoryObj<typeof meta>

/** The default close of the chain: a title, a line under it, a status and the values the manifest declared. */
export const Card: Story = {
  args: {
    object: obj({
      slots: { title: { value: 'Cut-over checklist' }, subtitle: { value: 'What has to be true before the old read path is turned off.' }, status: { value: 'In Progress', colour: 'blue' } },
      meta: [{ label: 'Led by', value: ADA, isPubkey: true }],
      people: { [ADA]: { displayName: 'Ada Lovelace' } },
    }),
    conversations: 7,
  },
}

/** `row` — the same card, tighter, for a list of them. */
export const Row: Story = {
  args: { object: obj({ widget: 'row', slots: { title: { value: 'Design review' } } }) },
}

/** `message` — a face, a name, a body, and no card at all. None of card/row/table/stat describes one, which is why the chain exists. */
export const Message: Story = {
  args: {
    object: obj({
      widget: ['message', 'card'],
      slots: { title: { value: ADA, isPubkey: true }, body: { value: 'Moved the read path behind the flag — nothing on production yet.' } },
      people: { [ADA]: { displayName: 'Ada Lovelace' } },
    }),
  },
}

/** You may not read it. A gated read and an empty object arrive identically from the relay and must never look identical here. */
export const Unreachable: Story = {
  args: { object: obj({ unreachable: true, openUrl: 'https://peek.estiva.app/t/x' }) },
}

/** A `list` slot: every child is resolved through its own projection, so it is drawn with this same component. */
export const WithChildren: Story = {
  args: {
    object: obj({
      slots: { title: { value: 'Relay Migration' } },
      children: [
        obj({ ref: 'c1', widget: 'row', slots: { title: { value: 'Turn off the old read' } } }),
        obj({ ref: 'c2', widget: 'row', slots: { title: { value: 'Backfill the folders' } } }),
      ],
    }),
  },
}

/** A list declared and empty. "This holds nothing" and "this holds no list" are different sentences. */
export const EmptyList: Story = {
  args: { object: obj({ slots: { title: { value: 'Relay Migration' } }, children: [] }) },
}

/** A kind nobody here has heard of, falling through the chain to `card`. Not one line below knows what Peek is. */
export const UnknownWidget: Story = {
  args: { object: obj({ appName: 'Tide table', kind: 30911, widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }) },
}
