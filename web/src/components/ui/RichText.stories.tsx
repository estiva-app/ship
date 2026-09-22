import type { Meta, StoryObj } from '@storybook/react-vite'
import { addrToNaddr } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { RichText } from './RichText'

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
  slots: { title: { value: 'Ship the block model' }, status: { value: 'In Progress' } },
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
  title: 'Primitives/RichText',
  component: RichText,
  args: { nameOf: (key: string) => (key === ADA ? 'Ada Lovelace' : `${key.slice(0, 8)}…`), resolved: { [NADDR]: issue } },
  decorators: [(Story) => <div className="w-[560px]"><Story /></div>],
} satisfies Meta<typeof RichText>

export default meta
type Story = StoryObj<typeof meta>

/** Marker text, which is what every published description is today: every block, a mention inside a sentence, and `<b>` reaching the screen as characters. */
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

/** A table is not in the message dialect, so its line stays literal rather than becoming a table nobody published. */
export const NoTableInMarker: Story = { args: { value: '| a | b |\n| - | - |', format: 'marker' } }
