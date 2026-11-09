/**
 * Resolve and Reopen on Ship's comments (ONE-8, SPEC §6.4 "What a thread offers"): an open thread offers Resolve, with
 * the note written in its dialog, and a resolved one Reopen, while the page takes writes. A refused resolve keeps the
 * dialog open and says why. A thread whose comment is gone, and every thread on a page nobody may write on (an archived
 * issue), offers neither.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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

const open: ThreadData = { id: COMMENT, root: { id: COMMENT, author: { name: 'Ana' }, at: 1_790_000_000, body: 'Is this ready?', by: ANA }, replies: [] }
const gone: ThreadData = { id: COMMENT, root: { id: REPLY, author: { name: 'Ravi' }, at: 1_790_000_100, body: 'The reply stays', by: RAVI }, replies: [], rootMissing: true }
const resolution: Resolution = { id: 'e'.repeat(64), action: 'resolved', by: ANA, at: 1_790_000_200, orderMs: 1_790_000_200_000, message: 'Shipped', folder: 'f' }

const noop = async (): Promise<true> => true
const show = (props: Partial<Parameters<typeof ThreadListView>[0]>) =>
  render(<ThreadListView threads={[open]} onStart={noop} onReply={noop} viewer={RAVI} nameOf={(key) => (key === ANA ? 'Ana' : 'Ravi')} {...props} />)

/** The kit's card draws its strip (React, Resolve, `…`) only while pointed at (Katerina, 1 November). */
const pointAt = () => document.querySelectorAll('[data-comment-body], [data-reply-id]').forEach((card) => fireEvent.mouseEnter(card))
/** Neither control on the card, pointed at (the tests above show pointing draws them where they are offered). */
function offersNeither() {
  pointAt()
  expect(screen.queryByRole('button', { name: /^(Resolve|Reopen)$/ })).toBeNull()
}

/** Resolve on the card's strip opens the dialog; its own Resolve sends the note. */
async function resolveWith(note: string) {
  pointAt()
  fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0])
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: note } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve' }))
  return dialog
}

describe('Resolve on an open thread', () => {
  it('sends the note from the dialog for that thread', async () => {
    const onResolve = vi.fn(async (): Promise<true> => true)
    show({ onResolve })
    await resolveWith('Shipped in #12')
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(COMMENT, true, 'Shipped in #12'))
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull()
  })

  it('keeps the dialog open on a refusal and says why', async () => {
    const onResolve = vi.fn(async () => 'App estiva-ship may not sign kind 9101')
    show({ onResolve })
    const dialog = await resolveWith('Done')
    expect(await within(dialog).findByText(/^Not resolved: /)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Reopen on a resolved thread', () => {
  it('reopens that thread, and offers no Resolve', async () => {
    const onResolve = vi.fn(async (): Promise<true> => true)
    show({ onResolve, resolvedBy: { [COMMENT]: resolution } })
    // Resolved threads wait closed under "Resolved".
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }))
    pointAt()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen' })[0])
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(COMMENT, false, undefined))
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
  })
})

describe('neither Resolve nor Reopen', () => {
  it('under a deleted comment, open or resolved', () => {
    const onResolve = vi.fn(noop)
    const { unmount } = show({ threads: [gone], goneBy: { [COMMENT]: 'deleted' }, onResolve })
    offersNeither()
    unmount()
    show({ threads: [gone], goneBy: { [COMMENT]: 'deleted' }, resolvedBy: { [COMMENT]: resolution }, onResolve })
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }))
    offersNeither()
  })

  it('on a page nobody may write on, such as an archived issue, open or resolved', () => {
    const onResolve = vi.fn(noop)
    const { unmount } = show({ onResolve, disabledReason: 'This issue is archived.' })
    offersNeither()
    unmount()
    show({ onResolve, disabledReason: 'This issue is archived.', resolvedBy: { [COMMENT]: resolution } })
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }))
    offersNeither()
  })
})
