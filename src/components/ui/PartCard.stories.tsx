import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ForeignObject } from '@/api/foreign'
import { PartCardView } from './PartCard'

/*
  Every state a part draws (SPEC §13.6.1, COM-2), as Peek's stories show them:
  the read has already happened, so nothing here asks a relay. A picture's bytes
  need the signed fetch, which a story does not have, so the image story draws
  the card's own failure — the shape is what it is for.
*/
const ADDRESS = '30851:f:b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
const LINK = 'https://ship.estiva.app/issue/plan-the-launch-b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5#block-p1'
const object = { ref: ADDRESS, appName: 'Ship', noun: 'issue', slots: { title: { value: 'Plan the launch' } } } as unknown as ForeignObject
const text = (t: string) => [{ type: 'text', text: t }]

const meta = {
  title: 'Primitives/PartCard',
  component: PartCardView,
  args: { address: ADDRESS, block: 'p1', view: { state: 'loading' } },
  decorators: [(Story) => <div className="w-[520px]">{Story()}</div>],
} satisfies Meta<typeof PartCardView>
export default meta
type Story = StoryObj<typeof meta>

export const Paragraph: Story = {
  args: { view: { state: 'resolved', object, link: LINK, block: { type: 'paragraph', id: 'p1', content: text('We ship on Friday, after the relay migration is checked on production.') } as never } },
}

export const LongTable: Story = {
  args: {
    view: {
      state: 'resolved',
      object,
      link: LINK,
      block: {
        type: 'table',
        id: 'p1',
        content: Array.from({ length: 10 }, (_, i) => ({
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: text(`Step ${i + 1}`) }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: text(i < 4 ? 'Done' : 'To do') }] },
          ],
        })),
      } as never,
    },
  },
}

export const Image: Story = {
  args: {
    view: {
      state: 'resolved',
      object,
      link: LINK,
      block: { type: 'attachment', id: 'p1', attrs: { url: 'https://example.invalid/media/a', m: 'image/png', x: 'a'.repeat(64), size: 1024, filename: 'mock.png' } } as never,
    },
  },
}

export const PartDeleted: Story = { args: { view: { state: 'detached', object, link: LINK } } }
export const NoParts: Story = { args: { view: { state: 'unaddressable', object, link: LINK } } }
export const Deleted: Story = { args: { view: { state: 'deleted' } } }
export const NotAvailable: Story = { args: { view: { state: 'unreadable' } } }
export const Loading: Story = {}
