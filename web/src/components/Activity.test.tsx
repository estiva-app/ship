/**
 * Activity draws relation, not just recency — CON-9.
 *
 * `scripts/references.test.ts` asserts that the *split* is right. This asserts
 * that the split reaches the screen, which is a different claim: a correct
 * predicate wired to nothing is exactly how Peek shipped a read path that never
 * ran, and it is why `ConversationThread.unread.test.tsx` exists too.
 *
 * The property under test is the one the model turns on. A mention and a
 * sub-file's thread sit in the same list — that is right — and must not sit
 * there at the same weight, because a mention is anyone typing your address and
 * cannot be withdrawn.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { Activity, type ActivityItem } from './Activity'

const thread = (id: string) => ({
  id,
  root: { id: `${id}-root`, author: { name: 'Mara' }, at: 1000, body: `root of ${id}`, by: 'mara' },
  replies: [],
})

const items: ActivityItem[] = [
  { relation: 'sub-file', where: 'REL-4 · Fold once', thread: thread('a') },
  { relation: 'mention', where: 'Design System', thread: thread('b') },
]

const show = (props: Partial<React.ComponentProps<typeof Activity>> = {}) =>
  render(<Activity items={items} onReply={() => {}} {...props} />).container

describe('Activity', () => {
  it('is one list, with both relations in it', () => {
    const c = show()
    expect(c.querySelectorAll('li').length).toBe(2)
    expect(screen.getByText('root of a')).toBeTruthy()
    expect(screen.getByText('root of b')).toBeTruthy()
  })

  it('says how each thread became related', () => {
    show()
    expect(screen.getByText('Mentioned in')).toBeTruthy()
    expect(screen.getByText('On an issue')).toBeTruthy()
  })

  it('names the file each thread belongs to, because replying goes there', () => {
    show()
    expect(screen.getByText('Design System')).toBeTruthy()
    expect(screen.getByText('REL-4 · Fold once')).toBeTruthy()
  })

  /*
    The weight rule. Same list, not same weight: a stranger's name-drop must not
    be indistinguishable from your project's own work.
  */
  it('draws a mention with less weight than a sub-file’s thread', () => {
    const c = show()
    // The card is the message's own parent, found through the message rather
    // than by position — a positional selector would keep passing if the chip
    // row and the card swapped places.
    const cardOf = (relation: string) => c.querySelector(`[data-relation="${relation}"] article`)?.parentElement
    const mention = cardOf('mention')
    const subFile = cardOf('sub-file')
    expect(mention?.className).toContain('border-border-subtle')
    expect(subFile?.className).toContain('border-border-default')
    expect(mention?.className).not.toContain('border-border-default')
  })

  /*
    §6.4's privacy rule has a cost that must be stated rather than discovered:
    two readers see different numbers and neither is told, because a mentioning
    conversation in an unreadable Folder is absent rather than redacted. So the
    surface must not present its length as authoritative.
  */
  it('says the list is what this reader can see, not what exists', () => {
    show()
    expect(screen.getByText(/Folders you cannot read are absent/i)).toBeTruthy()
  })

  /*
    CON-9's third watch item: a project with 200 issues has an unbounded roll-up.
    A cap is fine; a silent cap is the failure CON-1 names — indistinguishable
    from "nothing else happened", on the surface a reader consults to find out.
  */
  it('says how many the horizon left out, rather than implying there were none', () => {
    show({ truncated: 10 })
    expect(screen.getByText(/2 most recent, of 12/)).toBeTruthy()
  })

  it('says nothing about a horizon it did not reach', () => {
    show()
    expect(screen.queryByText(/most recent, of/)).toBeNull()
  })

  it('drops the “where” line rather than inventing a name for a Folder', () => {
    show({ items: items.map((item) => ({ ...item, where: undefined })) })
    expect(screen.queryByText('Design System')).toBeNull()
    expect(screen.getByText('Mentioned in')).toBeTruthy()
  })

  it('says what would appear when there is nothing yet', () => {
    show({ items: [] })
    expect(screen.getByText(/Conversations that mention this/i)).toBeTruthy()
  })
})
