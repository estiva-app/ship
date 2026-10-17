// @vitest-environment jsdom
/**
 * What you were typing when your sign-in ends is still there after the passkey
 * tap, not yet saved (AUT-4; Decided 17 Oct). Each test types, lets Estiva ID
 * refuse a renewal, then comes back as the tap does: a new page load, signed in
 * again as the same person.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELAY_URL: 'wss://estiva.estiva.app',
  workspaceLabel: () => 'estiva.estiva.app',
}))
vi.mock('@/api/blobs', () => ({ blobObjectUrl: vi.fn(async () => 'blob:fetched'), uploadAttachment: vi.fn() }))

const KEY = 'ship.estiva-id.token'
const PERSON = 'b3'.repeat(32)
const signIn = (pubkey = PERSON) =>
  localStorage.setItem(KEY, JSON.stringify({ accessToken: 'at', pubkey, expiresAt: Date.now() + 3_600_000, refreshToken: 'rt-1' }))

/* jsdom has no layout; ProseMirror asks for rects on every change (as LiveDescription.test). */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

/** A page load: fresh modules, the app entered as whoever the store holds. */
async function load() {
  vi.resetModules()
  const id = await import('./estivaId')
  const stop = id.followOtherTabs()
  const { SessionGate } = await import('./SessionGate')
  const { LiveDescription } = await import('@/components/editing/LiveDescription')
  const { NewIssueDialog } = await import('@/components/NewIssueDialog')
  const { useReopenHeld } = await import('./heldTyping')
  const { MessageBox } = await import('@/components/conversations/MessageBox')
  return { id, stop, SessionGate, LiveDescription, NewIssueDialog, MessageBox, useReopenHeld }
}

/** Estiva ID refuses the next renewal: the sign-in has ended. */
async function signInEnds(id: Awaited<ReturnType<typeof load>>['id']) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) } as Response)
  await act(async () => void (await id.renew()))
  expect(screen.getByRole('button', { name: 'Continue with passkey' })).toBeTruthy()
}

type EditorBox = HTMLElement & { editor: Editor }
const description = async () => {
  const box = (await screen.findByRole('textbox', { name: 'Description' })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  return box
}

it('keeps an issue description typed when the sign-in ends, and puts it back unsaved after the tap', async () => {
  signIn()
  const commit = vi.fn(async () => true)
  let page = await load()
  const issue = (p: typeof page) => (
    <p.SessionGate>
      <p.LiveDescription value="The plan" format="marker" onCommit={commit} holdKey="description:30851:x:issue" />
    </p.SessionGate>
  )
  render(issue(page))
  const box = await description()
  act(() => void box.editor.chain().focus('end').insertContent(' is to ship on Friday').run())

  await signInEnds(page.id)
  // Leaving the page did not try to save: that save would be refused with nothing on screen to say so.
  expect(commit).not.toHaveBeenCalled()

  page.stop()
  cleanup()
  signIn()
  page = await load()
  render(issue(page))
  expect((await description()).textContent).toContain('The plan is to ship on Friday')
  expect(commit).not.toHaveBeenCalled()
  page.stop()
})

/** A message, as `ThreadList`'s: Edit opens the box, and it opens again when it holds text. */
function MessageHarness({ p, onSubmit }: { p: Awaited<ReturnType<typeof load>>; onSubmit: () => boolean }) {
  const [editing, setEditing] = useState(false)
  p.useReopenHeld('edit:m1', () => setEditing(true))
  return editing ? (
    <p.MessageBox kind="edit" initial="See you at 10" holdKey="edit:m1" onSubmit={onSubmit} onCancel={() => setEditing(false)} />
  ) : (
    <button onClick={() => setEditing(true)}>Edit message</button>
  )
}

it('keeps a message being edited open through the passkey trip, with the new words, not yet saved', async () => {
  signIn()
  const onSubmit = vi.fn(() => true)
  let page = await load()
  const thread = (p: typeof page) => (
    <p.SessionGate>
      <MessageHarness p={p} onSubmit={onSubmit} />
    </p.SessionGate>
  )
  render(thread(page))
  fireEvent.click(screen.getByRole('button', { name: 'Edit message' }))
  const box = (await screen.findByRole('textbox', { name: 'Edit message' })) as EditorBox
  await waitFor(() => expect(box.editor.isInitialized).toBe(true))
  act(() => void box.editor.chain().focus('end').insertContent(':30').run())

  await signInEnds(page.id)

  page.stop()
  cleanup()
  signIn()
  page = await load()
  render(thread(page))
  expect((await screen.findByRole('textbox', { name: 'Edit message' })).textContent).toContain('See you at 10:30')
  expect(onSubmit).not.toHaveBeenCalled()
  page.stop()
})

/** The page that owns the dialog, as `IssuesPage` does: a button, and the dialog opened again when it holds text. */
function IssuesHarness({ p }: { p: Awaited<ReturnType<typeof load>> }) {
  const [adding, setAdding] = useState(false)
  p.useReopenHeld('new-issue', () => setAdding(true))
  return (
    <>
      <button onClick={() => setAdding(true)}>New issue</button>
      {adding && (
        <p.NewIssueDialog
          projects={[{ value: '30850:x:login', label: 'Login' }]}
          holdKey="new-issue"
          onClose={() => setAdding(false)}
          onCreate={create}
        />
      )}
    </>
  )
}
const create = vi.fn(async () => true)

it('keeps a New issue dialog open through the passkey trip, with what was typed in it, not yet created', async () => {
  signIn()
  let page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'New issue' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Sign-in keeps my text' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'Seen on 18 Aug' } })

  await signInEnds(page.id)

  page.stop()
  cleanup()
  signIn()
  page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  expect(((await screen.findByRole('textbox', { name: /Title/ })) as HTMLInputElement).value).toBe('Sign-in keeps my text')
  expect((screen.getByRole('textbox', { name: /Description/ }) as HTMLTextAreaElement).value).toBe('Seen on 18 Aug')
  expect(create).not.toHaveBeenCalled()
  page.stop()
})

it('keeps nothing on the device when another tab signs out: that is a sign-out, not an ending', async () => {
  signIn()
  let page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'New issue' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Private plans' } })
  localStorage.removeItem(KEY)
  act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage })))
  expect(screen.getByRole('button', { name: 'Continue with passkey' })).toBeTruthy()
  expect(Object.keys(localStorage).join(' ')).not.toContain('Private plans')
  expect(JSON.stringify({ ...localStorage })).not.toContain('Private plans')

  page.stop()
  cleanup()
  signIn()
  page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  expect(screen.queryByRole('textbox', { name: /Title/ })).toBeNull()
  page.stop()
})

it('gives what was typed back only to the person who typed it', async () => {
  signIn()
  let page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'New issue' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Mine only' } })
  await signInEnds(page.id)

  page.stop()
  cleanup()
  signIn('c4'.repeat(32))
  page = await load()
  render(
    <page.SessionGate>
      <IssuesHarness p={page} />
    </page.SessionGate>,
  )
  expect(screen.queryByRole('textbox', { name: /Title/ })).toBeNull()
  page.stop()
})
