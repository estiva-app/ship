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
// The link reader has answered that the pasted link names the issue (`api/linkCards`, with its own test).
vi.mock(import('@/api/linkCards'), async (importOriginal) => ({
  ...(await importOriginal()),
  knownLinkValue: (url: string) => (url.includes('b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5') ? `30851:${'f'.repeat(64)}:b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5` : undefined),
}))

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
const ADDRESS = `30851:${'f'.repeat(64)}:${D}`
const LINK = `https://ship.estiva.app/issue/plan-the-launch-${D}#block-p1`

const object = {
  ref: ADDRESS,
  appName: 'Ship',
  noun: 'issue',
  kind: 30851,
  address: ADDRESS,
  slots: { title: { value: 'Plan the launch' } },
  meta: [{ label: 'Ref', value: 'SHI-12', field: 'ref' }],
  actions: [],
  comments: [],
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
  it('draws the block under the message, with its file’s title and key, and the way to open it', () => {
    const c = show(`Have a look ${LINK}`, {
      state: 'resolved',
      object,
      link: LINK,
      block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'Ship on Friday' }] } as never,
    })
    const card = c.querySelector('[data-part="resolved"]')
    expect(card?.textContent).toContain('Plan the launch')
    // The tile says what it is: the title is not "Issue · …", and the key says which one (Katerina, 30 Oct).
    expect(card?.textContent).not.toContain('Issue ·')
    expect(card?.textContent).toContain('A part of SHI-12')
    expect(card?.textContent).toContain('Ship on Friday')
    // Its title is the way to it; no "Open in" button beside it (Katerina, 31 Oct).
    expect(card?.querySelector('a')?.textContent).toBe('Plan the launch')
    expect(card?.querySelector('a')?.getAttribute('href')).toBe(LINK)
    expect(card?.textContent).not.toContain('Open')
  })

  it('opens a block of Ship itself in place, from its title', () => {
    const here = `${window.location.origin}/issue/plan-the-launch-${D}#block-p1`
    const c = show(`Have a look ${LINK}`, { state: 'resolved', object, link: here, block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'x' }] } as never })
    expect(c.querySelector('[data-part="resolved"] a')?.getAttribute('href')).toBe(`/issue/plan-the-launch-${D}#block-p1`)
    expect(c.querySelector('[data-part="resolved"] button')).toBeNull()
  })

  it('says a deleted block was deleted, in the SPEC’s words, and leads nowhere', () => {
    const c = show(LINK, { state: 'detached', object })
    expect(c.querySelector('[data-part="detached"]')?.textContent).toContain('This part was deleted')
    expect(c.querySelector('[data-part="detached"] a')).toBeNull()
  })

  it('says a body with no parts cannot be shown, its words opening the whole file', () => {
    const c = show(LINK, { state: 'unaddressable', object })
    const card = c.querySelector('[data-part="unaddressable"]')
    expect(card?.textContent).toContain("This part can't be shown")
    expect(card?.querySelector('a')?.getAttribute('href')).toBe('/issue/plan-the-launch-b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5')
  })

  // Changed on purpose (SPEC §13.6.1 "deleted is not not-permitted"; Katerina, 30 Oct, widget review 56): a trusted
  // deletion naming the file says "deleted"; one the reader may not see says "not available". Neither shows a title.
  it('says "deleted" for a file a trusted deletion names, and "not available" for one the reader may not see', () => {
    const deleted = show(LINK, { state: 'deleted' }).querySelector('[data-part="deleted"]')?.textContent
    const unreadable = show(LINK, { state: 'unreadable' }).querySelector('[data-part="unreadable"]')?.textContent
    expect(deleted).toBe('A part of this issue deleted')
    expect(unreadable).toBe('A part of this issue not available')
    expect(deleted).not.toContain('Plan the launch')
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

  it('draws the block of a link the link reader has not answered, from the link naming its file, as Peek does', () => {
    // The reader answers nothing for this issue (a link past a message's first eight is never asked about), yet the
    // words still link the part's file, so its block draws.
    const LATE = 'c0ffee00-d4a2-4833-8f2a-6aa1e2f3c4d5'
    const late = `30851:${'f'.repeat(64)}:${LATE}`
    views.set(late, { state: 'unreadable' })
    const body = `https://ship.estiva.app/issue/later-${LATE}#block-p2`
    const c = render(<ThreadList threads={[{ ...thread(body), root: { ...thread(body).root, parts: [{ address: late, block: 'p2' }] } }]} onStart={async () => true} onReply={async () => true} />).container
    expect(c.querySelector('[data-part]')).not.toBeNull()
  })

  it('draws at most six blocks under one message, however many its links name', () => {
    const ds = Array.from({ length: 7 }, (_, n) => `c0ffee0${n}-d4a2-4833-8f2a-6aa1e2f3c4d5`)
    for (const d of ds) views.set(`30851:${'f'.repeat(64)}:${d}`, { state: 'unreadable' })
    const body = ds.map((d) => `https://ship.estiva.app/issue/x-${d}#block-p1`).join(' ')
    const parts = ds.map((d) => ({ address: `30851:${'f'.repeat(64)}:${d}`, block: 'p1' }))
    const c = render(<ThreadList threads={[{ ...thread(body), root: { ...thread(body).root, parts } }]} onStart={async () => true} onReply={async () => true} />).container
    expect(c.querySelectorAll('[data-part]')).toHaveLength(6)
  })

  it('draws nothing once an edit took the link out', () => {
    const c = show('never mind', { state: 'unreadable' })
    expect(c.querySelector('[data-part]')).toBeNull()
  })
})
