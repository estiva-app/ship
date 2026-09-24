/**
 * A file drawn inside a description — SPEC §13.3's `attachment` block, SHI-2.
 *
 * The block is new to Ship; the *drawing* is not. `attrs` are the `imeta`
 * fields, so this reuses `Attachment` — the component written for a message's
 * files, including the signed fetch that media GET requires. What is checked
 * here is the mapping into it, and the one case §13.3 gives a rule for: a block
 * missing a REQUIRED field is malformed, and a reader must show its inline text
 * rather than draw a broken file.
 *
 * `blobObjectUrl` is mocked because the real one signs through Estiva ID.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const blobObjectUrl = vi.fn<(url: string) => Promise<string>>()
vi.mock('@/api/blobs', () => ({ blobObjectUrl: (url: string) => blobObjectUrl(url) }))

import { RichText } from './RichText'

const SHA = 'f'.repeat(64)
const FILE = { url: `/media/${SHA}.png`, m: 'image/png', x: SHA, size: 4096, filename: 'diagram.png' }

const doc = (...blocks: unknown[]) => JSON.stringify({ type: 'doc', content: blocks })
const attachment = (attrs: Record<string, unknown>) => ({ type: 'attachment', id: 'b2', attrs })
const show = (value: string) => render(<RichText value={value} format="blocks" />).container

beforeEach(() => {
  blobObjectUrl.mockReset()
})

describe('an attachment block', () => {
  it('draws the file, fetching its bytes', async () => {
    blobObjectUrl.mockResolvedValue('blob:fetched')
    show(doc(attachment(FILE)))
    expect(await screen.findByAltText('diagram.png')).toHaveAttribute('src', 'blob:fetched')
  })

  it('prefers the relay’s thumbnail when there is one', async () => {
    blobObjectUrl.mockResolvedValue('blob:fetched')
    const thumb = `/media/${SHA}.thumb.jpg`
    show(doc(attachment({ ...FILE, thumb })))
    await screen.findByAltText('diagram.png')
    expect(blobObjectUrl).toHaveBeenCalledWith(thumb)
  })

  it('keeps the block id, so a comment can still be anchored to it', () => {
    blobObjectUrl.mockResolvedValue('blob:fetched')
    expect(show(doc(attachment(FILE))).querySelector('[data-block-id="b2"]')).not.toBeNull()
  })

  it('sits between the paragraphs it was placed between', async () => {
    blobObjectUrl.mockResolvedValue('blob:fetched')
    const container = show(
      doc(
        { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'before' }] },
        attachment(FILE),
        { type: 'paragraph', id: 'b3', content: [{ type: 'text', text: 'after' }] },
      ),
    )
    await screen.findByAltText('diagram.png')
    expect(container.textContent).toContain('before')
    expect(container.textContent).toContain('after')
  })

  /*
    §13.3: a block missing a REQUIRED field is malformed, and the rule for a
    malformed block is the rule for an unknown one — render its inline text,
    never drop it. Drawing a file from attrs this cannot vouch for would be a
    broken image with nothing to explain it.
  */
  it('falls back rather than drawing a file it cannot vouch for', () => {
    for (const field of ['url', 'm', 'x', 'size']) {
      const broken = { ...FILE } as Record<string, unknown>
      delete broken[field]
      const container = show(doc({ type: 'attachment', id: 'b2', attrs: broken, content: [{ type: 'text', text: 'a diagram' }] }))
      expect(container.querySelector('img'), `${field} missing should not draw`).toBeNull()
      expect(container.textContent).toContain('a diagram')
    }
    expect(blobObjectUrl).not.toHaveBeenCalled()
  })
})
