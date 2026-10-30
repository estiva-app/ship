import type { Meta, StoryObj } from '@storybook/react-vite'
import { addrToNaddr } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { ShipRichText } from './ShipRichText'

/*
  The block vocabulary, in both content models — SPEC §13.

  The parsing is the package's and is tested there against real published
  bodies; what is Ship's, and therefore what these stories show, is the mapping
  to elements. Including the part that matters most: a body was written by
  somebody else, so markup in it stays text.
*/
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const ADDR = `30851:${ADA}:0212db6d`
const NADDR = `nostr:${addrToNaddr(ADDR)}`

const issue = {
  ref: ADDR,
  address: ADDR,
  kind: 30851,
  widget: 'row',
  appName: 'Estiva Ship',
  slots: { title: { value: 'Ship the block model' }, status: { value: 'In Progress', colour: 'blue' } },
  meta: [{ label: 'Ref', value: 'SHI-7', field: 'ref' }],
  actions: [],
  comments: [],
} as unknown as ForeignObject

const MARKER = [
  '# Cut-over checklist',
  '',
  `What has to be true before the old read path is turned off. See ${NADDR} for the rest.`,
  '',
  '- the **board**, which reads two folders',
  '- `publish-manifest.ts`, once the slots settle',
  '',
  '> A body is untrusted text: <b>this stays text</b>.',
  '',
  '```ts',
  'const a = 1',
  '```',
].join('\n')

const meta = {
  title: 'Primitives/ShipRichText',
  component: ShipRichText,
  args: { nameOf: (key: string) => (key === ADA ? 'Ada Lovelace' : `${key.slice(0, 8)}…`), resolved: { [NADDR]: issue } },
  decorators: [(Story) => <div className="w-[560px]"><Story /></div>],
} satisfies Meta<typeof ShipRichText>

export default meta
type Story = StoryObj<typeof meta>

/** Marker text, which is what every published description is today: every block, a link inside a sentence as the kit's chip, and `<b>` reaching the screen as characters. */
export const MarkerBody: Story = { args: { value: MARKER, format: 'marker' } }

/** A block document. The last block is a type from a later version of the spec: its inline text is drawn rather than dropped, because a block that vanishes looks like one you are not allowed to see. */
export const BlockDocument: Story = {
  args: {
    format: 'blocks',
    value: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', id: 'h1', attrs: { level: 2 }, content: [{ type: 'text', text: 'Spec' }] },
        {
          type: 'paragraph',
          id: 'p1',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'underlined', marks: [{ type: 'underline' }] },
          ],
        },
        { type: 'timeline', id: 'x1', content: [{ type: 'text', text: 'a block type from a later version' }] },
      ],
    }),
  },
}

/**
 * A table — §13.3, and the one block the protocol names without naming its
 * parts. The nesting here is ProseMirror's, which is what Ship's editor writes.
 */
export const Table: Story = {
  args: {
    format: 'blocks',
    value: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'table',
          id: 't1',
          content: [
            {
              type: 'tableRow',
              id: 'r1',
              content: [
                { type: 'tableHeader', id: 'h1', content: [{ type: 'paragraph', id: 'hp1', content: [{ type: 'text', text: 'Stage' }] }] },
                { type: 'tableHeader', id: 'h2', content: [{ type: 'paragraph', id: 'hp2', content: [{ type: 'text', text: 'Who' }] }] },
                { type: 'tableHeader', id: 'h3', content: [{ type: 'paragraph', id: 'hp3', content: [{ type: 'text', text: 'When' }] }] },
              ],
            },
            {
              type: 'tableRow',
              id: 'r2',
              content: [
                { type: 'tableCell', id: 'c1', content: [{ type: 'paragraph', id: 'cp1', content: [{ type: 'text', text: 'Turn off the old read' }] }] },
                { type: 'tableCell', id: 'c2', content: [{ type: 'paragraph', id: 'cp2', content: [{ type: 'text', text: 'Ada' }] }] },
                { type: 'tableCell', id: 'c3', content: [{ type: 'paragraph', id: 'cp3', content: [{ type: 'text', text: 'once the board reads one folder' }] }] },
              ],
            },
            {
              type: 'tableRow',
              id: 'r3',
              content: [
                { type: 'tableCell', id: 'c4', content: [{ type: 'paragraph', id: 'cp4', content: [{ type: 'text', text: 'Backfill the folders' }] }] },
                { type: 'tableCell', id: 'c5', content: [{ type: 'paragraph', id: 'cp5', content: [{ type: 'text', text: 'Ravi' }] }] },
                { type: 'tableCell', id: 'c6', content: [{ type: 'paragraph', id: 'cp6', content: [{ type: 'text', text: 'done' }] }] },
              ],
            },
          ],
        },
      ],
    }),
  },
}
