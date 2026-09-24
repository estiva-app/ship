import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_MS } from '@/lib/useRefresh'
import { resetRelayBudget } from '@/lib/relayBudget'
import type { ForeignObject } from './foreign'

const resolveForeign = vi.fn<(reference: string) => Promise<ForeignObject | null>>()
vi.mock('@/api/foreign', () => ({ resolveForeign: (r: string) => resolveForeign(r) }))

const { useForeignObjects } = await import('./useForeignObjects')

const card = (ref: string, title: string) => ({ ref, title }) as unknown as ForeignObject

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  resetRelayBudget()
  resolveForeign.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Let the resolve's promise chain settle inside `act`. */
const settle = () => act(async () => {})

describe('useForeignObjects — a refresh never puts a card back to its skeleton (PER-6)', () => {
  it('keeps the resolved cards on screen while a refresh is in flight', async () => {
    resolveForeign.mockImplementation(async (r) => card(r, 'first'))
    const seen: unknown[] = []
    const { result } = renderHook(() => {
      const objects = useForeignObjects(['nostr:a', 'nostr:b'])
      seen.push(objects)
      return objects
    })
    await settle()
    expect(result.current?.map((o) => (o as unknown as { title: string }).title)).toEqual(['first', 'first'])

    // The refresh hangs, so anything drawn meanwhile is what the tick left behind.
    let answer!: () => void
    resolveForeign.mockImplementation((r) => new Promise((done) => (answer = () => done(card(r, 'second')))))
    seen.length = 0
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_MS)
    })
    expect(resolveForeign).toHaveBeenCalledTimes(4)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen).not.toContain(undefined)

    await act(async () => answer())
    expect(seen).not.toContain(undefined)
  })

  it('keeps a card whose refresh throws, and draws a first-read throw as nothing', async () => {
    resolveForeign.mockImplementation(async (r) => {
      if (r === 'nostr:b') throw new Error('refused')
      return card(r, 'held')
    })
    const { result } = renderHook(() => useForeignObjects(['nostr:a', 'nostr:b']))
    await settle()
    expect(result.current?.[1]).toBeNull()

    resolveForeign.mockImplementation(async () => {
      throw new Error('rate-limited')
    })
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_MS)
    })
    await settle()
    expect((result.current?.[0] as unknown as { title: string }).title).toBe('held')
    expect(result.current?.[1]).toBeNull()
  })

  it('does blank when the references themselves change — what is held is somebody else’s', async () => {
    resolveForeign.mockImplementation(async (r) => card(r, r))
    const { result, rerender } = renderHook(({ refs }) => useForeignObjects(refs), {
      initialProps: { refs: ['nostr:a'] },
    })
    await settle()
    expect(result.current).toHaveLength(1)

    resolveForeign.mockImplementation(() => new Promise(() => {}))
    rerender({ refs: ['nostr:c'] })
    expect(result.current).toBeUndefined()
  })
})
