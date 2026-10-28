/**
 * Conversations still on the way never read as none — APP-5.
 *
 * Ship reads a Folder's conversations only for the screen that draws them, so
 * moving from the Issues page into an issue can draw the page a moment before
 * its conversation. In that moment the page must not say "No conversations
 * yet" or "No related conversations yet": both are claims about the issue, and
 * both would be false.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { MentionList, ThreadList } from './ThreadList'

const noop = async () => true as const

describe('conversations on the way (APP-5)', () => {
  it('says nothing about an issue with no conversation while its conversations load, then says it has none', () => {
    const { rerender } = render(<ThreadList threads={[]} loading onStart={noop} onReply={noop} />)
    expect(screen.queryByText('No conversations yet.')).toBeNull()
    rerender(<ThreadList threads={[]} onStart={noop} onReply={noop} />)
    expect(screen.getByText('No conversations yet.')).toBeInTheDocument()
  })

  it('says nothing about where else it was mentioned while that loads, then says there is nothing', () => {
    const { rerender } = render(<MentionList items={[]} loading onReply={noop} />)
    expect(screen.queryByText('No related conversations yet.')).toBeNull()
    rerender(<MentionList items={[]} onReply={noop} />)
    expect(screen.getByText('No related conversations yet.')).toBeInTheDocument()
  })
})
