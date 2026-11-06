/**
 * A thread whose comment is gone, as Ship draws it (ONE-9, SPEC §6.4–§6.5): "This comment was deleted." when its
 * author deleted it, "This comment can't be shown." when it was not read and nothing says it was deleted, its replies
 * under it either way, still resolved when its last resolve says so, and no new reply.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { ThreadListView } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'
import type { Resolution } from '@/api'

const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const COMMENT = 'c'.repeat(64)
const REPLY = 'd'.repeat(64)

// Its comment was not in the read: the earliest reply stands in for it.
const gone: ThreadData = {
  id: COMMENT,
  root: { id: REPLY, author: { name: 'Ravi' }, at: 1_790_000_100, body: 'The reply stays', by: RAVI },
  replies: [],
  rootMissing: true,
}
const resolution: Resolution = { id: 'e'.repeat(64), action: 'resolved', by: ANA, at: 1_790_000_200, orderMs: 1_790_000_200_000, message: 'Done in the other issue', folder: 'f' }

const noop = async (): Promise<true> => true
const show = (props: Partial<Parameters<typeof ThreadListView>[0]>) =>
  render(<ThreadListView threads={[gone]} onStart={noop} onReply={noop} viewer={RAVI} nameOf={(key) => (key === ANA ? 'Ana' : 'Ravi')} {...props} />)

describe('a thread whose comment was deleted', () => {
  it('stays resolved, with who resolved it and their note, its reply under "This comment was deleted."', () => {
    show({ resolvedBy: { [COMMENT]: resolution }, goneBy: { [COMMENT]: 'deleted' } })
    // Resolved threads wait closed under "Resolved": a closed group draws nothing of them.
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }))
    expect(screen.getByText('This comment was deleted.')).toBeInTheDocument()
    expect(screen.getByText(/Done in the other issue/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('This comment was deleted.'))
    expect(screen.getByText('The reply stays')).toBeInTheDocument()
    // No new reply under a gone comment, and Ship offers no Resolve or Reopen.
    expect(screen.getByText('This thread takes no new replies.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Reply|Resolve|Reopen)$/ })).toBeNull()
  })
})

describe('a thread whose comment was not read, with no sign it was deleted', () => {
  it('says "This comment can’t be shown.", never that it was deleted, with its reply under it', () => {
    show({ goneBy: { [COMMENT]: 'missing' } })
    expect(screen.getByText('This comment can’t be shown.')).toBeInTheDocument()
    expect(screen.queryByText('This comment was deleted.')).toBeNull()
    fireEvent.click(screen.getByText('This comment can’t be shown.'))
    expect(screen.getByText('The reply stays')).toBeInTheDocument()
    expect(screen.getByText('This thread takes no new replies.')).toBeInTheDocument()
  })
})
