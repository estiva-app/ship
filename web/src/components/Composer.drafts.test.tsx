/**
 * The composer keeps and forgets a draft — CON-10.
 *
 * `drafts.test.ts` asserts the store is right. This asserts the composer *uses*
 * it, which is a different claim and the one PEE-7 is about: the text is held
 * in memory and not keyed by destination, so it survives a navigation it should
 * not and is lost on one it should survive.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Composer } from './Composer'
import { createDraftStore, draftKeys } from '@/lib/drafts'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage
}

const type = (value: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })

describe('a composer with a draft key', () => {
  it('keeps what was typed, and hands it back on the way in', () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.thread('t1')
    const { unmount } = render(<Composer onSubmit={() => {}} draftKey={key} drafts={drafts} />)
    type('half a thought')
    unmount()

    render(<Composer onSubmit={() => {}} draftKey={key} drafts={drafts} />)
    expect(screen.getByRole('textbox')).toHaveValue('half a thought')
  })

  /*
    PEE-7's first symptom: "you start typing and you switch to a different
    topic, the text is kept there, which is weird". The component is reused as a
    list re-renders, so the destination changing is a prop change, not a mount.
  */
  it('does not carry text into a different destination', () => {
    const drafts = createDraftStore(memoryStorage())
    const { rerender } = render(
      <Composer onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />,
    )
    type('meant for t1')
    rerender(<Composer onSubmit={() => {}} draftKey={draftKeys.thread('t2')} drafts={drafts} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  /* And back again: the second symptom, the draft being gone on return. */
  it('brings the text back when the destination returns', () => {
    const drafts = createDraftStore(memoryStorage())
    const { rerender } = render(
      <Composer onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />,
    )
    type('meant for t1')
    rerender(<Composer onSubmit={() => {}} draftKey={draftKeys.thread('t2')} drafts={drafts} />)
    rerender(<Composer onSubmit={() => {}} draftKey={draftKeys.thread('t1')} drafts={drafts} />)
    expect(screen.getByRole('textbox')).toHaveValue('meant for t1')
  })

  it('forgets the draft once the relay took the message', async () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.object('30851:a:one')
    render(<Composer onSubmit={() => true} draftKey={key} drafts={drafts} />)
    type('about to send')
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    await vi.waitFor(() => expect(drafts.read(key)).toBeUndefined())
  })

  /*
    The case that matters more than the happy one. A refused publish must keep
    the text — losing a draft to a rejection is worse than never having had one,
    and `act` resolves false for exactly that.
  */
  it('keeps the draft when the send was refused', async () => {
    const drafts = createDraftStore(memoryStorage())
    const key = draftKeys.object('30851:a:one')
    render(<Composer onSubmit={() => false} draftKey={key} drafts={drafts} />)
    type('the relay will refuse this')
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('the relay will refuse this'))
    expect(drafts.read(key)).toBe('the relay will refuse this')
  })

  /* No key means no stable destination, so nothing is kept — a draft that
     cannot be keyed correctly is worse than none. */
  it('keeps nothing when it has no key', () => {
    const drafts = createDraftStore(memoryStorage())
    const { unmount } = render(<Composer onSubmit={() => {}} drafts={drafts} />)
    type('nowhere to put this')
    unmount()
    render(<Composer onSubmit={() => {}} drafts={drafts} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
