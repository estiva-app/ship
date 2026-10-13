/**
 * A message draws the card its author asked for — SPEC §13.6.2, OPT-16.
 *
 * The fold (`foldEmbeds`) and the rule (`cardsIn`) are the packages' and have
 * their own tests. This is the wiring: the `embed` set reaches the message
 * through `threadFor`, `compact` draws the object's row and `detailed` its
 * card, whatever the manifest's `widget` says, and `none` — or no `embed` at
 * all — draws none. Until milestone 2 a reference alone on its line is still a
 * card by default, and an `embed` for it is the author's call.
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

// §7.7 as `api/linkCards` answers it, with its own test: Ship's link names the issue, nothing else names anything.
const ISSUE_URL = `https://ship.estiva.app/issue/the-probe-issue-${ISSUE.split(':')[2]}`
vi.mock('@/api/linkCards', () => {
  // Hoisted above the constants, so spelled out again.
  const url = 'https://ship.estiva.app/issue/the-probe-issue-f78c3b96-2a3b-4d92-910a-ac25aba672cd'
  const issue = '30851:b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46:f78c3b96-2a3b-4d92-910a-ac25aba672cd'
  return {
    knownLinkValue: (asked: string) => (asked === url ? issue : undefined),
    useLinkValues: (urls: readonly string[]) => new Map(urls.filter((asked) => asked === url).map((asked) => [asked, issue])),
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
const cards = (c: HTMLElement) => [...c.querySelectorAll('[data-cards] [data-foreign-object]')].map((e) => [e.getAttribute('data-foreign-object'), e.getAttribute('data-widget')])

describe('a message that asks for a card', () => {
  it('draws compact as the row, under the sentence, and keeps the chip', async () => {
    const c = show(thread(`the plan is in ${ISSUE_REF} for now`, [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(cards(c)).toEqual([[ISSUE_REF, 'row']]))
    expect(c.textContent).toContain('the plan is in')
    expect(c.querySelector('[data-reference]')).not.toBeNull()
  })

  it('draws detailed as the card, whatever the manifest says, in body order', async () => {
    const c = show(thread(`${PROJECT_REF} holds ${ISSUE_REF}`, [{ value: ISSUE, layout: 'detailed' }, { value: PROJECT, layout: 'compact' }]))
    await waitFor(() => expect(cards(c)).toEqual([[PROJECT_REF, 'row'], [ISSUE_REF, 'card']]))
  })

  it('draws nothing for none, and nothing with no embed', async () => {
    const none = show(thread(`the plan is in ${ISSUE_REF}`, [{ value: ISSUE, layout: 'none' }]))
    const plain = show(thread(`the plan is in ${ISSUE_REF} too`))
    await waitFor(() => expect(plain.querySelector('[data-reference]')).not.toBeNull())
    expect(cards(none)).toEqual([])
    expect(cards(plain)).toEqual([])
    expect(plain.querySelector('[data-foreign-references]')).toBeNull()
  })

  it('draws nothing for a value the body no longer names', async () => {
    const c = show(thread('the link was edited out', [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(c.textContent).toContain('edited out'))
    expect(cards(c)).toEqual([])
  })

  it('replaces the lone-line card: none leaves the chip, compact draws the row once', async () => {
    const lone = show(thread(ISSUE_REF))
    await waitFor(() => expect(lone.querySelector('[data-foreign-references] [data-foreign-object]')).not.toBeNull())

    const none = show(thread(ISSUE_REF, [{ value: ISSUE, layout: 'none' }]))
    await waitFor(() => expect(none.querySelector('[data-reference]')).not.toBeNull())
    expect(none.querySelector('[data-foreign-object]')).toBeNull()

    const compact = show(thread(ISSUE_REF, [{ value: ISSUE, layout: 'compact' }]))
    await waitFor(() => expect(cards(compact)).toEqual([[ISSUE_REF, 'row']]))
    expect(compact.querySelectorAll('[data-foreign-object]').length).toBe(1)
  })
})

describe('a link on words that asks for a card (OPT-17)', () => {
  const body = `the plan is [these words](${ISSUE_URL}) for now`

  it('draws the card of the object the link names, resolved under the reference its value spells', async () => {
    const c = show(thread(body, [{ value: ISSUE, layout: 'detailed' }]))
    await waitFor(() => expect(cards(c)).toEqual([[ISSUE_REF, 'card']]))
    expect(c.textContent).toContain('these words')
  })

  it('draws nothing for none, and nothing for a link §7.7 does not resolve', async () => {
    const none = show(thread(body, [{ value: ISSUE, layout: 'none' }]))
    const lookalike = show(thread(`see [this](https://evil.example/issue/x-${ISSUE.split(':')[2]})`, [{ value: ISSUE, layout: 'detailed' }]))
    await new Promise((r) => setTimeout(r, 50))
    expect(cards(none)).toEqual([])
    expect(cards(lookalike)).toEqual([])
  })
})
