/**
 * An attachment reaches the screen — CON-12, SHI-1's screenshot half.
 *
 * `scripts/attachments.test.ts` asserts the fold reads `imeta`. This asserts
 * the fold is *drawn*, which is the separate claim: a correct predicate wired
 * to nothing is exactly how the reply-reaction path shipped broken.
 *
 * The relay is mocked because the assertion is about the component's three
 * states, not about Blossom — `packages/protocol/test/media.test.ts` holds the
 * authorization to the relay's own refusals.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Imeta } from '@estiva-app/protocol'

const blobObjectUrl = vi.fn()
vi.mock('@/api/blobs', () => ({ blobObjectUrl: (url: string) => blobObjectUrl(url) }))

import { Attachment, Attachments } from './Attachment'

const SHA = 'a'.repeat(64)
const image: Imeta = {
  url: `https://buzz.estiva.app/media/${SHA}.jpg`,
  m: 'image/jpeg',
  x: SHA,
  size: 12_345,
  filename: 'screenshot.jpg',
}

beforeEach(() => {
  blobObjectUrl.mockReset()
})

describe('Attachment', () => {
  it('draws the image once its bytes arrive', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const c = render(<Attachment file={image} />).container
    await waitFor(() => expect(c.querySelector('[data-attachment="image"]')).toBeTruthy())
    expect(c.querySelector('img')?.getAttribute('src')).toBe('blob:fake')
  })

  /* The whole reason a plain <img src> cannot be used: media GET is
     authenticated, so the URL in the tag is not something the browser may
     fetch on its own. If this ever stops being a fetch, it stops working. */
  it('fetches the bytes rather than pointing an img at the relay', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const c = render(<Attachment file={image} />).container
    await waitFor(() => expect(c.querySelector('img')).toBeTruthy())
    expect(blobObjectUrl).toHaveBeenCalledWith(image.url)
    expect(c.querySelector('img')?.getAttribute('src')).not.toContain('/media/')
  })

  /* The relay generates one and it is smaller. Asking for the full image in a
     conversation card would pull megabytes per message. */
  it('prefers the relay-generated thumbnail when there is one', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const thumb = `https://buzz.estiva.app/media/${SHA}.thumb.jpg`
    render(<Attachment file={{ ...image, thumb }} />)
    await waitFor(() => expect(blobObjectUrl).toHaveBeenCalledWith(thumb))
  })

  it('shows a placeholder while the bytes are in flight', () => {
    blobObjectUrl.mockReturnValue(new Promise(() => {}))
    const c = render(<Attachment file={image} />).container
    expect(c.querySelector('[data-attachment="loading"]')).toBeTruthy()
  })

  /*
    A file that cannot be read is SAID, never dropped. The message claims an
    image is attached; a card that silently renders nothing leaves the reader
    thinking the sender forgot it — and the likeliest cause here is
    `relay_membership_required`, a real answer about a channel this reader is
    not in.
  */
  it('says so when the bytes cannot be read, rather than drawing nothing', async () => {
    blobObjectUrl.mockRejectedValue(new Error('blob read failed: 401'))
    const c = render(<Attachment file={image} />).container
    await waitFor(() => expect(c.querySelector('[data-attachment="unreadable"]')).toBeTruthy())
    expect(screen.getByText(/screenshot\.jpg/)).toBeTruthy()
  })

  /* Alt text is what a screen reader says. An empty alt would announce the
     image as decorative, which an attachment somebody posted never is. */
  it('never renders an empty alt', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const c = render(<Attachment file={{ ...image, filename: undefined }} />).container
    await waitFor(() => expect(c.querySelector('img')).toBeTruthy())
    expect(c.querySelector('img')?.getAttribute('alt')).toBeTruthy()
  })

  it('prefers the sender’s alt text over the filename', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const c = render(<Attachment file={{ ...image, alt: 'the failing dialog' }} />).container
    await waitFor(() => expect(c.querySelector('img')).toBeTruthy())
    expect(c.querySelector('img')?.getAttribute('alt')).toBe('the failing dialog')
  })

  /* A PDF has no thumbnail and nothing to draw. Fetching it to render a chip
     would download the file to display its own name. */
  it('draws a non-image as a named chip without fetching it', () => {
    const pdf: Imeta = { url: `https://buzz.estiva.app/media/${SHA}.pdf`, m: 'application/pdf', x: SHA, size: 2_097_152, filename: 'spec.pdf' }
    const c = render(<Attachment file={pdf} />).container
    expect(c.querySelector('[data-attachment="file"]')).toBeTruthy()
    expect(screen.getByText('spec.pdf')).toBeTruthy()
    expect(screen.getByText('2.0 MB')).toBeTruthy()
    expect(blobObjectUrl).not.toHaveBeenCalled()
  })
})

describe('Attachments', () => {
  /* Nothing at all for a message with no files — an empty row would put a gap
     under every message in every thread. */
  it('renders nothing when there are none', () => {
    expect(render(<Attachments files={[]} />).container.firstChild).toBeNull()
    expect(render(<Attachments files={undefined} />).container.firstChild).toBeNull()
  })

  it('draws every file on the message', async () => {
    blobObjectUrl.mockResolvedValue('blob:fake')
    const second: Imeta = { ...image, x: 'c'.repeat(64), url: `https://buzz.estiva.app/media/${'c'.repeat(64)}.png`, m: 'image/png' }
    const c = render(<Attachments files={[image, second]} />).container
    await waitFor(() => expect(c.querySelectorAll('img').length).toBe(2))
  })
})
