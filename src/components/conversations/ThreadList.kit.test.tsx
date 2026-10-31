/**
 * A comment's links drawn by the kit, as Peek draws them — WBM-5 (Widgets 2):
 * where a link sits decides how it draws (SPEC §13.2; record
 * a-link-on-words-counts-toward-the-card). A link in a sentence is a
 * chip, a line that is only a link to a file is that file's row, a person or a
 * Folder alone stays a chip, and the file its author chose gets the card under
 * the comment — which any reader may change from (Decided 16 Oct). The file a
 * conversation is on draws no card there (WID-3). The write itself is
 * asserted at the wire in `api/cardAction.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addrToNaddr, encodeNpub, type Embed } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'

const SHIP = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const BRUNO = 'f3a38fa6c6a1e5d2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081920'
const SENTENCE_ISSUE = `30851:${SHIP}:a0b27d90-d5b9-40e7-8078-865ab36a421c`
const CARD_ISSUE = `30851:${SHIP}:c0b27d90-d5b9-40e7-8078-865ab36a421c`
const PROJECT = `30850:${SHIP}:b0b27d90-d5b9-40e7-8078-865ab36a421c`
const FOLDER = `39000:${BRUNO}:d0b27d90-d5b9-40e7-8078-865ab36a421c`
const TOPIC = `30840:${BRUNO}:e0b27d90-d5b9-40e7-8078-865ab36a421c`
const ref = (address: string) => `nostr:${addrToNaddr(address, [])}`
const PERSON = `nostr:${encodeNpub(ADA)}`

const base = (address: string, title: string, over: Record<string, unknown> = {}) => ({
  ref: address,
  address,
  eventId: 'e'.repeat(64),
  kind: Number(address.split(':')[0]),
  widget: 'row',
  appName: 'Ship',
  slots: { title: { value: title } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
  ...over,
})
const cardIssue = () =>
  base(CARD_ISSUE, 'Cards draw from the kit', {
    slots: { title: { value: 'Cards draw from the kit' }, status: { value: 'Todo', colour: 'neutral', field: 'status' } },
    meta: [{ label: 'Assignee', value: ADA, isPubkey: true, field: 'assignee' }],
    people: { [ADA]: { displayName: 'Ada Lovelace' } },
    actions: [
      { id: 'set-issue-status', label: 'Change status', control: 'select', field: 'status', current: 'todo', options: [{ value: 'todo', label: 'Todo', colour: 'neutral' }, { value: 'done', label: 'Done', colour: 'green' }] },
      { id: 'assign-issue', label: 'Assign', control: 'pubkey', field: 'assignee', current: ADA },
    ],
  })

const { objects, applyCardAction } = vi.hoisted(() => ({
  objects: { byReference: {} as Record<string, unknown>, parentArchive: {} as Record<string, { by: string; at: number; with: string } | undefined>, said: undefined as { count: number; unread: boolean } | undefined, deleted: new Set<string>() },
  applyCardAction: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  // A file with no entry is never answered: the card waits, as on a slow relay. A person is not a file. `FAILS`: the read throws (a 429).
  resolveForeign: vi.fn((reference: string) =>
    objects.byReference[reference] === 'FAILS'
      ? Promise.reject(new Error('rate-limited'))
      : reference in objects.byReference || /^nostr:npub1/.test(reference)
        ? Promise.resolve((objects.byReference[reference] ?? null) as ForeignObject | null)
        : new Promise<never>(() => {}),
  ),
  applyCardAction,
  parentArchiveOf: vi.fn(async (reference: string) => objects.parentArchive[reference]),
}))
// Whether a file read back empty was deleted: never unless a test says (the read itself is `absence.test`'s).
vi.mock('@/api/absence', () => ({ useDeleted: (reference: string, absent: boolean) => absent && objects.deleted.has(reference) }))
// What was said about a file: none unless a test says (the read itself is `useCardConversation.test`'s).
vi.mock('@/api/useCardConversation', () => ({ useCardConversation: (address: string | undefined) => (address ? objects.said : undefined) }))
vi.mock('@/components/editing/mentionables', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/editing/mentionables')>()),
  useWorkspacePeople: () => ({ [ADA]: { displayName: 'Ada Lovelace' }, [BRUNO]: { displayName: 'Bruno Ferreira' } }),
}))

import { ThreadList } from './ThreadList'
import { MessageText } from './MessageText'
import type { ThreadData } from '@/components/ConversationThread'
import { AppProvider } from '@estiva-app/ui'
import { cardShapes } from '@/lib/cardShapes'
import { noteCardAvailability } from '@/lib/unavailableCards'

const thread = (body: string, embeds?: Embed[]): ThreadData => ({ id: 't1', root: { id: 't1', author: { name: 'Ann' }, at: 1000, body, by: 'ann', embeds }, replies: [] })
const noop = async (): Promise<true> => true
const show = (body: string, { embeds, about }: { embeds?: Embed[]; about?: string } = {}) => render(<ThreadList threads={[thread(body, embeds)]} onStart={noop} onReply={noop} about={about} />).container
// A row's title, its link: since ui 0.91.0 a row has a second line under it (its key and what it is).
const rows = (c: HTMLElement) => [...c.querySelectorAll('[data-message-text] [data-link-row]')].map((row) => row.querySelector('a')?.textContent)
const sentence = (c: HTMLElement) => c.querySelector('[data-message-text] p')?.textContent

beforeEach(() => {
  applyCardAction.mockClear()
  objects.parentArchive = {}
  objects.said = undefined
  objects.deleted.clear()
  objects.byReference = {
    [ref(SENTENCE_ISSUE)]: base(SENTENCE_ISSUE, 'Fix the sign-in'),
    [ref(PROJECT)]: base(PROJECT, 'Widgets 2'),
    [ref(CARD_ISSUE)]: cardIssue(),
    [ref(FOLDER)]: base(FOLDER, 'Design'),
  }
})

const THE_MESSAGE = `Look at ${ref(SENTENCE_ISSUE)} today.\n\n${ref(PROJECT)}\n\n${ref(CARD_ISSUE)}`
const ITS_CARD: Embed[] = [{ value: CARD_ISSUE, layout: 'detailed' }]

describe('where a link sits decides how it draws', () => {
  it('draws a link in a sentence as its chip, a link alone as its row, and the carded file only as its card', async () => {
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(c.querySelector('[data-card="detailed"]')?.textContent).toContain('Cards draw from the kit'))
    expect(sentence(c)).toBe('Look at Fix the sign-in today.')
    expect(rows(c)).toEqual(['Widgets 2'])
    // The carded issue's own line draws nothing: no row, no chip.
    expect(c.textContent?.match(/Cards draw from the kit/g)).toHaveLength(1)
  })

  it('gives a row its comment count, opening the file’s conversation, as its card has', async () => {
    objects.said = { count: 3, unread: false }
    const c = show(`${ref(PROJECT)}`)
    await waitFor(() => expect(rows(c)).toEqual(['Widgets 2']))
    const count = within(c.querySelector('[data-link-row]') as HTMLElement).getByRole('link', { name: /comments — open the conversation/ })
    expect(count.textContent).toContain('3')
    expect(count.getAttribute('href')).toMatch(/activity/)
  })

  it('draws a bullet or numbered line that is only a link as a row, keeping its bullet', async () => {
    const c = show(`- ${ref(PROJECT)}\n- and ${ref(SENTENCE_ISSUE)} too\n\n1. ${ref(SENTENCE_ISSUE)}`)
    await waitFor(() => expect(rows(c)).toEqual(['Widgets 2', 'Fix the sign-in']))
    expect(c.querySelector('ul li [data-link-row]')).not.toBeNull()
    expect(c.querySelector('ol li [data-link-row]')).not.toBeNull()
    // A bullet with words around its link is a sentence.
    expect(c.querySelectorAll('ul li')[1].textContent).toBe('and Fix the sign-in too')
  })

  it('keeps a person or a Folder alone on its line a chip', async () => {
    const c = render(<ThreadList threads={[thread(`${PERSON}\n\n${ref(FOLDER)}`)]} onStart={noop} onReply={noop} nameOf={(pk) => (pk === ADA ? 'Ada Lovelace' : pk)} />).container
    await waitFor(() => expect(c.textContent).toContain('Design'))
    expect(rows(c)).toEqual([])
    expect(c.textContent).toContain('@Ada Lovelace')
  })
})

describe('the card under the comment', () => {
  it('changes the issue from its status and assignee, for any reader', async () => {
    show(THE_MESSAGE, { embeds: ITS_CARD })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Status' }))
    await userEvent.click(await screen.findByRole('option', { name: /Done/ }))
    await waitFor(() => expect(applyCardAction).toHaveBeenCalledWith({ reference: ref(CARD_ISSUE), actionId: 'set-issue-status', value: 'done' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Assignee' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bruno Ferreira/ }))
    await waitFor(() => expect(applyCardAction).toHaveBeenCalledWith({ reference: ref(CARD_ISSUE), actionId: 'assign-issue', value: BRUNO }))
  })

  it('shows the pick at once and holds it until the file is read again, then shows what the relay holds', async () => {
    let answer: (result: { ok: true }) => void = () => {}
    applyCardAction.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)) as never)
    show(THE_MESSAGE, { embeds: ITS_CARD })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Status' }))
    await userEvent.click(await screen.findByRole('option', { name: /Done/ }))
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    // The relay's answer is the file read again, here still Todo: the card shows that.
    answer({ ok: true })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Todo'))
  })

  it('says why when the relay refuses the change', async () => {
    applyCardAction.mockResolvedValueOnce({ ok: false, reason: 'restricted: not a member' } as never)
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Status' }))
    await userEvent.click(await screen.findByRole('option', { name: /Done/ }))
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('restricted: not a member'))
    // The pick was not saved: the picker is back on what the file holds.
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Todo')
  })

  it('reads its values as words for an archived file, as its page does', async () => {
    objects.byReference[ref(CARD_ISSUE)] = { ...cardIssue(), archived: { at: 1, by: SHIP } }
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('Cards draw from the kit'))
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
  })

  it('reads its values as words where nobody can write: an archived file’s conversation, or signed out', async () => {
    const c = render(<ThreadList threads={[thread(THE_MESSAGE, ITS_CARD)]} onStart={noop} onReply={noop} disabledReason="This issue is archived." />).container
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('Cards draw from the kit'))
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
    expect(c.querySelector('[data-card]')?.textContent).toContain('Todo')
  })

  it('reads its values as words for an issue whose project is archived, as Leaf’s card does', async () => {
    objects.byReference[ref(CARD_ISSUE)] = { ...cardIssue(), parentRef: PROJECT }
    objects.parentArchive[ref(CARD_ISSUE)] = { by: SHIP, at: 1, with: PROJECT }
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('Cards draw from the kit'))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull())
    expect(c.querySelector('[data-card]')?.textContent).toContain('Todo')
  })

  it('keeps the height it last drew at while it loads', () => {
    delete objects.byReference[ref(CARD_ISSUE)]
    cardShapes.note(ref(CARD_ISSUE).replace(/^nostr:/, ''), { subtitle: false, summary: true, rows: 0, latest: false, ring: false, footer: 'pickers', height: 134 })
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    const card = c.querySelector<HTMLElement>('[data-card="detailed"]')
    expect(card?.style.minHeight).toBe('134px')
    expect(card?.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('says "not available." for a file the reader cannot read, and draws that row at once the next time', async () => {
    objects.byReference[ref(CARD_ISSUE)] = null
    const first = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(first.querySelector('[data-card]')?.textContent).toBe('Issue not available'))
    first.remove()
    // Next open, before the relay answers: the one-line row from the first paint, not a card's height.
    delete objects.byReference[ref(CARD_ISSUE)]
    const again = show(THE_MESSAGE, { embeds: ITS_CARD })
    expect(again.querySelector('[data-card]')?.textContent).toBe('Issue not available')
    noteCardAvailability(ref(CARD_ISSUE).replace(/^nostr:/, ''), true)
  })

  // SPEC §13.6.1, "deleted is not not-permitted" (Katerina, 30 Oct, widget review 56).
  it('says "deleted" for a file a trusted deletion names, on its card and its chip, and "not available" for the rest', async () => {
    objects.byReference[ref(CARD_ISSUE)] = null
    objects.byReference[ref(SENTENCE_ISSUE)] = null
    objects.deleted.add(ref(CARD_ISSUE))
    objects.deleted.add(ref(SENTENCE_ISSUE))
    const c = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toBe('Issue deleted'))
    expect(sentence(c)).toBe('Look at Issue deleted today.')
    objects.deleted.clear()
    const other = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(other.querySelector('[data-card]')?.textContent).toBe('Issue not available'))
    cleanup()
    noteCardAvailability(ref(CARD_ISSUE).replace(/^nostr:/, ''), true)
  })

  it('says "not available." when its read fails with nothing remembered, never nothing, and does not remember it', async () => {
    objects.byReference[ref(CARD_ISSUE)] = 'FAILS'
    const first = show(THE_MESSAGE, { embeds: ITS_CARD })
    await waitFor(() => expect(first.querySelector('[data-card]')?.textContent).toBe('Issue not available'))
    first.remove()
    // A failed read is not an answer: the next open waits for the card, at a card's height, not the one-line row.
    delete objects.byReference[ref(CARD_ISSUE)]
    const again = show(THE_MESSAGE, { embeds: ITS_CARD })
    expect(again.querySelector('[data-card] [aria-busy="true"]')).not.toBeNull()
  })

  it('names another app’s file it cannot read by its app, its type having no name, with a way to open it there', async () => {
    objects.byReference[ref(TOPIC)] = { ...base(TOPIC, ''), unreachable: true, appName: 'Peek', openUrl: `https://peek.estiva.app/o/${TOPIC}` }
    const c = show(ref(TOPIC), { embeds: [{ value: TOPIC, layout: 'detailed' }] })
    await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('Peek not available'))
    // The kit's Button "Open", the app in its name (ui 0.95; Katerina, 31 Oct).
    expect(c.querySelector('[data-card] a')?.getAttribute('aria-label')).toBe('Open in Peek')
    expect(c.querySelector('[data-card] a')?.textContent).toBe('Open')
  })
})

describe('where the comment is shown', () => {
  it('draws no card for the file the conversation is on, and its link stays where it was written', async () => {
    const c = show(THE_MESSAGE, { embeds: ITS_CARD, about: CARD_ISSUE })
    await waitFor(() => expect(c.textContent).toContain('Cards draw from the kit'))
    expect(c.querySelector('[data-card]')).toBeNull()
    expect(rows(c)).toEqual(['Widgets 2'])
  })

  it('shows no hover card on a chip whose card is already under the message; another chip still has one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const resolved = Object.fromEntries(Object.entries(objects.byReference)) as Record<string, ForeignObject>
      const c = render(<MessageText body={`See ${ref(CARD_ISSUE)} and ${ref(SENTENCE_ISSUE)}.`} embeds={ITS_CARD} resolved={resolved} />).container
      await waitFor(() => expect(c.querySelector('[data-card]')?.textContent).toContain('Cards draw from the kit'))
      const said = (words: string) => c.ownerDocument.body.textContent?.split(words).length ?? 0
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const [carded, other] = [...c.querySelectorAll<HTMLAnchorElement>('[data-message-text] a')]
      const before = said('Cards draw from the kit')
      await user.hover(carded)
      await act(async () => void vi.advanceTimersByTime(1000))
      expect(said('Cards draw from the kit')).toBe(before)
      await user.unhover(carded)
      const otherBefore = said('Fix the sign-in')
      await user.hover(other)
      await act(async () => void vi.advanceTimersByTime(1000))
      expect(said('Fix the sign-in')).toBeGreaterThan(otherBefore)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a click on a link', () => {
  // The kit's AppProvider does it since ui 0.92 (Ship's own click capture went with it), as the app's root gives it a router.
  it('opens another app’s file in a new tab, never in Ship’s', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    objects.byReference[ref(TOPIC)] = { ...base(TOPIC, 'Weekly notes'), appName: 'Peek', openUrl: `https://peek.estiva.app/o/${TOPIC}` }
    const c = render(
      <AppProvider navigate={vi.fn()}>
        <ThreadList threads={[thread(`Look at ${ref(TOPIC)} today.`)]} onStart={noop} onReply={noop} />
      </AppProvider>,
    ).container
    await waitFor(() => expect(sentence(c)).toBe('Look at Weekly notes today.'))
    fireEvent.click(c.querySelector('[data-message-text] a') as HTMLAnchorElement)
    expect(open).toHaveBeenCalledWith(`https://peek.estiva.app/o/${TOPIC}`, '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('never makes a link of an address that is not https', async () => {
    objects.byReference[ref(TOPIC)] = { ...base(TOPIC, 'Weekly notes'), appName: 'Peek', openUrl: 'javascript:alert(1)//' }
    const c = show(`Look at ${ref(TOPIC)} today.\n\n${ref(TOPIC)}`, { embeds: [{ value: TOPIC, layout: 'compact' }] })
    await waitFor(() => expect(c.textContent).toContain('Weekly notes'))
    expect([...c.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((href) => /^\s*javascript:/i.test(href ?? ''))).toEqual([])
  })
})
