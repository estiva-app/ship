import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  A project's History is read only while it is open (ALO-19; Miky,
  2026-11-10): opening the project reads no older change. The relay is
  stubbed at its query, and what is asserted is the filter that would go on
  the wire and when.
*/
const queryAll = vi.fn(async (_filters: Record<string, unknown>[]): Promise<SignedEvent[]> => [])
vi.mock('./store', () => ({ relay: { queryAll: (filters: Record<string, unknown>[]) => queryAll(filters) } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))

const { useFileChanges } = await import('./useFileChanges')

const FILE = `30850:${'e'.repeat(64)}:6bd072cb-6c30-4883-abb5-faf880d0c444`
const askedForEveryChange = () => queryAll.mock.calls.some(([filters]) => filters.some((f) => (f.kinds as number[]).includes(1851) && !('#p' in f)))

describe("a project's History", () => {
  it('reads no change while folded, every change once opened, and afresh on the next open', async () => {
    const change = { id: '1'.repeat(64), kind: 1851, pubkey: 'e'.repeat(64), created_at: 1, tags: [['a', FILE]], content: '', sig: '' } as SignedEvent
    queryAll.mockResolvedValue([change])
    const { result, rerender } = renderHook(({ open }) => useFileChanges(FILE, open), { initialProps: { open: false } })
    expect(result.current).toBeUndefined()
    expect(askedForEveryChange()).toBe(false)

    rerender({ open: true })
    await waitFor(() => expect(result.current).toEqual([change]))
    expect(queryAll).toHaveBeenCalledWith([{ kinds: [1851], '#a': [FILE] }])

    rerender({ open: false })
    expect(result.current).toBeUndefined()
    rerender({ open: true })
    await waitFor(() => expect(queryAll).toHaveBeenCalledTimes(2))
  })

  it('stops waiting when the read fails, and reads again after the page joins, leaves or adds', async () => {
    queryAll.mockClear()
    queryAll.mockRejectedValueOnce(new Error('429'))
    const { result, rerender } = renderHook(({ again }) => useFileChanges(FILE, true, again), { initialProps: { again: 0 } })
    await waitFor(() => expect(result.current).toBeNull())
    rerender({ again: 1 })
    await waitFor(() => expect(queryAll).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(Array.isArray(result.current)).toBe(true))
  })
})
