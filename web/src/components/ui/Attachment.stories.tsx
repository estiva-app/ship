import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Imeta } from '@estiva-app/protocol'
import { Attachment, Attachments } from './Attachment'

/*
  A file on a message, as a reader sees it — CON-12, SHI-1's screenshot half.

  Ship had no page for this until UIG-35, which is how it stayed the only
  181-line component in the repo nobody had looked at: the card is the
  package's `AttachmentCard`, and since 0.26.0 so are the fetch, the save and
  the full-screen viewer a picture opens in.

  `fetchImage` is the one thing Ship owns — reading a file with this viewer's
  own authorization — and it is a prop so a story can hand over a stub. Nothing
  here asks a relay; the pictures are drawn, not photographed.
*/
const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#0f1720"/>${body}</svg>`,
  )}`

const THUMB = svg(480, 270, `<circle cx="120" cy="90" r="52" fill="#56c8ff"/><rect x="196" y="150" width="220" height="70" rx="12" fill="#4ade8c"/>`)
const FULL = svg(960, 540, `<circle cx="240" cy="180" r="104" fill="#56c8ff"/><rect x="392" y="300" width="440" height="140" rx="24" fill="#4ade8c"/>`)

const SHA = 'a'.repeat(64)
const RELAY = 'https://buzz.estiva.app/media'

const screenshot: Imeta = {
  url: `${RELAY}/${SHA}.png`,
  thumb: `${RELAY}/${SHA}.thumb.jpg`,
  m: 'image/png',
  x: SHA,
  size: 840_000,
  filename: 'board-after-the-fix.png',
}

const pdf: Imeta = {
  url: `${RELAY}/${'b'.repeat(64)}.pdf`,
  m: 'application/pdf',
  x: 'b'.repeat(64),
  size: 2_412_000,
  filename: 'Q3-billing-summary.pdf',
}

/** The relay, stubbed: the thumbnail for the card, the original when it opens. */
const reads = (url: string) => Promise.resolve(url.includes('thumb') ? THUMB : FULL)

/** A relay that refuses — the usual one being a channel this reader is not in. */
const refuses = () => Promise.reject(new Error('relay_membership_required'))

/** Never answers, which is what a request in flight looks like. */
const waits = () => new Promise<string>(() => {})

const meta = {
  title: 'Primitives/Attachment',
  component: Attachment,
  parameters: { layout: 'padded' },
  args: { file: screenshot, fetchImage: reads },
} satisfies Meta<typeof Attachment>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A screenshot. **Press it** and it opens full screen, which Ship could not do
 * until 0.26.0 — a picture in an issue could be seen at 112px and no larger.
 * Escape, the ✕ or a press beside it closes it again.
 */
export const AScreenshot: Story = {}

/** A document: its type, its name and its size, opening in a new tab once its bytes arrive. */
export const ADocument: Story = { args: { file: pdf } }

/** The request is still in flight. A picture says so; a document keeps its row and simply does not open yet. */
export const StillLoading: Story = { args: { fetchImage: waits } }

/** Refused. Said, with the dashed hairline — never a gap, which would read as a sender who forgot the file. */
export const CouldNotBeRead: Story = { args: { fetchImage: refuses } }

/**
 * In a description being edited, a file neither opens nor downloads: that
 * editor saves and closes when it loses focus, and a link or a Download button
 * takes focus (measured 2026-09-15).
 */
export const InAnEditor: Story = { args: { file: pdf, opens: false } }

/** Every file on one message, in the order they were attached. */
export const SeveralOnOneMessage: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Attachments
      fetchImage={reads}
      files={[
        screenshot,
        pdf,
        { url: `${RELAY}/${'c'.repeat(64)}.csv`, m: 'text/csv', x: 'c'.repeat(64), size: 96_000, filename: 'raw-events.csv' },
      ]}
    />
  ),
}
