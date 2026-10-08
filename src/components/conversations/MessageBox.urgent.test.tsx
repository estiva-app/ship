/**
 * An urgent mention after it is sent — CON-24.
 *
 * The text of an urgent mention is the same `nostr:npub…` as an ordinary one;
 * the urgency is the message's `["urgent", <pubkey>]` tag (SPEC §13.1). A sent
 * message draws that chip urgent for every reader, and the edit box loads it
 * urgent but offers no new urgent pick: an edit carries no tags, so one could
 * never be sent (Miky, kickoff, 2026-10-07).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import { encodeNpub, type SignedEvent } from '@estiva-app/protocol'
import { MentionPeopleProvider } from '@/components/editing/mentionables'
import { ShipRichText } from '@/components/ui/ShipRichText'
import { urgentIndex } from '@/nostr/store'
import { MESSAGE_FORMAT } from './shared'
import { MessageBox } from './MessageBox'

beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
  Element.prototype.scrollIntoView ??= () => {}
})

const BOB = 'b'.repeat(64)
const PEOPLE = [{ id: BOB, name: 'Bob', pubkey: BOB }]
const BODY = `nostr:${encodeNpub(BOB)} please sign`
const nameOf = (pubkey: string) => (pubkey === BOB ? 'Bob' : `${pubkey.slice(0, 8)}…`)

type EditorBox = HTMLElement & { editor: Editor }
async function edit(onSubmit = vi.fn(), initialUrgent?: string[]) {
  const { container } = render(
    <MentionPeopleProvider value={PEOPLE}>
      <MessageBox kind="edit" initial={BODY} initialUrgent={initialUrgent} onSubmit={onSubmit} nameOf={nameOf} />
    </MentionPeopleProvider>,
  )
  const box = screen.getByRole('textbox', { name: 'Edit message' }) as EditorBox
  await waitFor(() => expect(box.editor?.view).toBeTruthy())
  return { box, container }
}
const type = (box: EditorBox, text: string) => act(() => void box.editor.chain().focus().insertContent(text).run())
const sleep = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

describe('a sent urgent mention', () => {
  it('is read off the message’s urgent tags', () => {
    const event = (id: string, tags: string[][]) => ({ id, tags }) as unknown as SignedEvent
    expect(urgentIndex([event('m1', [['p', BOB], ['urgent', BOB]]), event('m2', [['p', BOB]])])).toEqual({ m1: [BOB] })
  })

  it('draws its chip urgent when the message names the person urgently', () => {
    const { container } = render(<ShipRichText value={BODY} format={MESSAGE_FORMAT} nameOf={nameOf} urgent={[BOB]} />)
    expect(container.querySelector(`[data-mention="${BOB}"]`)?.className).toContain('bg-warning-muted')
  })

  it('draws the same text as an ordinary mention without the tag', () => {
    const { container } = render(<ShipRichText value={BODY} format={MESSAGE_FORMAT} nameOf={nameOf} />)
    const chip = container.querySelector(`[data-mention="${BOB}"]`)
    expect(chip).not.toBeNull()
    expect(chip?.className).not.toContain('bg-warning-muted')
  })
})

describe('the edit box', () => {
  it('loads the message’s urgent mention urgent', async () => {
    const { container } = await edit(vi.fn(), [BOB])
    await waitFor(() => expect(container.querySelector('[data-urgent-mention]')).toHaveTextContent('@Bob'))
  })

  it('loads an ordinary mention as ordinary', async () => {
    const { container } = await edit()
    expect(container.querySelector('[data-urgent-mention]')).toBeNull()
  })

  it('offers no urgent pick on !@', async () => {
    const { box } = await edit()
    await type(box, ' !@')
    await sleep(50)
    expect(screen.queryByRole('listbox', { name: 'Urgent mention' })).toBeNull()
  })

  it('saves a hand-typed !@Name as an ordinary mention, since an edit pages nobody', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { box } = await edit(onSubmit)
    await act(() => void box.editor.chain().focus('end').insertContent(' and !@Ann').run())
    await sleep(150)
    await act(() => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toBe(`${BODY} and @Ann`)
  })

  it('offers no Urgent row on /', async () => {
    const { box } = await edit()
    await type(box, ' /')
    const rows = within(screen.getByRole('listbox', { name: 'Commands' })).getAllByRole('option').map((o) => o.textContent ?? '')
    expect(rows.some((row) => row.startsWith('Mention'))).toBe(true)
    expect(rows.some((row) => row.startsWith('Urgent'))).toBe(false)
  })
})
