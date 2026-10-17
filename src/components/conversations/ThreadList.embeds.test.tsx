/**
 * A message draws the card its author asked for — SPEC §13.6.2, OPT-16.
 *
 * The fold (`foldEmbeds`) and the rule (`cardsIn`) are the packages' and have
 * their own tests. This is the wiring: the `embed` set reaches the message
 * through `threadFor`, `compact` draws the object's row and `detailed` its
 * card, whatever the manifest's `widget` says, and `none` — or no `embed` at
 * all — draws none. A reference alone on its line, and a bare app link once
 * what it names has resolved, read as its row, and in a sentence as its chip
 * (record where-a-link-sits-and-which-file-gets-the-card).
 *
 * Fixtures are Ship's real shapes: an issue (manifest `row`) and a project
 * (manifest `card`), each asked for in the other layout, so a pass cannot be
 * the manifest drawing what it would have drawn anyway.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { addrToNaddr, type Embed } from '@estiva-app/protocol'
import type { ForeignObject as Data } from '@/api/foreign'

const PK = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const ISSUE = `30851:${PK}:f78c3b96-2a3b-4d92-910a-ac25aba672cd`
const PROJECT = `30850:${PK}:15e9b50a-825a-4537-8b4a-df46efb9c7e4`
const ISSUE_REF = `nostr:${addrToNaddr(ISSUE)}`
const PROJECT_REF = `nostr:${addrToNaddr(PROJECT)}`

const object = (ref: string, address: string, widget: string, title: string): Data =>
  ({ ref, address, eventId: 'e'.repeat(64), kind: Number(address.split(':')[0]), widget, appName: 'Ship', slots: { title: { value: title } }, meta: [], comments: [], actions: [], viaRecommendation: true }) as unknown as Data

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async (ref: string) =>
    ref === ISSUE_REF ? object(ref, ISSUE, 'row', 'The probe issue') : ref === PROJECT_REF ? object(ref, PROJECT, 'card', 'The probe project') : null,
  ),
}))

// §7.7 as `api/linkCards` answers it, with its own test: Ship's link names the issue, a second one an issue that
// resolves to nothing, and nothing else names anything.
const ISSUE_URL = `https://ship.estiva.app/issue/the-probe-issue-${ISSUE.split(':')[2]}`
const GONE_URL = 'https://ship.estiva.app/issue/gone-0d6a0a3e-7a4e-4c39-9f0b-5d1c7e2a9b11'
vi.mock('@/api/linkCards', () => {
  // Hoisted above the constants, so spelled out again.
  const pk = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
  const named = new Map([
    ['https://ship.estiva.app/issue/the-probe-issue-f78c3b96-2a3b-4d92-910a-ac25aba672cd', `30851:${pk}:f78c3b96-2a3b-4d92-910a-ac25aba672cd`],
    ['https://ship.estiva.app/issue/gone-0d6a0a3e-7a4e-4c39-9f0b-5d1c7e2a9b11', `30851:${pk}:0d6a0a3e-7a4e-4c39-9f0b-5d1c7e2a9b11`],
  ])
  return {
    knownLinkValue: (asked: string) => named.get(asked),
    // The message box's chips ask too (OPT-19).
    askLinkValues: () => Promise.resolve(),
    useLinkValues: (urls: readonly string[]) => new Map(urls.flatMap((asked) => (named.has(asked) ? [[asked, named.get(asked)!] as const] : []))),
  }
})

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const thread = (body: string, embeds?: Embed[]): ThreadData => ({
  id: 't1',
  root: { id: 't1', author: { name: 'Ann' }, at: 1000, body, by: 'ann', embeds },
  replies: [],
})
const noop = () => {}
const show = (t: ThreadData) => render(<ThreadList threads={[t]} onStart={noop} onReply={noop} />).container
/** Each card under the message, as [the reference it draws, without `nostr:`; its layout]. */
const cards = (c: HTMLElement) => [...c.querySelectorAll('[data-cards] [data-card]')].map((e) => [e.getAttribute('data-card-value'), e.getAttribute('data-card')])
const bare = (reference: string) => reference.replace(/^nostr:/, '')
const sentence = (c: HTMLElement) => c.querySelector('[data-message-text] p')?.textContent
const rows = (c: HTMLElement) => [...c.querySelectorAll('[data-message-text] [data-link-row]')].map((row) => row.textContent)

describe('a message that asks for a card', () => {
  it('draws compact as the row, under the sentence, and keeps the chip', async () => {
    const c = show(thread(`the plan is in ${ISSUE_REF} for now`, [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(sentence(c)).toBe('the plan is in The probe issue for now'))
    expect(cards(c)).toEqual([[bare(ISSUE_REF), 'compact']])
  })

  it('draws detailed as the card, whatever the manifest says, in body order', async () => {
    const c = show(thread(`${PROJECT_REF} holds ${ISSUE_REF}`, [{ value: ISSUE, layout: 'detailed' }, { value: PROJECT, layout: 'compact' }]))
    await waitFor(() => expect(c.textContent).toContain('The probe project'))
    expect(cards(c)).toEqual([[bare(PROJECT_REF), 'compact'], [bare(ISSUE_REF), 'detailed']])
  })

  it('draws nothing for none, and nothing with no embed', async () => {
    const none = show(thread(`the plan is in ${ISSUE_REF}`, [{ value: ISSUE, layout: 'none' }]))
    const plain = show(thread(`the plan is in ${ISSUE_REF} too`))
    await waitFor(() => expect(sentence(plain)).toBe('the plan is in The probe issue too'))
    await waitFor(() => expect(sentence(none)).toBe('the plan is in The probe issue'))
    expect(cards(none)).toEqual([])
    expect(cards(plain)).toEqual([])
  })

  it('draws nothing for a value the body no longer names', async () => {
    const c = show(thread('the link was edited out', [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(c.textContent).toContain('edited out'))
    expect(cards(c)).toEqual([])
  })

  // Where a link sits decides how it draws (record where-a-link-sits-and-which-file-gets-the-card, superseding OPT-18's chip).
  it('draws a reference alone on its line as its row, with no card, when no embed names it', async () => {
    const lone = show(thread(ISSUE_REF))
    await waitFor(() => expect(rows(lone)).toEqual(['The probe issue']))
    expect(cards(lone)).toEqual([])
  })

  it('draws a bare app link as the row of what it names alone, its chip mid-sentence, with no card', async () => {
    const lone = show(thread(ISSUE_URL))
    await waitFor(() => expect(rows(lone)).toEqual(['The probe issue']))
    expect(cards(lone)).toEqual([])
    expect(lone.textContent).not.toContain(ISSUE_URL)
    const mid = show(thread(`see ${ISSUE_URL}, then ship`))
    await waitFor(() => expect(sentence(mid)).toBe('see The probe issue, then ship'))
    expect(cards(mid)).toEqual([])
  })

  it('keeps a bare app link a link when what it names cannot be read, rather than an empty chip (OPT-18)', async () => {
    const c = show(thread(`see ${GONE_URL}`))
    await waitFor(() => expect(c.querySelector(`a[href="${GONE_URL}"]`)).not.toBeNull())
    // Long enough for the link's answer and the object's to have come back.
    await new Promise((r) => setTimeout(r, 50))
    expect(c.querySelector(`a[href="${GONE_URL}"]`)).not.toBeNull()
    expect(c.textContent).not.toContain('not available')
  })

  it('keeps a link nothing claims, and a link on words, as links with no card (OPT-18)', async () => {
    const c = show(thread(`https://example.com/a and [these words](${ISSUE_URL})`))
    await new Promise((r) => setTimeout(r, 50))
    expect(rows(c)).toEqual([])
    expect(cards(c)).toEqual([])
    expect(c.querySelector('a[href="https://example.com/a"]')).not.toBeNull()
    expect(sentence(c)).toBe('https://example.com/a and these words')
  })

  it('a chosen layout on a line that is only the link: none leaves its row, compact draws only the card', async () => {
    const none = show(thread(ISSUE_REF, [{ value: ISSUE, layout: 'none' }]))
    await waitFor(() => expect(rows(none)).toEqual(['The probe issue']))
    expect(cards(none)).toEqual([])

    const compact = show(thread(ISSUE_REF, [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(compact.querySelector('[data-card]')?.textContent).toContain('The probe issue'))
    expect(cards(compact)).toEqual([[bare(ISSUE_REF), 'compact']])
    // The card stands for the line: the file is drawn once.
    expect(rows(compact)).toEqual([])
    expect(compact.textContent?.match(/The probe issue/g)).toHaveLength(1)
  })
})

describe('a link on words that asks for a card (OPT-17)', () => {
  const body = `the plan is [these words](${ISSUE_URL}) for now`

  // protocol 0.39's `cardsIn`, as Peek reads it: a URL names a file only where it draws as that file's link, so words keep theirs.
  it('draws no card for a link on words: the words stay a link, as in Peek', async () => {
    const c = show(thread(body, [{ value: ISSUE, layout: 'detailed' }]))
    await waitFor(() => expect(c.querySelector(`a[href="${ISSUE_URL}"]`)?.textContent).toBe('these words'))
    await new Promise((r) => setTimeout(r, 50))
    expect(cards(c)).toEqual([])
  })

  it('draws the card a bare app link asks for, resolved under the reference its value spells', async () => {
    const c = show(thread(`the plan is ${ISSUE_URL} for now`, [{ value: ISSUE, layout: 'detailed' }]))
    await waitFor(() => expect(cards(c)).toEqual([[bare(ISSUE_REF), 'detailed']]))
    expect(sentence(c)).toBe('the plan is The probe issue for now')
  })

  it('a URL written in a link’s label names nothing: the link goes elsewhere', async () => {
    const c = show(thread(`see [${ISSUE_URL}](https://evil.example/login)`, [{ value: ISSUE, layout: 'detailed' }]))
    await new Promise((r) => setTimeout(r, 50))
    expect(cards(c)).toEqual([])
  })

  it('draws nothing for none, and nothing for a link §7.7 does not resolve', async () => {
    const none = show(thread(body, [{ value: ISSUE, layout: 'none' }]))
    const lookalike = show(thread(`see [this](https://evil.example/issue/x-${ISSUE.split(':')[2]})`, [{ value: ISSUE, layout: 'detailed' }]))
    await new Promise((r) => setTimeout(r, 50))
    expect(cards(none)).toEqual([])
    expect(cards(lookalike)).toEqual([])
  })
})
