// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FetchedReadState } from '@estiva-app/conversation'

/**
 * A slot is this installation's account of what *it* read.
 *
 * Found by the CRO-8 cross-app verification rather than by review: Ship's slot
 * came back holding 53 contexts against Peek's 47, because it hydrated from the
 * merge and republished everything Peek had read as its own. The max rule makes
 * that lossless, which is exactly why nothing failed and why it needed looking
 * at the numbers to notice.
 */
const fetchReadState = vi.fn<() => Promise<Pick<FetchedReadState, 'reachable' | 'merged'> & Partial<FetchedReadState>>>()
/** Typed loosely on purpose: the assertion is about argument 4, the blob. */
const publishReadState = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))

vi.mock('./store', () => ({
  relay: {},
  signer: { pubkey: 'me', sign: async (e: unknown) => e },
}))
vi.mock('./nip44', () => ({ nip44: { encrypt: async (p: string) => p, decrypt: async () => undefined } }))
const signedIn = vi.fn(() => true)
vi.mock('../auth/estivaId', () => ({ signedIn: () => signedIn() }))
vi.mock('@estiva-app/conversation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@estiva-app/conversation')>()),
  fetchReadState: (...a: unknown[]) => fetchReadState(...(a as [])),
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
    fetchReadState.mockResolvedValue({
      reachable: true,
      // The merge holds both; our own slot holds only ours.
      merged: { [OURS]: 1000, [THEIRS]: 5000 },
      own: { v: 1, client_id: 'ship-a', contexts: { [OURS]: 1000 } },
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).toHaveBeenCalledTimes(1)
    const contexts = publishReadState.mock.calls[0][3] as unknown as Record<string, number>
    expect(contexts[OURS]).toBe(1000)
    expect(contexts[NEW]).toBe(2000)
    // The whole point: Peek's marker stays in Peek's slot. It is still in the
    // merge, so nothing is lost — it is simply not ours to republish.
    expect(contexts).not.toHaveProperty(THEIRS)
  })

  it('still publishes the whole of OUR slot, not a delta', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({
      reachable: true,
      merged: { [OURS]: 1000 },
      own: { v: 1, client_id: 'ship-a', contexts: { [OURS]: 1000 } },
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    const contexts = publishReadState.mock.calls[0][3] as unknown as Record<string, number>
    // A replaceable coordinate: omitting the old marker would drop it.
    expect(Object.keys(contexts).sort()).toEqual([NEW, OURS].sort())
  })

  it('refuses to publish while the relay could not be asked', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({ reachable: false, merged: {} })

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
    fetchReadState.mockResolvedValue({
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
    fetchReadState.mockResolvedValue({
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
    fetchReadState.mockResolvedValue({ reachable: true, merged: {}, own: undefined })
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
    fetchReadState.mockResolvedValue({
      reachable: true, merged: {}, own: undefined, ownUndecryptable: true,
    })

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(publishReadState).not.toHaveBeenCalled()

    fetchReadState.mockResolvedValue({ reachable: true, merged: {}, own: undefined })
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

describe('the diagnostic reports why a publish did not happen', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
    signedIn.mockReturnValue(true)
  })

  const diag = () => (window as unknown as { __readState: () => Record<string, unknown> }).__readState()

  /**
   * The whole reason this exists: `pending` non-empty with a named reason is the
   * one thing no external probe can see, and it is exactly what four hand-driven
   * production passes needed and could not get.
   */
  it('names a stranded marker and the reason it is stranded', async () => {
    const { installReadStateDiagnostic, markRead, flushReadState } = await import('./readStateSync')
    installReadStateDiagnostic()
    signedIn.mockReturnValue(false)

    markRead([NEW], 2_000_000)
    await flushReadState()

    const d = diag()
    expect(Object.keys(d.pending as object)).toEqual([NEW])
    expect((d.lastAttempt as { outcome: string }).outcome).toBe('no-session')
    expect(d.retryInS).toBeGreaterThan(0)
  })

  it('reports a successful publish, with pending emptied', async () => {
    const { installReadStateDiagnostic, markRead, flushReadState } = await import('./readStateSync')
    installReadStateDiagnostic()
    fetchReadState.mockResolvedValue({ reachable: true, merged: {}, own: undefined })

    markRead([NEW], 2_000_000)
    await flushReadState()

    const d = diag()
    expect((d.lastAttempt as { outcome: string }).outcome).toBe('published')
    expect(d.pending).toEqual({})
  })

  it('distinguishes an undecryptable own slot from an empty one', async () => {
    const { installReadStateDiagnostic, markRead, flushReadState } = await import('./readStateSync')
    installReadStateDiagnostic()
    fetchReadState.mockResolvedValue({
      reachable: true, merged: {}, own: undefined, ownUndecryptable: true,
    })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect((diag().lastAttempt as { outcome: string }).outcome).toBe('not-hydrated')
  })
})

describe("Ship's slot is the one it already had (CON-19)", () => {
  const SLOT = 'a'.repeat(32)

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
    signedIn.mockReturnValue(true)
  })

  it('keeps a slot stored under ship.readstate.slot, client id and all', async () => {
    const { loadSlotIdentity } = await import('./readStateSync')
    localStorage.setItem('ship.readstate.slot', JSON.stringify({ slotId: SLOT, clientId: 'ship-1a2b3c4d' }))
    expect(loadSlotIdentity()).toEqual({ slotId: SLOT, clientId: 'ship-1a2b3c4d' })
  })

  it('mints a new one as ship-<8 hex> under the same key, and reuses it', async () => {
    const { loadSlotIdentity } = await import('./readStateSync')
    const first = loadSlotIdentity()
    expect(first.slotId).toMatch(/^[0-9a-f]{32}$/)
    expect(first.clientId).toMatch(/^ship-[0-9a-f]{8}$/)
    expect(JSON.parse(localStorage.getItem('ship.readstate.slot') ?? '{}')).toEqual(first)
    expect(loadSlotIdentity()).toEqual(first)
  })

  it("takes a new slot id rather than overwrite another installation's blob", async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    localStorage.setItem('ship.readstate.slot', JSON.stringify({ slotId: SLOT, clientId: 'ship-1a2b3c4d' }))
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [OURS]: 1000 }, own: undefined, ownUndecryptable: false, coordinateConflicted: true })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(publishReadState).toHaveBeenCalledTimes(1)
    const identity = publishReadState.mock.calls[0][2] as { slotId: string; clientId: string }
    expect(identity.slotId).not.toBe(SLOT)
    expect(identity.clientId).toBe('ship-1a2b3c4d')
    expect(JSON.parse(localStorage.getItem('ship.readstate.slot') ?? '{}').slotId).toBe(identity.slotId)
  })
})

describe('the reply floor survives hydration (CON-34)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
  })

  // `advanceContexts` refuses a floor among its updates, and hydration hands it
  // what this tab recorded as updates: a floor the cap raised before the first
  // publish was dropped there, and every reply under it lit up again.
  it('keeps a floor the cap raised before the first publish', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    const { MAX_CONTEXTS_BYTES, REPLY_FLOOR_CONTEXT, threadContext } = await import('@estiva-app/conversation')
    fetchReadState.mockResolvedValue({ reachable: true, merged: {}, own: { v: 1, client_id: 'ship-a', contexts: { [OURS]: 1000 } } })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A `thread:` entry costs 85 bytes, so this is a few dozen past the budget.
    const threads = Array.from({ length: Math.ceil(MAX_CONTEXTS_BYTES / 80) }, (_, i) => threadContext(i.toString(16).padStart(64, '0')))
    threads.forEach((context, i) => markRead([context], 1_700_000_000_000 + i * 1000))
    await flushReadState()

    const contexts = publishReadState.mock.calls[0][3] as unknown as Record<string, number>
    expect(contexts[REPLY_FLOOR_CONTEXT]).toBeGreaterThan(1000)
    expect(contexts[OURS]).toBe(1000)
  })
})
