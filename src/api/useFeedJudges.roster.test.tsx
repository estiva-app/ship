import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  A page opened again draws its members pill at once (Katerina, 2026-10-08):
  the hook starts from the roster its last read of that file gave, and the
  read still runs. Each relay read here waits until the test answers it, so
  "at once" means before any answer for that visit.
*/
const pending: { filters: Record<string, unknown>[]; answer: (events: SignedEvent[]) => void }[] = []
vi.mock('./store', () => ({
  relay: { queryAll: (filters: Record<string, unknown>[]) => new Promise<SignedEvent[]>((answer) => pending.push({ filters, answer })) },
  signer: { pubkey: 'c'.repeat(64) },
}))
vi.mock('./nip44', () => ({ nip44: { decrypt: async () => undefined } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))
vi.mock('@/lib/useRefresh', () => ({ useRefresh: () => {} }))

const { useFeedJudges, resetFeedFactsForTests } = await import('./useFeedJudges')

const OWNER_A = 'a'.repeat(64)
const OWNER_B = 'b'.repeat(64)
const A = { addr: `30851:${OWNER_A}:project-a`, createdAt: 1000 }
const B = { addr: `30851:${OWNER_B}:project-b`, createdAt: 1000 }

/** Answers the oldest read still waiting, with no events: the file's owner is its one member. */
async function answer() {
  await act(async () => {
    pending.shift()?.answer([])
  })
}

beforeEach(() => {
  resetFeedFactsForTests()
  pending.length = 0
})

describe("a file's members, remembered for this tab", () => {
  it('has none for a file never read, until its read answers', async () => {
    const { result } = renderHook(() => useFeedJudges(A, undefined))
    expect(result.current.members).toBeUndefined()
    await answer()
    expect([...(result.current.members?.keys() ?? [])]).toEqual([OWNER_A])
  })

  it('draws a file read before at once on the way back, and reads it again', async () => {
    const { result, rerender } = renderHook(({ file }) => useFeedJudges(file, undefined), { initialProps: { file: A } })
    await answer()

    rerender({ file: B })
    expect(result.current.members).toBeUndefined()
    await answer()
    expect([...(result.current.members?.keys() ?? [])]).toEqual([OWNER_B])

    rerender({ file: A })
    // Before A's new read has answered: what the last one said.
    expect(pending).toHaveLength(1)
    expect([...(result.current.members?.keys() ?? [])]).toEqual([OWNER_A])
  })

  it('remembers the file it left even when its read answers after the page moved on', async () => {
    const { result, rerender } = renderHook(({ file }) => useFeedJudges(file, undefined), { initialProps: { file: A } })
    rerender({ file: B })
    // A's read answers while B is on screen: B is not given A's members.
    await answer()
    expect(result.current.members).toBeUndefined()

    rerender({ file: A })
    expect([...(result.current.members?.keys() ?? [])]).toEqual([OWNER_A])
  })
})
