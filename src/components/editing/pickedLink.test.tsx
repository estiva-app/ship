/**
 * A project picked from `[` while writing (ALO-8): since the relay keeps
 * projects in order, `[` inserts it as its Ship link by id (interop's
 * `pickedFileUri`, `fileSearch.wire.test.ts`), not as a `nostr:` reference. In a
 * comment box and in a description being edited, that link is drawn as the
 * project's chip before it is sent or saved, not "You can't open this link";
 * a link the reader names nothing for is the URL as written, not a chip loading
 * for ever. The link reader is real: only the manifests and the relay's answer
 * are stubbed, so the box has to ask for the link and draw again when the answer
 * comes back. What a `nostr:` reference draws as (`resolveForeign`) is stubbed:
 * `foreign.test.ts` covers it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { addrToNaddr } from '@estiva-app/protocol'

const PK = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
// One project per surface: the reader keeps what it was told for the tab, so each surface must ask for its own.
const PROJECT_IDS = ['f0b27d90-d5b9-40e7-8078-865ab36a421c', 'f1b27d90-d5b9-40e7-8078-865ab36a421c']
const projectOf = (id: string) => `30850:${PK}:${id}`
const linkOf = (id: string) => `https://ship.estiva.app/project/${id}`
// Project links nobody answers for: deleted, or not readable by this viewer.
const UNKNOWN_IDS = ['a0b27d90-d5b9-40e7-8078-865ab36a421c', 'a1b27d90-d5b9-40e7-8078-865ab36a421c']

vi.mock(import('@/api/handoff'), async (importOriginal) => ({
  ...(await importOriginal()),
  declaredManifests: async () => [
    {
      kind: 31990,
      pubkey: 'c'.repeat(64),
      tags: [['web', 'https://ship.estiva.app/o/<bech32>', 'naddr'], ['urls', 'https://ship.estiva.app/project/<slug>-<d>#block-<block>', '30850'], ['k', '30850']],
      content: '{}',
      created_at: 1,
      id: 'm'.repeat(64),
      sig: '',
    } as never,
  ],
}))
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async (reference: string) => {
    const address = PROJECT_IDS.map(projectOf).find((one) => reference === `nostr:${addrToNaddr(one, [])}`)
    return (address
      ? { ref: address, address, eventId: 'e'.repeat(64), kind: 30850, widget: 'row', appName: 'Ship', slots: { title: { value: 'Picked project' } }, meta: [], comments: [], actions: [], viaRecommendation: true }
      : null) as never
  }),
}))
vi.mock('@/api/useCardConversation', () => ({ useCardConversation: () => undefined }))

import { relay } from '@/api/store'
import { ThreadListView } from '@/components/conversations/ThreadList'
import { LiveDescription } from './LiveDescription'

/* ProseMirror asks for rects jsdom does not draw, as `ThreadList.edit.test.tsx` says. */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

/** The relay, as asked by `d`: the project's one author for the picked id, nothing for any other. */
let asked: string[]
beforeEach(() => {
  asked = []
  vi.spyOn(relay, 'query').mockImplementation((async (filters: { '#d'?: string[] }[]) => {
    const d = filters[0]?.['#d']?.[0]
    if (!d) return []
    asked.push(d)
    return PROJECT_IDS.includes(d) ? [{ kind: 30850, pubkey: PK, tags: [['d', d]], content: '', created_at: 1, id: 'p'.repeat(64), sig: '' }] : []
  }) as never)
})

const ME = 'b'.repeat(64)
type EditorBox = HTMLElement & { editor: Editor }

/** What `[` puts in the box for a pick: a reference node holding the row's uri, at the caret. */
const pick = (box: EditorBox, uri: string) => act(() => void box.editor.chain().focus('end').insertContent({ type: 'reference', attrs: { uri } }).run())

/** Until the chip is drawn, whatever it says, and no longer loading; what it says is asserted after. */
const settled = (box: EditorBox) =>
  waitFor(() => {
    expect(box.querySelector('[aria-busy="true"]')).toBeNull()
    expect(box.textContent).not.toBe('No link yet.')
  })

const commentBox = async () => {
  render(
    <ThreadListView
      threads={[{ id: 'root-1', root: { id: 'root-1', author: { name: 'Me' }, at: 1_756_000_000, body: 'No link yet.', by: ME }, replies: [] }]}
      onStart={async () => true}
      onReply={async () => true}
      viewer={ME}
      onEditMessage={async () => true}
    />,
  )
  fireEvent.mouseEnter(document.querySelector('[data-comment-body]')!)
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit message' }))
  const box = (await screen.findByRole('textbox', { name: 'Edit message' })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}

const descriptionBox = async () => {
  render(<LiveDescription value="No link yet." format="marker" onCommit={() => true} resolved={{}} />)
  const box = screen.getByRole('textbox', { name: 'Description' }) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}

describe.each([
  ['a comment box', commentBox, PROJECT_IDS[0], UNKNOWN_IDS[0]],
  ['a description being edited', descriptionBox, PROJECT_IDS[1], UNKNOWN_IDS[1]],
] as const)('a project picked from [ in %s', (_, open, id, unknownId) => {
  it('is drawn as that project’s chip before it is sent, asked for by its id', async () => {
    const box = await open()
    pick(box, linkOf(id))
    await settled(box)
    expect(box.textContent).toContain('Picked project')
    expect(box.textContent).not.toMatch(/can.t open/)
    expect(asked).toContain(id)
  })

  it('stays the URL it was written as when the reader names nothing for it', async () => {
    const box = await open()
    pick(box, linkOf(unknownId))
    await settled(box)
    expect(box.querySelector('a')?.getAttribute('href')).toBe(linkOf(unknownId))
    expect(box.textContent).not.toMatch(/can.t open/)
    expect(asked).toContain(unknownId)
  })
})
