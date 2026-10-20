/**
 * A message pointing at one block of a description draws that block — SPEC
 * §13.6.1, COM-2 — in the five states Peek draws, with Peek's words, and only
 * while its body still names the object.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { PartView } from '@/api/part'

const views = vi.hoisted(() => new Map<string, PartView>())
vi.mock(import('@/api/part'), async (importOriginal) => ({
  ...(await importOriginal()),
  usePart: ({ address }: { address: string }) => views.get(address) ?? { state: 'loading' },
}))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({ ...(await importOriginal()), resolveForeign: vi.fn(async () => null) }))

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
const ADDRESS = `30851:${'f'.repeat(64)}:${D}`
const LINK = `https://ship.estiva.app/issue/plan-the-launch-${D}#block-p1`

const object = {
  ref: ADDRESS,
  appName: 'Ship',
  noun: 'issue',
  slots: { title: { value: 'Plan the launch' } },
} as never

const thread = (body: string): ThreadData => ({
  id: 't1',
  root: { id: 't1', author: { name: 'Bob' }, at: 1000, body, by: 'bob', parts: [{ address: ADDRESS, block: 'p1' }] },
  replies: [],
})
const show = (body: string, view: PartView) => {
  views.set(ADDRESS, view)
  return render(<ThreadList threads={[thread(body)]} onStart={async () => true} onReply={async () => true} />).container
}

describe('a pasted block link', () => {
  it('draws the block under the message, with the type and title, and the way to open it', () => {
    const c = show(`Have a look ${LINK}`, {
      state: 'resolved',
      object,
      link: LINK,
      block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'Ship on Friday' }] } as never,
    })
    const card = c.querySelector('[data-part="resolved"]')
    expect(card?.textContent).toContain('Issue · Plan the launch')
    expect(card?.textContent).toContain('Ship on Friday')
    expect(card?.textContent).toContain('Open in Ship')
  })

  it('says only "Open" for a block of Ship itself (Miky, 2026-10-09)', () => {
    const here = `${window.location.origin}/issue/plan-the-launch-${D}#block-p1`
    const c = show(`Have a look ${LINK}`, { state: 'resolved', object, link: here, block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'x' }] } as never })
    const button = [...c.querySelectorAll('[data-part="resolved"] button')].map((b) => b.textContent)
    expect(button).toContain('Open')
    expect(button).not.toContain('Open in Ship')
  })

  it('says a deleted block was deleted, under its title', () => {
    const c = show(LINK, { state: 'detached', object })
    expect(c.querySelector('[data-part="detached"]')?.textContent).toContain('This part was deleted')
  })

  it('says a body with no parts cannot be shown', () => {
    const c = show(LINK, { state: 'unaddressable', object })
    expect(c.querySelector('[data-part="unaddressable"]')?.textContent).toContain("This part can't be shown")
  })

  // Deleted, or not this reader's to see, read the same, as in Peek (Miky, 15 Oct): the relay answers both alike.
  it('says only "not available." for a deleted object and for one the reader may not see, alike', () => {
    const deleted = show(LINK, { state: 'deleted' }).querySelector('[data-part="deleted"]')?.textContent
    const unreadable = show(LINK, { state: 'unreadable' }).querySelector('[data-part="unreadable"]')?.textContent
    expect(deleted).toMatch(/not available\.$/)
    expect(unreadable).toBe(deleted)
  })

  it("draws a comment's anchored block with the same card, above the text (Decided 2026-10-07)", () => {
    views.set(ADDRESS, { state: 'detached', object })
    const t: ThreadData = { id: 't2', root: { id: 't2', author: { name: 'Ann' }, at: 1000, body: 'About this paragraph', by: 'ann', anchorPart: { address: ADDRESS, block: 'p1' } }, replies: [] }
    const c = render(<ThreadList threads={[t]} onStart={async () => true} onReply={async () => true} />).container
    const card = c.querySelector('[data-part="detached"]')
    expect(card?.textContent).toContain('This part was deleted')
    expect(c.querySelector('[data-anchor]')).toBeNull()
    // Above the text, as the subject of the remark.
    expect(card!.compareDocumentPosition(c.querySelector('[data-message] .break-words')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws nothing once an edit took the link out', () => {
    const c = show('never mind', { state: 'unreadable' })
    expect(c.querySelector('[data-part]')).toBeNull()
  })
})
