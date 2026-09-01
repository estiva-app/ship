import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MergedReadState } from './readState'

/**
 * A slot is this installation's account of what *it* read.
 *
 * Found by the CRO-8 cross-app verification rather than by review: Ship's slot
 * came back holding 53 contexts against Peek's 47, because it hydrated from the
 * merge and republished everything Peek had read as its own. The max rule makes
 * that lossless, which is exactly why nothing failed and why it needed looking
 * at the numbers to notice.
 */
const fetchMergedReadState = vi.fn<() => Promise<MergedReadState>>()
/** Typed loosely on purpose: the assertion is about argument 4, the blob. */
const publishReadState = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))

vi.mock('./store', () => ({
  relay: {},
  signer: { pubkey: 'me', sign: async (e: unknown) => e },
}))
vi.mock('./nip44', () => ({ nip44: { encrypt: async (p: string) => p, decrypt: async () => undefined } }))
const signedIn = vi.fn(() => true)
vi.mock('../auth/estivaId', () => ({ signedIn: () => signedIn() }))
vi.mock('./readState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./readState')>()),
  fetchMergedReadState: (...a: unknown[]) => fetchMergedReadState(...(a as [])),
  publishReadState: (...a: unknown[]) => publishReadState(...(a as [])),
}))

const OURS = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const THEIRS = 'c8d2f1b5-3a4e-4b97-8d26-9e1f7a3b5c02'
const NEW = 'd9e3a2c6-4b5f-4ca8-9e37-af2068c4d613'

describe('the slot holds what THIS installation read', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
  })

  it("does not absorb another installation's contexts into our slot", async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({
      reachable: true,
      // The merge holds both; our own slot holds only ours.
      merged: { [OURS]: 1000, [THEIRS]: 5000 },
      own: { v: 1, client_id: 'ship-a', contexts: { [OURS]: 1000 } },
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).toHaveBeenCalledTimes(1)
    const contexts = publishReadState.mock.calls[0][4] as unknown as Record<string, number>
    expect(contexts[OURS]).toBe(1000)
    expect(contexts[NEW]).toBe(2000)
    // The whole point: Peek's marker stays in Peek's slot. It is still in the
    // merge, so nothing is lost — it is simply not ours to republish.
    expect(contexts).not.toHaveProperty(THEIRS)
  })

  it('still publishes the whole of OUR slot, not a delta', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({
      reachable: true,
      merged: { [OURS]: 1000 },
      own: { v: 1, client_id: 'ship-a', contexts: { [OURS]: 1000 } },
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    const contexts = publishReadState.mock.calls[0][4] as unknown as Record<string, number>
    // A replaceable coordinate: omitting the old marker would drop it.
    expect(Object.keys(contexts).sort()).toEqual([NEW, OURS].sort())
  })

  it('refuses to publish while the relay could not be asked', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({ reachable: false, merged: {} })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).not.toHaveBeenCalled()
  })
})

describe('an unreadable own slot blocks the publish', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
  })

  /**
   * The loss this prevents: our slot is on the relay, `/nip44/decrypt` 429s, and
   * publishing would replace it with only this session's markers. Permanently —
   * the merge is a maximum, but a context that is gone from every slot is gone.
   */
  it('refuses to publish when our own slot is present but undecryptable', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({
      reachable: true,
      merged: { [OURS]: 1000 },
      own: undefined,
      ownUndecryptable: true,
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).not.toHaveBeenCalled()
  })

  it('still publishes on a genuinely empty coordinate', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({
      reachable: true,
      merged: {},
      own: undefined,
      ownUndecryptable: false,
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).toHaveBeenCalledTimes(1)
  })
})

describe('a marker is never stranded by a transient failure', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
  })
  afterEach(() => vi.useRealTimers())

  /**
   * An access token expiring mid-session is ordinary — the signer renews itself.
   * Before this, the flush returned, the debounce timer had already fired, and
   * the marker sat in `pending` until the next read or a tab switch. Observed
   * live: reading an issue in Ship simply never reached the relay.
   */
  it('retries after the session is unusable, and publishes once it is back', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchMergedReadState.mockResolvedValue({ reachable: true, merged: {}, own: undefined })
    signedIn.mockReturnValue(false)

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(publishReadState).not.toHaveBeenCalled()

    signedIn.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(publishReadState).toHaveBeenCalledTimes(1)
  })

  it('retries when our own slot could not be decrypted', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    signedIn.mockReturnValue(true)
    fetchMergedReadState.mockResolvedValue({
      reachable: true, merged: {}, own: undefined, ownUndecryptable: true,
    })

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(publishReadState).not.toHaveBeenCalled()

    fetchMergedReadState.mockResolvedValue({ reachable: true, merged: {}, own: undefined })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(publishReadState).toHaveBeenCalledTimes(1)
  })

  it('backs off rather than busy-looping while it keeps failing', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    signedIn.mockReturnValue(false)
    markRead([NEW], 2_000_000)
    await flushReadState()

    // First retry at the debounce interval, the next at twice that — so a long
    // outage costs a handful of checks rather than one every three seconds.
    await vi.advanceTimersByTimeAsync(3_100)
    const afterFirst = signedIn.mock.calls.length
    await vi.advanceTimersByTimeAsync(3_100)
    expect(signedIn.mock.calls.length).toBe(afterFirst)
    await vi.advanceTimersByTimeAsync(3_100)
    expect(signedIn.mock.calls.length).toBeGreaterThan(afterFirst)
  })
})
