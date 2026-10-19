/**
 * ✕ on a sent comment's card (WBM-7, Decided 19 Oct): offered to the comment's
 * author, as Edit is, and it asks for the edit that removes that one card.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const NADDR =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'
const ADDR = '30851:b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3:a742e679-ca8c-488e-8d60-9836cc81bde2'
const BOB = 'b'.repeat(64)

const thread = (layout: 'detailed' | 'compact'): ThreadData => ({
  id: 't1',
  root: { id: 't1', author: { name: 'Bob' }, at: 1000, body: `see ${NADDR}`, by: BOB, embeds: [{ value: ADDR, layout }] },
  replies: [],
})

const noop = () => {}

describe('✕ on a sent comment’s card', () => {
  it('is offered to its author and asks for the edit that removes that card', async () => {
    const onEditMessage = vi.fn()
    render(<ThreadList threads={[thread('detailed')]} onStart={noop} onReply={noop} viewer={BOB} onEditMessage={onEditMessage} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove card' }))
    expect(onEditMessage).toHaveBeenCalledWith('t1', `see ${NADDR}`, ADDR)
  })

  it('is not offered on somebody else’s comment', async () => {
    const { container } = render(<ThreadList threads={[thread('detailed')]} onStart={noop} onReply={noop} viewer={'c'.repeat(64)} onEditMessage={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('[data-card="detailed"]')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Remove card' })).toBeNull()
  })

  it('is not offered on an old compact card, drawn as its row', async () => {
    const { container } = render(<ThreadList threads={[thread('compact')]} onStart={noop} onReply={noop} viewer={BOB} onEditMessage={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('[data-card="compact"]')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Remove card' })).toBeNull()
  })
})
