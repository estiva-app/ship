// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { UnreadByThread } from '@/components/ConversationThread'

let opening: Record<string, number> | undefined
vi.mock('@/api', () => ({ useOpeningReadState: (visit: string | undefined) => (visit === undefined ? undefined : opening) }))

const { useNewSince } = await import('./useNewSince')

/** A feed whose verdict is whatever `answers` holds for the frontier's `f` value. */
const hook = () =>
  renderHook(
    ({ visit, merged, verdictAt }: { visit: string | undefined; merged: Record<string, number>; verdictAt: (f: Readonly<Record<string, number>>) => UnreadByThread | undefined }) =>
      useNewSince(visit, merged, verdictAt),
    { initialProps: { visit: 'issue' as string | undefined, merged: { f: 2 } as Record<string, number>, verdictAt: (() => undefined) as (f: Readonly<Record<string, number>>) => UnreadByThread | undefined } },
  )

describe('where the divider goes for a visit (99557309)', () => {
  it('is nothing while read state loads', () => {
    opening = undefined
    const { result } = hook()
    expect(result.current).toEqual({ unread: undefined, stillUnread: undefined })
  })

  it('judges the divider at the opening frontier and "N new" at the live one', () => {
    opening = { f: 1 }
    const verdictAt = (f: Readonly<Record<string, number>>): UnreadByThread => (f.f === 1 ? { t1: ['a'] } : {})
    const { result, rerender } = hook()
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt })
    expect(result.current).toEqual({ unread: { t1: ['a'] }, stillUnread: {} })
  })

  it('keeps the first divider: a comment arriving later gets none (Miky, 2026-10-07)', () => {
    opening = { f: 1 }
    const { result, rerender } = hook()
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({ t1: ['a'] }) })
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({ t1: ['a'], t2: ['b'] }) })
    expect(result.current.unread).toEqual({ t1: ['a'] })
  })

  it('gives a comment arriving later the divider when there was none, and only that one', () => {
    opening = { f: 1 }
    const { result, rerender } = hook()
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({}) })
    expect(result.current.unread).toEqual({})
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({ t2: ['b'] }) })
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({ t2: ['b'], t3: ['c'] }) })
    expect(result.current.unread).toEqual({ t2: ['b'] })
  })

  it('judges afresh on a new visit', () => {
    opening = { f: 1 }
    const { result, rerender } = hook()
    rerender({ visit: 'issue', merged: { f: 2 }, verdictAt: () => ({ t1: ['a'] }) })
    rerender({ visit: 'project', merged: { f: 2 }, verdictAt: () => ({}) })
    expect(result.current.unread).toEqual({})
  })
})
