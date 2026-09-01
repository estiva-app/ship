import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Conversations, type ThreadData } from './ConversationThread'

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

const noop = () => {}

describe('the new-since-you-looked divider', () => {
  it('is absent when nothing is unread', () => {
    render(<Conversations threads={[thread('t1')]} onStart={noop} onReply={noop} />)
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  it('appears above the root when the whole thread is new', () => {
    render(<Conversations threads={[thread('t1')]} unread={{ t1: 't1' }} onStart={noop} onReply={noop} />)
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  it('appears above the first unread reply, not the root', () => {
    render(
      <Conversations threads={[thread('t1', ['r1', 'r2'])]} unread={{ t1: 'r2' }} onStart={noop} onReply={noop} />,
    )
    const nodes = screen.getAllByText(LABEL)
    expect(nodes).toHaveLength(1)
    // Ordering is the whole point of a divider: everything below it is new.
    const rendered = document.body.textContent ?? ''
    expect(rendered.indexOf('reply r1')).toBeLessThan(rendered.indexOf('New since'))
    expect(rendered.indexOf('New since')).toBeLessThan(rendered.indexOf('reply r2'))
  })

  it('marks only the threads that have something new', () => {
    render(
      <Conversations
        threads={[thread('t1'), thread('t2')]}
        unread={{ t2: 't2' }}
        onStart={noop}
        onReply={noop}
      />,
    )
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })
})
