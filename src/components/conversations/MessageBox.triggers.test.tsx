/**
 * `@`, `!@`, `[` and `/` in Ship's message box — CON-25. The triggers are
 * `@estiva-app/ui/editor`'s; this proves Ship hands them its people, its
 * messages and its rows, and that a pick reaches `onSubmit` as the text and the
 * urgent picks the tags are built from. Each test types the key, picks with
 * Enter and sends with Enter — the person's path, not inserted nodes.
 */
import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import { encodeNpub } from '@estiva-app/protocol'
import { fileReference, messageReference } from '@estiva-app/conversation'
import { MentionPeopleProvider } from '@/components/editing/mentionables'
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
const MSG = 'd'.repeat(64)
const PEOPLE = [{ id: BOB, name: 'Bob', pubkey: BOB }, { id: 'ann', name: 'Ann', pubkey: null }]
const REFERENCES = [{ id: MSG, label: 'Bob', snippet: 'the numbers', uri: messageReference(MSG, 1111) }]
const ISSUE = `30851:${BOB}:i1`
const FILES = [{ id: ISSUE, label: 'Issue', snippet: 'Relay search', description: 'CON-33 · Conversation standard', uri: fileReference(ISSUE) }]
// Messages with nothing typed; once something is typed, Files — as `referenceSections` answers.
const sections = (query: string) => (query ? [{ label: 'Files', items: FILES }] : [{ label: 'Messages', items: REFERENCES }])

type EditorBox = HTMLElement & { editor: Editor }
async function compose(onSubmit: ComponentProps<typeof MessageBox>['onSubmit'], kind: 'conversation' | 'edit' = 'conversation') {
  render(
    <MentionPeopleProvider value={PEOPLE}>
      <MessageBox kind={kind} onSubmit={onSubmit} references={sections} />
    </MentionPeopleProvider>,
  )
  const target = screen.getByRole('textbox', { name: kind === 'edit' ? 'Edit message' : 'Start a conversation…' }) as EditorBox
  await waitFor(() => expect(target.editor?.view).toBeTruthy())
  await sleep(0)
  return target
}
// A person's row starts with their avatar's initial.
const names = (name: string) => rows(name).map((row) => row?.slice(1))
const type = (target: EditorBox, text: string) => act(() => void target.editor.chain().focus().insertContent(text).run())
const enter = (target: EditorBox) => act(() => void fireEvent.keyDown(target, { key: 'Enter' }))
const sleep = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))
const rows = (name: string) => within(screen.getByRole('listbox', { name })).getAllByRole('option').map((o) => o.textContent?.replace('↩ Enter', ''))

describe('the message box’s triggers (CON-25)', () => {
  it('@ lists Ship’s people and sends the person by key', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '@B')
    expect(names('People')).toEqual(['Bob'])
    await enter(box)
    await type(box, 'hi')
    await sleep(150) // the Enter that picked must not also send
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(`nostr:${encodeNpub(BOB)} hi`, [], { urgent: undefined })
  })

  it('!@ sends an ordinary mention and hands the urgent pick over for its tag', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '!@')
    expect(names('Urgent mention')).toEqual(['Bob', 'Ann'])
    await type(box, 'Bo')
    await enter(box)
    await sleep(150)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(`nostr:${encodeNpub(BOB)}`, [], { urgent: [BOB] })
  })

  it('a person with no key is sent by name, as Peek sends one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '@Ann')
    await enter(box)
    await sleep(150)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith('@Ann', [], { urgent: undefined })
  })

  it('[ takes a title with spaces, and Escape closes its list without leaving the box (f586437a)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '[relay search')
    expect(rows('Messages and files')).toEqual(['Issue: Relay searchCON-33 · Conversation standard'])
    await act(() => void fireEvent.keyDown(box, { key: 'Escape' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    // The box's own Escape (blur) waits for the second press.
    expect(box.contains(document.activeElement)).toBe(true)
    expect(box.editor.getText()).toBe('[relay search')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a list left by a click ends, so Escape in the reply box beside it is the reply box’s (71a4577b)', async () => {
    const onCancel = vi.fn()
    render(
      <MentionPeopleProvider value={PEOPLE}>
        <MessageBox kind="conversation" onSubmit={vi.fn()} references={sections} />
        <MessageBox kind="reply" onSubmit={vi.fn()} onCancel={onCancel} references={sections} />
      </MentionPeopleProvider>,
    )
    const box = screen.getByRole('textbox', { name: 'Start a conversation…' }) as EditorBox
    const reply = screen.getByRole('textbox', { name: 'Reply…' }) as EditorBox
    await waitFor(() => expect(box.editor?.view && reply.editor?.view).toBeTruthy())
    // jsdom does not treat a contenteditable as focusable: each box gets a tab stop.
    box.tabIndex = reply.tabIndex = -1
    await type(box, '[')
    // The caret is in the box before it leaves (the focus command waits a frame).
    act(() => box.editor.view.focus())
    expect(rows('Messages and files')).toHaveLength(1)
    expect(document.activeElement).toBe(box)
    act(() => reply.editor.view.focus())
    expect(document.activeElement).toBe(reply)
    await sleep(0)
    expect(screen.queryByRole('listbox')).toBeNull()
    // An empty reply's Escape closes it — not swallowed by the other box's list.
    await act(() => void fireEvent.keyDown(reply, { key: 'Escape' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    // Back in the first box there is no list: the `[` is text now (Miky, 2026-10-06).
    act(() => box.editor.view.focus())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('[ lists the page’s messages and sends the one picked as its nevent', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '[')
    expect(rows('Messages and files')).toEqual(['Bob: the numbers'])
    await enter(box)
    await sleep(150)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(messageReference(MSG, 1111), [], { urgent: undefined })
  })

  it('[ then a ref finds the issue under Files and sends it as the naddr a paste carries (PEE-21)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const box = await compose(onSubmit)
    await type(box, '[CON-33')
    expect(rows('Messages and files')).toEqual([expect.stringContaining('Relay search')])
    await enter(box)
    await sleep(150)
    await enter(box)
    expect(onSubmit).toHaveBeenCalledWith(fileReference(ISSUE), [], { urgent: undefined })
  })

  it('/ opens Format, then Insert with File and the three triggers — no Table in a message', async () => {
    const box = await compose(vi.fn())
    await type(box, '/')
    const list = screen.getByRole('listbox', { name: 'Commands' })
    expect(list).toHaveTextContent(/^Format.*Insert/)
    expect(rows('Commands')).toEqual(expect.arrayContaining(['File', 'Mention@', 'Urgent!@', 'Reference[']))
    expect(rows('Commands').some((row) => row?.startsWith('Table'))).toBe(false)
  })

  it('an edit offers no File: it keeps the message’s files as they are', async () => {
    const box = await compose(vi.fn(), 'edit')
    await type(box, '/')
    expect(rows('Commands')).not.toContain('File')
  })
})
