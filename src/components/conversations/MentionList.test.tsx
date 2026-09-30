// Moved from src/components/Activity.test.tsx
/**
 * "Mentioned in" draws relation, not just recency — CON-9.
 *
 * `scripts/references.test.ts` asserts that the *split* is right. This asserts
 * that the split reaches the screen, which is a different claim: a correct
 * predicate wired to nothing is exactly how Peek shipped a read path that never
 * ran, and it is why `ThreadList.unread.test.tsx` exists too.
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

import { MentionList } from './ThreadList'
import type { ActivityItem } from '@/components/Activity'

const thread = (id: string) => ({
  id,
  root: { id: `${id}-root`, author: { name: 'Mara' }, at: 1000, body: `root of ${id}`, by: 'mara' },
  replies: [],
})

const items: ActivityItem[] = [
  { relation: 'sub-file', where: 'REL-4 · Fold once', thread: thread('a') },
  { relation: 'mention', where: 'Design System', thread: thread('b') },
]

const show = (props: Partial<React.ComponentProps<typeof MentionList>> = {}) =>
  render(<MentionList items={items} onReply={() => {}} {...props} />).container

describe('MentionList', () => {
  it('is one list, with both relations in it', () => {
    const c = show()
    expect(c.querySelectorAll('li').length).toBe(2)
    expect(screen.getByText('root of a')).toBeTruthy()
    expect(screen.getByText('root of b')).toBeTruthy()
  })

  // Changed on purpose: the relation is no longer a visible chip; it is read out before the place's name
  // (the place line shows the place's icon and name). The words are the same.
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
  // Changed on purpose: the weight is carried by the place line above the thread — muted for a mention,
  // secondary for a sub-file — and no longer by the card (a mention's card had no fill and a subtler border).
  it('draws a mention with less weight than a sub-file’s thread', () => {
    const c = show()
    // The place line is the item's own first child, found through the item
    // rather than by position in the list.
    const placeOf = (relation: string) => c.querySelector(`[data-relation="${relation}"] > p`)
    const mention = placeOf('mention')
    const subFile = placeOf('sub-file')
    expect(mention?.className).toContain('text-text-muted')
    expect(subFile?.className).toContain('text-text-secondary')
    expect(subFile?.className).not.toContain('text-text-muted')
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

  it('draws no name at all for a Folder Ship cannot name', () => {
    // It wrote "A Folder" until the port found it — the invented name ActivityItem.where says is worse than nothing.
    show({ items: items.map((item) => ({ ...item, where: undefined })) })
    expect(screen.queryByText(/A Folder/)).toBeNull()
  })

  it('says what would appear when there is nothing yet', () => {
    show({ items: [] })
    expect(screen.getByText(/No related conversations yet/i)).toBeTruthy()
  })
})
