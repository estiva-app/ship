/**
 * A page's resolve and reopen (ONE-8): filed in the comment's own team, never the page's; a refused resolve goes back to
 * its dialog only, and a refused reopen, which has no dialog, is said by the page. `resolveThread` is mocked here: what it
 * signs is asserted at the wire in `src/api/resolve.wire.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest'

const resolveThread = vi.fn()
vi.mock(import('@/api'), async (importOriginal) => ({ ...(await importOriginal()), resolveThread: (...args: unknown[]) => resolveThread(...args) }))

const { resolveAnswer } = await import('./ProjectPage')

const COMMENT = 'c'.repeat(64)
const COMMENT_TEAM = 'comment-team'
const state = { conversations: [{ id: COMMENT, root: { id: COMMENT, folder: COMMENT_TEAM }, replies: [] }] } as never

describe('resolveAnswer', () => {
  it("files the resolve in the comment's own team, with the note", async () => {
    resolveThread.mockResolvedValueOnce({ ok: true })
    const say = vi.fn()
    expect(await resolveAnswer(state, COMMENT, true, 'Shipped', say)).toBe(true)
    expect(resolveThread).toHaveBeenLastCalledWith({ folder: COMMENT_TEAM, threadId: COMMENT, resolved: true, note: 'Shipped' })
    expect(say).not.toHaveBeenCalled()
  })

  it('says a refused reopen on the page, since a reopen has no dialog', async () => {
    resolveThread.mockResolvedValueOnce({ ok: false, reason: 'restricted: not a member' })
    const say = vi.fn()
    expect(await resolveAnswer(state, COMMENT, false, undefined, say)).not.toBe(true)
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/^Not reopened: .+\.$/), 'error')
  })

  it('hands a refused resolve back to its dialog and says nothing on the page', async () => {
    resolveThread.mockResolvedValueOnce({ ok: false, reason: 'restricted: not a member' })
    const say = vi.fn()
    expect(await resolveAnswer(state, COMMENT, true, 'Done', say)).toBe('restricted: not a member')
    expect(say).not.toHaveBeenCalled()
  })
})
