/**
 * A linked Folder's card lists its files; its chip lists nothing (SPEC §3.2;
 * Miky, 2026-10-16).
 *
 * The resolve itself — the files a Folder's `30890` lists, in its order, and no
 * message — is `api/foreign.test.ts`'s, against a relay. This is the wiring: a
 * card under a message asks for the files in a read of its own, draws at once
 * and fills in, and that read happens when the card is drawn and on focus,
 * never on the ten-second tick every chip and card is re-resolved on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { addrToNaddr, type Embed } from '@estiva-app/protocol'
import type { ForeignObject as Data } from '@/api/foreign'
import { resolveForeign } from '@/api/foreign'
import { REFRESH_MS } from '@/lib/useRefresh'

const PK = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const RELAY = 'c'.repeat(64)
// A Folder of its own for each test: an answer is held for the tab, as it is in Ship.
let FOLDER = ''
let FOLDER_REF = ''
let folders = 0

const object = (address: string, title: string, over: Partial<Data> = {}): Data =>
  ({ ref: address, address, eventId: 'e'.repeat(64), kind: Number(address.split(':')[0]), widget: 'card', appName: 'Peek', slots: { title: { value: title } }, meta: [], comments: [], actions: [], viaRecommendation: true, ...over }) as unknown as Data

const FILES = [object(`30840:${PK}:topic`, 'Weekly notes', { noun: 'topic' }), object(`30850:${PK}:project`, 'Launch', { noun: 'project' })]

vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(),
}))

import { ThreadList } from './ThreadList'
import type { ThreadData } from '@/components/ConversationThread'

const thread = (id: string, body: string, embeds?: Embed[]): ThreadData => ({
  id,
  root: { id, author: { name: 'Ann' }, at: 1000, body, by: 'ann', embeds },
  replies: [],
})
const noop = () => {}
const show = (threads: ThreadData[]) => render(<ThreadList threads={threads} onStart={noop} onReply={noop} />).container
const cardOf = (c: HTMLElement) => c.querySelector(`[data-cards] [data-foreign-object="${FOLDER}"]`)
const listed = (c: HTMLElement) => [...(cardOf(c)?.querySelectorAll('[data-foreign-object]') ?? [])].map((e) => e.getAttribute('data-foreign-object'))
const askedFiles = () => vi.mocked(resolveForeign).mock.calls.filter(([, options]) => options?.folderFiles).length
const flush = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

let filesArrive: (files: Data[]) => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  FOLDER = `39000:${RELAY}:0b8b7c1e-5f0e-4b4a-9d55-2f1d3c8a7e${String(++folders).padStart(2, '0')}`
  FOLDER_REF = `nostr:${addrToNaddr(FOLDER)}`
  vi.mocked(resolveForeign).mockReset()
  vi.mocked(resolveForeign).mockImplementation((reference, options) => {
    if (reference !== FOLDER_REF) return Promise.resolve(null)
    if (!options?.folderFiles) return Promise.resolve(object(FOLDER, 'Estiva HQ', { noun: 'folder' }))
    return new Promise((resolve) => {
      filesArrive = (files) => resolve(object(FOLDER, 'Estiva HQ', { noun: 'folder', children: files }))
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a Folder linked in a message', () => {
  it('draws its card at once and fills in the files it lists, in its order; the chip in a sentence asks for none', async () => {
    const c = show([thread('t1', `notes are in ${FOLDER_REF} today`), thread('t2', FOLDER_REF, [{ value: FOLDER, layout: 'detailed' }])])
    await flush()

    // The card, before its files: the Folder's name, and neither a list nor "nothing in it".
    expect(cardOf(c)?.textContent).toContain('Estiva HQ')
    expect(listed(c)).toEqual([])
    expect(c.textContent).not.toMatch(/nothing in it/i)
    expect(askedFiles()).toBe(1)

    await act(async () => filesArrive(FILES))
    expect(listed(c)).toEqual([FILES[0].ref, FILES[1].ref])
    expect(cardOf(c)?.textContent).toContain('Weekly notes')
    expect(cardOf(c)?.textContent).toContain('Launch')

    // The chip in the sentence: its name, and no list of its own.
    const chip = c.querySelector('[data-message="t1"]')
    expect(chip?.textContent).toContain('Estiva HQ')
    expect(chip?.querySelector('[data-foreign-object]')).toBeNull()
  })

  it('reads the files again on focus, never on the refresh tick that re-reads every chip and card', async () => {
    show([thread('t1', FOLDER_REF, [{ value: FOLDER, layout: 'detailed' }])])
    await flush()
    await act(async () => filesArrive(FILES))
    const ticksBefore = vi.mocked(resolveForeign).mock.calls.length - askedFiles()

    await flush(REFRESH_MS * 4)
    // The control: the tick did run, re-resolving the card as it does every chip.
    expect(vi.mocked(resolveForeign).mock.calls.length - askedFiles()).toBeGreaterThan(ticksBefore)
    expect(askedFiles()).toBe(1)

    // Past the half minute an answer stands for a second card of the same Folder.
    await flush(30_000)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(askedFiles()).toBe(2)
  })

  it('draws no list, and no "nothing in it", for a Folder whose files cannot be listed', async () => {
    const c = show([thread('t1', FOLDER_REF, [{ value: FOLDER, layout: 'detailed' }])])
    await flush()
    // A DM's Folder has no 30890, and a listing that cannot be read answers the same: no `children`.
    await act(async () => filesArrive(undefined as unknown as Data[]))
    expect(cardOf(c)?.textContent).toContain('Estiva HQ')
    expect(listed(c)).toEqual([])
    expect(c.textContent).not.toMatch(/nothing in it/i)
  })
})
