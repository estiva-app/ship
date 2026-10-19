/**
 * A link to one block of a file reads as that file in Ship's comments, as in
 * Peek (WBM-11; Miky, 19 Oct: "yes, that's the whole point"): in a sentence the
 * file's chip where the URL was, opening the block; alone on its line nothing,
 * while its `part` draws the block under the message (C26); with no part for
 * it, the file's row. A link nothing answered stays the URL as written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { addrToNaddr } from '@estiva-app/protocol'
import type { PartView } from '@/api/part'

const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
const ADDRESS = `30851:${'f'.repeat(64)}:${D}`
const LINK = `https://ship.estiva.app/issue/plan-the-launch-${D}#block-p1`
const UNREAD = `https://ship.estiva.app/issue/secret-${'0'.repeat(8)}-0000-4000-8000-000000000000#block-p2`
const REFERENCE = `nostr:${addrToNaddr(ADDRESS, [])}`

const answers = vi.hoisted(() => new Map<string, string>())
vi.mock(import('@/api/linkCards'), async (importOriginal) => ({ ...(await importOriginal()), knownLinkValue: (url: string) => answers.get(url) }))
vi.mock(import('@/api/part'), async (importOriginal) => ({
  ...(await importOriginal()),
  usePart: (): PartView => ({ state: 'resolved', object, link: LINK, block: { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'Ship on Friday' }] } as never }),
}))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({ ...(await importOriginal()), resolveForeign: vi.fn(async () => null) }))

import { MessageText } from './MessageText'

const object = { ref: ADDRESS, address: ADDRESS, kind: 30851, appName: 'Ship', noun: 'issue', openUrl: `https://ship.estiva.app/o/${ADDRESS}`, slots: { title: { value: 'Plan the launch' } }, meta: [], actions: [] } as never
const PART = [{ address: ADDRESS, block: 'p1' }]
const show = (body: string, parts?: typeof PART) => render(<MessageText body={body} parts={parts} resolved={{ [REFERENCE]: object }} />).container
const part = (c: HTMLElement) => c.querySelector('[data-part]')
const rows = (c: HTMLElement) => [...c.querySelectorAll('[data-link-row]')].map((row) => row.textContent)

beforeEach(() => {
  answers.clear()
  answers.set(LINK, ADDRESS)
})

describe('a link to one block reads as its file', () => {
  it('in a sentence is the file’s chip where the URL was, the block live under the message', () => {
    const c = show(`see ${LINK} here`, PART)
    expect(c.querySelector('[data-message-text]')?.textContent).toBe('see Plan the launch here')
    expect(part(c)?.textContent).toContain('Ship on Friday')
  })

  it('opens the block, not the top of its file, from its chip', () => {
    const c = show(`see ${LINK} here`, PART)
    // The chip, not the URL left as a link: the anchor reads as the file.
    const chip = [...c.querySelectorAll('[data-message-text] a')].find((a) => a.textContent?.includes('Plan the launch'))
    expect(chip?.getAttribute('href')).toBe(LINK)
  })

  it('alone on its line draws nothing in its place: the block under the message stands for it', () => {
    const c = show(LINK, PART)
    expect(rows(c)).toEqual([])
    expect(c.textContent).not.toContain(LINK)
    expect(c.querySelector('[data-message-text]')?.textContent ?? '').toBe('')
    expect(part(c)?.textContent).toContain('Ship on Friday')
  })

  it('alone on its line with no part for it (an older message) is the file’s row, opening the block', () => {
    const c = show(LINK)
    expect(rows(c)).toEqual(['Plan the launch'])
    expect(c.querySelector('[data-link-row] a')?.getAttribute('href')).toBe(LINK)
  })

  it('stays the URL as written when nothing answered for it (a file the reader cannot read, or gone)', () => {
    const c = show(`see ${UNREAD} here`)
    expect(c.textContent).toContain(UNREAD)
    expect(c.textContent).not.toContain('Plan the launch')
  })
})
