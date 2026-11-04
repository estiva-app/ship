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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const show = (props: Partial<React.ComponentProps<typeof MentionList>> = {}) => render(<MentionList items={items} {...props} />).container

afterEach(cleanup)

describe('MentionList', () => {
  it('is one list, with both relations in it', () => {
    const c = show()
    expect(c.querySelectorAll('[data-relation]').length).toBe(2)
    expect(screen.getByText('root of a')).toBeTruthy()
    expect(screen.getByText('root of b')).toBeTruthy()
  })

  // Changed on purpose (ONE-6, step 4d): the relation is the kit's ConversationPlace chip again, as Peek draws it.
  it('says how each thread became related', () => {
    show()
    expect(screen.getByText('Mentioned in')).toBeTruthy()
    expect(screen.getByText('On an issue')).toBeTruthy()
  })

  it('names the file each thread belongs to, beside its chip', () => {
    show()
    expect(screen.getByText('Design System')).toBeTruthy()
    expect(screen.getByText('REL-4 · Fold once')).toBeTruthy()
  })

  /*
    Changed on purpose (ONE-6, step 4d; Katerina, 2 November: the Overview, Peek's way). The weight rule is kept by
    words, not by colour: each row says how it is related on its own chip, and the card is read-only, so a stranger's
    name-drop is never taken for this file's own conversation. Peek draws both relations so (PEE-48).
  */
  it('says the relation on a chip, in words, for each row', () => {
    const c = show()
    expect(c.querySelector('[data-relation="mention"]')?.textContent).toContain('Mentioned in')
    expect(c.querySelector('[data-relation="sub-file"]')?.textContent).toContain('On an issue')
  })

  /*
    Changed on purpose (ONE-6, step 4d): Peek's way (PEE-48). A mention is another file's conversation, shown as it is:
    nothing on it acts on the message. Before, Ship offered Reply, React, Edit and Delete here.
  */
  it('is read-only: no reply box, no reaction to add, no message menu', () => {
    show()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /reply/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reaction/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull()
  })

  it('opens the page it was said on, when Ship has one', async () => {
    const user = userEvent.setup()
    history.replaceState(null, '', '/issue/here')
    show({ items: [{ ...items[1], href: '/project/design-system-1' }] })
    await user.click(screen.getByText('root of b'))
    expect(location.pathname).toBe('/project/design-system-1')
  })

  /*
    §6.4's privacy rule has a cost that must be stated rather than discovered:
    two readers see different numbers and neither is told, because a mentioning
    conversation in an unreadable Folder is absent rather than redacted. So the
    surface must not present its length as authoritative.
  */
  it('says the list is what this reader can see, not what exists', () => {
    show()
    expect(screen.getByText(/teams you cannot read are absent/i)).toBeTruthy()
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
