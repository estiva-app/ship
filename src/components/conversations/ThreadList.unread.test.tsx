// Moved from src/components/ConversationThread.unread.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

/**
 * What is new reaches the screen (CRO-13), on the kit's cards (ONE-6, step 3).
 *
 * "New since you last read this" is gone (Katerina, 2 November): a new comment
 * or reply is marked on itself, its dot and its edge, until it is read, and the
 * replies row says how many are new. Asserted at the component rather than only
 * in `unreadFeed.ts`, because the rule being right and the rule being *rendered*
 * are different claims — a correct predicate wired to nothing is exactly how
 * Peek shipped a read path that never ran.
 */
const LABEL = /new since you last read this/i

const thread = (id: string, replyIds: string[] = []): ThreadData => ({
  id,
  root: { id, author: { name: 'Bob' }, at: 1000, body: `root ${id}`, by: 'bob' },
  replies: replyIds.map((r) => ({ id: r, author: { name: 'Bob' }, at: 2000, body: `reply ${r}`, by: 'bob' })),
})

const noop = async (): Promise<true> => true

/** The unread dot on a comment, and on a reply. */
const commentIsNew = (id: string) => !!document.querySelector(`[data-thread="${id}"] [data-comment-body] [data-unread]`)
const replyIsNew = (id: string) => !!document.querySelector(`[data-reply-id="${id}"] [data-unread]`)
/** A thread's replies row, by how it is named: "2 replies, 1 new, open the thread". */
const row = (name: RegExp) => screen.getByRole('button', { name })

describe('what is new is marked on itself, with no divider', () => {
  it('marks nothing when nothing is unread', () => {
    render(<ThreadList threads={[thread('t1')]} onStart={noop} onReply={noop} />)
    expect(commentIsNew('t1')).toBe(false)
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  it('marks a new comment with its dot, and draws no divider', () => {
    render(<ThreadList threads={[thread('t1')]} unread={{ t1: ['t1'] }} onStart={noop} onReply={noop} />)
    expect(commentIsNew('t1')).toBe(true)
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  // A thread holding an unread reply opens by itself: the new reply is marked, the one before it is not.
  it('marks the new reply, not the one before it, in the thread that opened by itself', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, 1 new, close the thread$/)).toHaveAttribute('aria-expanded', 'true')
    expect(replyIsNew('r2')).toBe(true)
    expect(replyIsNew('r1')).toBe(false)
    expect(commentIsNew('t1')).toBe(false)
  })

  it('marks only the threads that have something new', () => {
    render(<ThreadList threads={[thread('t1'), thread('t2')]} unread={{ t2: ['t2'] }} onStart={noop} onReply={noop} />)
    expect(commentIsNew('t2')).toBe(true)
    expect(commentIsNew('t1')).toBe(false)
  })
})

// Katerina, 2026-10-05: "keeps counting my replies". Production showed "3 replies, 2 new" become "4 replies, 3 new" when the reader replied.
describe('"N new" counts what is new to you (SHI-38)', () => {
  it('does not count your own reply below a new one', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2', 'mine'])]} unread={{ t1: ['r1', 'r2'] }} onStart={noop} onReply={noop} />)
    expect(row(/^3 replies, 2 new,/)).toBeInTheDocument()
  })

  it('counts the new replies under a root that is new too', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['t1', 'r2'] }} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, 1 new,/)).toHaveAttribute('aria-expanded', 'true')
    expect(commentIsNew('t1')).toBe(true)
  })
})

// 99557309: the page's own dwell marks what it draws, and a thread does not close on the reader as it is read.
describe('a thread opened by itself stays open as it is read, and "N new" goes (99557309)', () => {
  it('keeps the thread open once its replies are read, and drops "N new" and the dot', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['r2'] }} stillUnread={{}} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, close the thread$/)).toHaveAttribute('aria-expanded', 'true')
    expect(replyIsNew('r2')).toBe(false)
  })

  it('opens nothing while read state loads, then the thread with a new reply once it knows', () => {
    const threads = [thread('t1', ['r1', 'r2'])]
    const { rerender } = render(<ThreadList threads={threads} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, open the thread$/)).toHaveAttribute('aria-expanded', 'false')

    rerender(<ThreadList threads={threads} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, 1 new, close the thread$/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('leaves a thread closed when a reply arrives after the verdict', () => {
    const threads = [thread('t1', ['r1', 'r2'])]
    const { rerender } = render(<ThreadList threads={threads} unread={{}} onStart={noop} onReply={noop} />)
    rerender(<ThreadList threads={threads} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(row(/^2 replies, 1 new, open the thread$/)).toHaveAttribute('aria-expanded', 'false')
  })

  // The kit's one column: at most one thread opens by itself, the newest with something new.
  it('opens one thread by itself, the newest holding a new reply', () => {
    render(<ThreadList threads={[thread('t2', ['r2']), thread('t1', ['r1'])]} unread={{ t1: ['r1'], t2: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(screen.getAllByRole('button', { name: /close the thread$/ })).toHaveLength(1)
    expect(document.querySelector('[data-reply-id="r2"]')).not.toBeNull()
    expect(document.querySelector('[data-reply-id="r1"]')).toBeNull()
  })
})

// Under SPEC §11.3's thread rule drawing a thread's replies is what reads them, so the page marks only what this reports.
describe('which threads have their replies drawn (CON-34)', () => {
  it('reports a thread open by itself and one opened by a press, one at a time, and not a closed one', () => {
    const shown = vi.fn()
    render(
      <ThreadList threads={[thread('t1', ['r1']), thread('t2', ['r2'])]} unread={{ t1: ['r1'] }} onThreadShown={shown} onStart={noop} onReply={noop} />,
    )
    expect(shown.mock.calls).toEqual([['t1', true]])

    // Opening the second closes the first: one thread open at a time.
    fireEvent.click(row(/^1 reply, open the thread$/))
    expect(shown.mock.calls.slice(1)).toEqual([['t1', false], ['t2', true]])
    fireEvent.click(row(/^1 reply, close the thread$/))
    expect(shown).toHaveBeenLastCalledWith('t2', false)
  })
})
