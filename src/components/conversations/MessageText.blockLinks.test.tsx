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
// Another app's page, so its chip opens in that app (Ship's own issue opens as a route, on Ship's origin).
const ADDRESS = `30842:${'f'.repeat(64)}:${D}`
const LINK = `https://leaf.estiva.app/page/plan-the-launch-${D}#block-p1`
// A host that is not where the page opens: a manifest anybody could publish claiming it (security review).
const ROGUE = `https://evil.example/page/plan-the-launch-${D}#block-p1`
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
import { declaredManifests } from '@/api/handoff'
import { relay } from '@/api/store'

const object = { ref: ADDRESS, address: ADDRESS, kind: 30842, appName: 'Leaf', noun: 'page', openUrl: `https://leaf.estiva.app/o/${ADDRESS}`, slots: { title: { value: 'Plan the launch' } }, meta: [], actions: [] } as never
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

  it('opens where its file opens, never the written URL, when that URL is on another site than the file', () => {
    answers.set(ROGUE, ADDRESS)
    const c = show(`see ${ROGUE} here`)
    const chip = [...c.querySelectorAll('[data-message-text] a')].find((a) => a.textContent?.includes('Plan the launch'))
    expect(chip?.getAttribute('href')).toBe(`https://leaf.estiva.app/o/${ADDRESS}`)
  })

  it('stays the URL as written when nothing answered for it (a file the reader cannot read, or gone)', () => {
    const c = show(`see ${UNREAD} here`)
    expect(c.textContent).toContain(UNREAD)
    expect(c.textContent).not.toContain('Plan the launch')
  })
})

/*
  LTX-6: a file's path is the same on every app's host, and a click opens the
  address as written, in the app it names — Leaf's address for a Ship issue
  opens Leaf, not the issue's page here (why:
  https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-files-path-is-the-same-on-every-apps-host.md).
*/
describe('an address on another Estiva app’s host opens as written', () => {
  const ISSUE_D = 'c2a4a8f0-1b2c-4d3e-8f90-a1b2c3d4e5f6'
  const ISSUE = `30851:${'e'.repeat(64)}:${ISSUE_D}`
  const LEAF_ISSUE = `https://leaf.estiva.app/issue/plan-the-launch-${ISSUE_D}`
  const issue = { ref: ISSUE, address: ISSUE, kind: 30851, appName: 'Ship', noun: 'issue', openUrl: `https://ship.estiva.app/o/${ISSUE}`, slots: { title: { value: 'Plan the launch' } }, meta: [], actions: [] } as never
  const showIssue = (body: string) => render(<MessageText body={body} resolved={{ [`nostr:${addrToNaddr(ISSUE, [])}`]: issue }} />).container
  // The hosts come from the manifests, as the app reads them: Ship's and Leaf's, each declaring the path on its own.
  const manifest = (app: string, host: string) => ({ kind: 31990, pubkey: 'c'.repeat(64), id: app, created_at: 1, content: '{}', sig: '', tags: [['d', `estiva-${app}`], ['web', `https://${host}/o/<bech32>`, 'naddr'], ['urls', `https://${host}/issue/<slug>-<d>`, '30851']] })

  beforeEach(async () => {
    vi.spyOn(relay, 'query').mockResolvedValue([manifest('ship', 'ship.estiva.app'), manifest('leaf', 'leaf.estiva.app')] as never)
    await declaredManifests()
    answers.set(LEAF_ISSUE, ISSUE)
  })

  it('in a sentence, its chip opens Leaf at the address, not the issue’s page in Ship', () => {
    const c = showIssue(`see ${LEAF_ISSUE} here`)
    const chip = [...c.querySelectorAll('[data-message-text] a')].find((a) => a.textContent?.includes('Plan the launch'))
    expect(chip?.getAttribute('href')).toBe(LEAF_ISSUE)
  })

  it('on a host no app declares, opens the issue’s page here, never that site (security review)', () => {
    const rogue = `https://evil.example/issue/plan-the-launch-${ISSUE_D}`
    answers.set(rogue, ISSUE)
    const c = showIssue(`see ${rogue} here`)
    const chip = [...c.querySelectorAll('[data-message-text] a')].find((a) => a.textContent?.includes('Plan the launch'))
    expect(chip?.getAttribute('href')).not.toContain('evil.example')
    expect(chip?.getAttribute('href')).toMatch(/^\/issue\//)
  })

  // The card its author asked for opens where the chip would: the address as written.
  const card = (body: string, layout: 'detailed' | 'compact') => {
    const c = render(<MessageText body={body} embeds={[{ value: ISSUE, layout }]} resolved={{ [`nostr:${addrToNaddr(ISSUE, [])}`]: issue }} />).container
    return [...c.querySelectorAll('[data-cards] a')].map((a) => a.getAttribute('href'))
  }

  it('alone on its line with its card, the card opens Leaf at the address, not the issue’s page in Ship', () => {
    const hrefs = card(LEAF_ISSUE, 'detailed')
    expect(hrefs).toContain(LEAF_ISSUE)
    expect(hrefs.some((href) => href?.startsWith('/issue/'))).toBe(false)
  })

  it('an old message’s compact card opens Leaf at the address too', () => {
    expect(card(LEAF_ISSUE, 'compact')).toEqual([LEAF_ISSUE])
  })

  it('a card for an address on a host no app declares opens the issue’s page here, never that site (security review)', () => {
    const rogue = `https://evil.example/issue/plan-the-launch-${ISSUE_D}`
    answers.set(rogue, ISSUE)
    const hrefs = card(rogue, 'detailed')
    expect(hrefs.some((href) => href?.startsWith('/issue/'))).toBe(true)
    expect(hrefs.some((href) => href?.includes('evil.example'))).toBe(false)
  })
})
