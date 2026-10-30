import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { ForeignObject } from './ForeignObject'

/*
  A file Ship lists by itself, as the kit's row or card (Katerina, 30 Oct,
  widget review 52): the widget its manifest hints, and "not available" in its
  place for a file this reader may not see (SPEC §13.3, RFC 0.4 §13.1).

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

/** The default close of the chain, as the kit's card: its tile, title and kind, its summary, its status and owner as words, and the comments the caller read. */
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

/** `row` — the kit's row, for a list of them. */
export const Row: Story = {
  args: { object: obj({ widget: 'row', slots: { title: { value: 'Design review' } } }) },
}

/** `message` — the kit's row for words a person wrote: their face, their name and the words; it opens where it lives. None of card/row/table/stat describes one, which is why the chain exists. */
export const Message: Story = {
  args: {
    object: obj({
      kind: 9,
      widget: ['message', 'card'],
      noun: 'message',
      openUrl: 'https://peek.estiva.app/o/nevent1x',
      slots: { title: { value: ADA, isPubkey: true }, body: { value: 'Moved the read path behind the flag — nothing on production yet.' } },
      people: { [ADA]: { displayName: 'Ada Lovelace' } },
    }),
  },
}

/** You may not read it: "not available" in the card's place, with the way to open it in its app. A gated read and an empty object arrive identically from the relay and must never look identical here. */
export const Unreachable: Story = {
  args: { object: obj({ unreachable: true, noun: 'topic', openUrl: 'https://peek.estiva.app/t/x' }) },
}

/** A `list` slot: the card lists the files inside it, each opening on its own. */
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

/**
 * A linked Folder's card: the files in it this reader can open, in the
 * Folder's order, each through its own app's projection — topics, projects
 * and documents, never its chat messages, and nothing counting the rest
 * (SPEC §3.2; Miky, 2026-10-16).
 */
export const FolderWithFiles: Story = {
  args: {
    object: obj({
      kind: 39000,
      noun: 'folder',
      address: '39000:relay:hq',
      slots: { title: { value: 'Estiva HQ' }, subtitle: { value: 'Where the team plans the week.' } },
      children: [
        // Each as its own manifest declares it: Peek's topic, Ship's project and Leaf's document are all `card`.
        obj({ ref: 'f1', noun: 'topic', slots: { title: { value: 'Weekly notes' } } }),
        obj({ ref: 'f2', kind: 30850, noun: 'project', appName: 'Estiva Ship', slots: { title: { value: 'Widgets 2: build 1' }, subtitle: { value: 'Messages draw their links by where they sit.' } } }),
        obj({ ref: 'f3', kind: 30842, noun: 'document', appName: 'Leaf', slots: { title: { value: 'Team handbook' } } }),
      ],
    }),
  },
}


/** A kind nobody here has heard of, falling through the chain to `card`. Not one line here knows what Peek is. */
export const UnknownWidget: Story = {
  args: { object: obj({ appName: 'Tide table', kind: 30911, widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }) },
}
