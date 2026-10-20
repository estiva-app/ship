// Moved from src/components/ConversationThread.unread.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

/**
 * The divider reaches the screen (CRO-13).
 *
 * Asserted at the component rather than only in `unreadFeed.ts`, because the
 * rule being right and the rule being *rendered* are different claims — a
 * correct predicate wired to nothing is exactly how Peek shipped a read path
 * that never ran.
 */
const LABEL = /new since you last read this/i

const thread = (id: string, replyIds: string[] = []): ThreadData => ({
  id,
  root: { id, author: { name: 'Bob' }, at: 1000, body: `root ${id}`, by: 'bob' },
  replies: replyIds.map((r) => ({ id: r, author: { name: 'Bob' }, at: 2000, body: `reply ${r}`, by: 'bob' })),
})

const noop = async (): Promise<true> => true

describe('the new-since-you-looked divider', () => {
  it('is absent when nothing is unread', () => {
    render(<ThreadList threads={[thread('t1')]} onStart={noop} onReply={noop} />)
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  it('appears above the root when the whole thread is new', () => {
    render(<ThreadList threads={[thread('t1')]} unread={{ t1: ['t1'] }} onStart={noop} onReply={noop} />)
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  // Changed on purpose: replies are folded, and a thread holding an unread reply opens by itself — which is what
  // puts the divider on screen here without a click. The replies button says how many are new.
  it('appears above the first unread reply, not the root', () => {
    render(
      <ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />,
    )
    expect(screen.getByRole('button', { name: '2 replies, 1 new' })).toHaveAttribute('aria-expanded', 'true')
    const nodes = screen.getAllByText(LABEL)
    expect(nodes).toHaveLength(1)
    // Ordering is the whole point of a divider: everything below it is new.
    const rendered = document.body.textContent ?? ''
    expect(rendered.indexOf('reply r1')).toBeLessThan(rendered.indexOf('New since'))
    expect(rendered.indexOf('New since')).toBeLessThan(rendered.indexOf('reply r2'))
  })

  it('marks only the threads that have something new', () => {
    render(
      <ThreadList
        threads={[thread('t1'), thread('t2')]}
        unread={{ t2: ['t2'] }}
        onStart={noop}
        onReply={noop}
      />,
    )
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })
})

// Katerina, 2026-10-05: "keeps counting my replies". Production showed "3 replies, 2 new" become "4 replies, 3 new" when the reader replied.
describe('"N new" counts what is new to you (SHI-38)', () => {
  it('does not count your own reply below a new one', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2', 'mine'])]} unread={{ t1: ['r1', 'r2'] }} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '3 replies, 2 new' })).toBeInTheDocument()
  })

  it('counts the new replies under a root that is new too', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['t1', 'r2'] }} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '2 replies, 1 new' })).toHaveAttribute('aria-expanded', 'true')
    // One divider, above the root: everything from there down is where the new starts.
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })
})

// 99557309: the divider went a second after it was drawn, because the page's own dwell marked what it drew.
describe('the divider stays for the visit, "N new" does not (99557309)', () => {
  it('keeps the divider once the replies are read, and drops "N new"', () => {
    render(<ThreadList threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: ['r2'] }} stillUnread={{}} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '2 replies' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  it('draws nothing while read state loads, then opens a thread with a new reply once it knows', () => {
    const threads = [thread('t1', ['r1', 'r2'])]
    const { rerender } = render(<ThreadList threads={threads} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '2 replies' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(LABEL)).toBeNull()

    rerender(<ThreadList threads={threads} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '2 replies, 1 new' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  it('leaves a thread closed when a reply arrives after the verdict', () => {
    const threads = [thread('t1', ['r1', 'r2'])]
    const { rerender } = render(<ThreadList threads={threads} unread={{}} onStart={noop} onReply={noop} />)
    rerender(<ThreadList threads={threads} unread={{ t1: ['r2'] }} onStart={noop} onReply={noop} />)
    expect(screen.getByRole('button', { name: '2 replies, 1 new' })).toHaveAttribute('aria-expanded', 'false')
  })
})

// Under SPEC §11.3's thread rule drawing a thread's replies is what reads them, so the page marks only what this reports.
describe('which threads have their replies drawn (CON-34)', () => {
  it('reports a thread open by itself and one opened by a click, and not a folded one', () => {
    const shown = vi.fn()
    render(
      <ThreadList threads={[thread('t1', ['r1']), thread('t2', ['r2'])]} unread={{ t1: ['r1'] }} onThreadShown={shown} onStart={noop} onReply={noop} />,
    )
    expect(shown.mock.calls).toEqual([['t1', true]])

    fireEvent.click(screen.getByRole('button', { name: '1 reply' }))
    expect(shown).toHaveBeenLastCalledWith('t2', true)
    fireEvent.click(screen.getByRole('button', { name: '1 reply' }))
    expect(shown).toHaveBeenLastCalledWith('t2', false)
  })
})
