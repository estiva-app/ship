/**
 * A comment written on a few words in Leaf (LEAF-7) shows those words in Ship, as Leaf shows them, not the whole
 * paragraph they are in; changed or deleted since, it says so; and the words open the file at that spot (ONE-12;
 * Miky, 10 November).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { blockRunTag, quoteTag, serializeBlockDocument, type SignedEvent } from '@estiva-app/protocol'
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
const HERE = `${window.location.origin}/issue/plan-the-launch-${D}#block-p1`

const description = (text: string, ids: string[] = ['p1']) =>
  serializeBlockDocument({ type: 'doc', content: ids.map((id) => ({ type: 'paragraph', id, content: [{ type: 'text', text }] })) } as never)

const objectWith = (text: string, ids?: string[]) =>
  ({
    ref: ADDRESS,
    appName: 'Ship',
    noun: 'issue',
    kind: 30851,
    address: ADDRESS,
    slots: { title: { value: 'Plan the launch' }, body: { value: description(text, ids), format: 'blocks' } },
    meta: [],
    actions: [],
    comments: [],
  }) as never

// The comment as Leaf writes it: on the issue, its block, and the words selected.
const event = {
  id: 'q1',
  kind: 1111,
  pubkey: 'a'.repeat(64),
  created_at: 1,
  content: 'On these words',
  sig: '',
  tags: [['A', ADDRESS], blockRunTag(['p1']), quoteTag({ start: 'brass fitting' })],
} as SignedEvent

const thread: ThreadData = {
  id: 'q1',
  root: { id: 'q1', author: { name: 'Ann' }, at: 1000, body: 'On these words', by: 'ann', event, anchorPart: { address: ADDRESS, block: 'p1' }, quote: { start: 'brass fitting' } },
  replies: [],
}

const show = (view: PartView) => {
  views.set(ADDRESS, view)
  return render(<ThreadList threads={[thread]} onStart={async () => true} onReply={async () => true} />).container
}

const PARAGRAPH = 'The quarterly lantern inventory lists every brass fitting in the east warehouse.'

describe('a comment on a few words of an issue', () => {
  it('shows the words it quoted, highlighted, not the paragraph around them', () => {
    const c = show({ state: 'resolved', object: objectWith(PARAGRAPH), link: HERE, block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: PARAGRAPH }] } as never })
    const quoted = c.querySelector('[data-quoted]')
    expect(quoted?.getAttribute('data-quoted')).toBe('here')
    expect(quoted?.textContent).toBe('brass fitting')
    expect(c.textContent).not.toContain('quarterly lantern')
    expect(c.querySelector('[data-part="resolved"]')).toBeNull()
  })

  it('opens the issue at those words, in place for an issue of Ship', () => {
    const c = show({ state: 'resolved', object: objectWith(PARAGRAPH), link: HERE, block: { type: 'paragraph', id: 'p1', content: [] } as never })
    const link = c.querySelector('[data-quoted] a')
    expect(link?.textContent).toBe('brass fitting')
    expect(link?.getAttribute('href')).toBe(`/issue/plan-the-launch-${D}#block-p1`)
    expect(link?.getAttribute('target')).toBeNull()
  })

  it('says the words changed since, once the paragraph no longer holds them', () => {
    const c = show({ state: 'resolved', object: objectWith('The quarterly lantern inventory lists every copper pipe.'), link: HERE, block: { type: 'paragraph', id: 'p1', content: [] } as never })
    expect(c.querySelector('[data-quoted]')?.getAttribute('data-quoted')).toBe('reworded')
    expect(c.textContent).toContain('brass fitting')
    expect(c.textContent).toContain('Changed since')
  })

  it('says the words were deleted from the page, once their paragraph is gone', () => {
    const c = show({ state: 'detached', object: objectWith('Another paragraph entirely.', ['p2']), link: HERE })
    expect(c.querySelector('[data-quoted]')?.getAttribute('data-quoted')).toBe('gone')
    expect(c.textContent).toContain('Deleted from the page')
    // Their spot is gone from the file: no link to it.
    expect(c.querySelector('[data-quoted] a')).toBeNull()
  })

  it('shows the words with no claim about them until the issue is read', () => {
    const c = show({ state: 'loading' })
    expect(c.querySelector('[data-quoted]')?.getAttribute('data-quoted')).toBe('part')
    expect(c.textContent).toContain('brass fitting')
    expect(c.textContent).not.toContain('Changed since')
  })
})
