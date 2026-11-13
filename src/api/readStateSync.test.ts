// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { FetchedReadState } from '@estiva-app/conversation'

/*
 * Ship's read state through the package's one queue (TOPIC-3). The queue's own
 * contract — the whole blob, the read-back before every write, a new slot over
 * another installation's blob, the reply floor — is the package's
 * `readStateQueue.test.ts`. What is Ship's own is tested here, at the wire: the
 * 30078 that reaches a fake relay, in the slot Ship already had.
 */

/** A relay holding 30078s by coordinate, as the real one does. */
const wire = vi.hoisted(() => {
  const events = new Map<string, { kind: number; pubkey: string; created_at: number; tags: string[][]; content: string }>()
  const dOf = (e: { tags: string[][] }) => e.tags.find((t) => t[0] === 'd')?.[1] ?? ''
  return {
    events,
    publishes: 0,
    dOf,
    /** The blob at a `d` tag, decrypted the way the fake NIP-44 below encrypts. */
    blob(d: string) {
      const e = events.get(d)
      return e ? (JSON.parse(e.content.slice(4)) as { client_id: string; contexts: Record<string, number> }) : undefined
    },
  }
})

/** The merged frontier the read half is handed: the screen's tests set it. */
const fetchReadState = vi.fn<() => Promise<Pick<FetchedReadState, 'reachable' | 'merged'> & Partial<FetchedReadState>>>()

/** Our own slot read back. A 429 throws here, as `nip44UnlessRefused` does. */
const decryptUnlessRefused = vi.fn(async (ciphertext: string): Promise<string | undefined> => (ciphertext.startsWith('enc:') ? ciphertext.slice(4) : undefined))

vi.mock('./store', () => ({
  relay: {
    query: async (filters: { authors: string[]; '#d': string[] }[]) =>
      [...wire.events.values()].filter((e) => filters[0].authors.includes(e.pubkey) && filters[0]['#d'].includes(wire.dOf(e))),
    publish: async (event: { tags: string[][]; kind: number; pubkey: string; created_at: number; content: string }) => {
      wire.publishes++
      wire.events.set(wire.dOf(event), event)
      return { ok: true }
    },
  },
  signer: { pubkey: 'me', sign: async (e: object) => ({ ...e, id: '0'.repeat(64), sig: '' }) },
}))
vi.mock('./nip44', () => ({
  // The plain decrypt answers `undefined` on a 429: the queue must never be handed it.
  nip44: { encrypt: async (p: string) => `enc:${p}`, decrypt: async () => undefined },
  nip44UnlessRefused: { decrypt: (ciphertext: string) => decryptUnlessRefused(ciphertext) },
}))
const signedIn = vi.fn(() => true)
vi.mock('../auth/estivaId', () => ({ signedIn: () => signedIn() }))
vi.mock('@estiva-app/conversation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@estiva-app/conversation')>()),
  fetchReadState: (...a: unknown[]) => fetchReadState(...(a as [])),
}))

const OURS = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const THEIRS = 'c8d2f1b5-3a4e-4b97-8d26-9e1f7a3b5c02'
const NEW = 'd9e3a2c6-4b5f-4ca8-9e37-af2068c4d613'
const SLOT = 'a'.repeat(32)
const OUR_D = `read-state:${SLOT}`

async function fresh() {
  vi.clearAllMocks()
  wire.events.clear()
  wire.publishes = 0
  localStorage.clear()
  localStorage.setItem('ship.readstate.slot', JSON.stringify({ slotId: SLOT, clientId: 'ship-1a2b3c4d' }))
  signedIn.mockReturnValue(true)
  const { resetReadStateForTests } = await import('./readStateSync')
  resetReadStateForTests()
}

function put(d: string, clientId: string, contexts: Record<string, number>) {
  wire.events.set(d, { kind: 30078, pubkey: 'me', created_at: 1, tags: [['d', d]], content: `enc:${JSON.stringify({ v: 1, client_id: clientId, contexts })}` })
}

describe("Ship writes the slot it already had (CON-19), and only what it read", () => {
  beforeEach(fresh)

  it('publishes into ship.readstate.slot, under its client id, keeping what that slot held', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    put(OUR_D, 'ship-1a2b3c4d', { [OURS]: 1000 })

    markRead([NEW], 2_000_000)
    await flushReadState()

    expect(wire.blob(OUR_D)).toEqual({ v: 1, client_id: 'ship-1a2b3c4d', contexts: { [OURS]: 1000, [NEW]: 2000 } })
  })

  it('mints a new slot as ship-<8 hex> under the same key when it has none, and publishes there', async () => {
    const { markRead, flushReadState } = await import('./readStateSync')
    localStorage.clear()

    markRead([NEW], 2_000_000)
    await flushReadState()

    const stored = JSON.parse(localStorage.getItem('ship.readstate.slot') ?? '{}') as { slotId: string; clientId: string }
    expect(stored.clientId).toMatch(/^ship-[0-9a-f]{8}$/)
    expect(wire.blob(`read-state:${stored.slotId}`)?.client_id).toBe(stored.clientId)
  })
})

describe('a marker is never stranded, and never written over a slot it could not read', () => {
  beforeEach(fresh)
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('holds the publish while our slot answers 429, keeps the slot, and publishes once it decrypts', async () => {
    vi.useFakeTimers()
    const { markRead, flushReadState } = await import('./readStateSync')
    put(OUR_D, 'ship-1a2b3c4d', { [OURS]: 1000 })
    decryptUnlessRefused.mockRejectedValueOnce(new Error('POST /nip44/decrypt failed: 429'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(wire.publishes).toBe(0)
    // Not a new slot: a 429 is not a slot that will never decrypt.
    expect(JSON.parse(localStorage.getItem('ship.readstate.slot') ?? '{}').slotId).toBe(SLOT)

    await vi.advanceTimersByTimeAsync(3000)
    expect(wire.blob(OUR_D)?.contexts).toEqual({ [OURS]: 1000, [NEW]: 2000 })
  })

  // A status `nip44UnlessRefused` does not know (a 400 or 404 while Estiva ID deploys) answers "will never decrypt".
  it('keeps its slot when it answers "will never decrypt", rather than leaving what it held behind', async () => {
    vi.useFakeTimers()
    const { markRead, flushReadState } = await import('./readStateSync')
    put(OUR_D, 'ship-1a2b3c4d', { [OURS]: 1000 })
    decryptUnlessRefused.mockResolvedValueOnce(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(wire.publishes).toBe(0)
    expect(JSON.parse(localStorage.getItem('ship.readstate.slot') ?? '{}').slotId).toBe(SLOT)

    await vi.advanceTimersByTimeAsync(3000)
    expect(wire.blob(OUR_D)?.contexts).toEqual({ [OURS]: 1000, [NEW]: 2000 })
  })

  it('waits while the session is renewing, and publishes once it is back', async () => {
    vi.useFakeTimers()
    const { markRead, flushReadState } = await import('./readStateSync')
    signedIn.mockReturnValue(false)

    markRead([NEW], 2_000_000)
    await flushReadState()
    expect(wire.publishes).toBe(0)

    signedIn.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(wire.blob(OUR_D)?.contexts).toEqual({ [NEW]: 2000 })
  })
})

describe('the diagnostic reports why a publish did not happen', () => {
  beforeEach(fresh)

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

    markRead([NEW], 2_000_000)
    await flushReadState()

    const d = diag()
    expect((d.lastAttempt as { outcome: string }).outcome).toBe('published')
    expect(d.pending).toEqual({})
  })
})

// Katerina, 2026-10-05: "new replies won't leave after reading". On production the
// count stayed 28 s with the thread open, then a re-read relit the divider.
describe('what the screen judges against only moves forward (SHI-38)', () => {
  beforeEach(fresh)

  it('shows a mark at once, before any publish or re-read', async () => {
    const { markRead, useMergedReadState } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [THEIRS]: 5000 }, own: undefined })
    const { result } = renderHook(() => useMergedReadState())
    await waitFor(() => expect(result.current[THEIRS]).toBe(5000))

    act(() => markRead([NEW], 7_000_000))
    expect(result.current[NEW]).toBe(7000)
    expect(wire.publishes).toBe(0)
  })

  it('keeps a marker that a later fetch is missing', async () => {
    const { useMergedReadState } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [OURS]: 1000, [THEIRS]: 5000 }, own: undefined })
    const first = renderHook(() => useMergedReadState())
    await waitFor(() => expect(first.result.current[OURS]).toBe(1000))
    first.unmount()

    // Our slot would not decrypt this time (a 429 on /nip44/decrypt): the merge lacks it.
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [THEIRS]: 6000 }, own: undefined, ownUndecryptable: true })
    const second = renderHook(() => useMergedReadState())
    await waitFor(() => expect(second.result.current[THEIRS]).toBe(6000))
    expect(second.result.current[OURS]).toBe(1000)
  })
})

// 99557309: the divider was judged against the page's own marks, so it went
// about a second after it was drawn; and before the first fetch, every thread
// since the join was new.
describe('the frontier a visit opened on stays put (99557309)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetReadStateForTests } = await import('./readStateSync')
    resetReadStateForTests()
  })

  const page = async () => {
    const { useMergedReadState, useOpeningReadState } = await import('./readStateSync')
    return ({ visit }: { visit: string | undefined }) => ({ merged: useMergedReadState(), opening: useOpeningReadState(visit) })
  }

  it('is undefined until the first fetch lands, not empty', async () => {
    let land: (value: { reachable: true; merged: Record<string, number> }) => void = () => {}
    fetchReadState.mockReturnValue(new Promise((resolve) => (land = resolve)))
    const { result } = renderHook(await page(), { initialProps: { visit: 'issue' } })
    expect(result.current.opening).toBeUndefined()

    await act(async () => land({ reachable: true, merged: { [THEIRS]: 5000 } }))
    expect(result.current.opening).toEqual({ [THEIRS]: 5000 })
  })

  it("leaves out the visit's own marks, while the live frontier takes them at once", async () => {
    const { markRead } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [THEIRS]: 5000 }, own: undefined })
    const { result } = renderHook(await page(), { initialProps: { visit: 'issue' } })
    await waitFor(() => expect(result.current.opening).toEqual({ [THEIRS]: 5000 }))

    act(() => markRead([THEIRS], 7_000_000))
    expect(result.current.merged[THEIRS]).toBe(7000)
    expect(result.current.opening).toEqual({ [THEIRS]: 5000 })
  })

  it('leaves out a mark made before the first fetch landed, and keeps one made before the visit', async () => {
    const { markRead } = await import('./readStateSync')
    act(() => markRead([OURS], 3_000_000))
    let land: (value: { reachable: true; merged: Record<string, number> }) => void = () => {}
    fetchReadState.mockReturnValue(new Promise((resolve) => (land = resolve)))
    const { result } = renderHook(await page(), { initialProps: { visit: 'issue' } })

    // The dwell fires before a slow first fetch (7.7 s on production, 7 Oct).
    act(() => markRead([THEIRS], 7_000_000))
    await act(async () => land({ reachable: true, merged: { [THEIRS]: 5000 } }))
    expect(result.current.opening).toEqual({ [THEIRS]: 5000, [OURS]: 3000 })
  })

  it('opens on a whole frontier only: not on a fetch whose decrypts were refused', async () => {
    const { useMergedReadState } = await import('./readStateSync')
    // The package asks the seam, which a 429 makes throw; it keeps going without the slot.
    fetchReadState.mockImplementationOnce((async (_query: unknown, _pubkey: unknown, nip44: { decrypt: (c: string) => Promise<unknown> }) => {
      await nip44.decrypt('slot').catch(() => undefined)
      return { reachable: true, merged: { [THEIRS]: 5000 }, own: undefined }
    }) as never)
    decryptUnlessRefused.mockRejectedValueOnce(new Error('429'))
    const { result } = renderHook(await page(), { initialProps: { visit: 'issue' } })
    await waitFor(() => expect(result.current.merged[THEIRS]).toBe(5000))
    expect(result.current.opening).toBeUndefined()

    // The next pass decrypts everything.
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [THEIRS]: 5000, [OURS]: 6000 }, own: undefined })
    renderHook(() => useMergedReadState())
    await waitFor(() => expect(result.current.opening).toEqual({ [THEIRS]: 5000, [OURS]: 6000 }))
  })

  it('takes a new frontier, marks and all, when the visit changes', async () => {
    const { markRead } = await import('./readStateSync')
    fetchReadState.mockResolvedValue({ reachable: true, merged: { [THEIRS]: 5000 }, own: undefined })
    const { result, rerender } = renderHook(await page(), { initialProps: { visit: 'issue' } })
    await waitFor(() => expect(result.current.opening).toBeDefined())
    act(() => markRead([THEIRS], 7_000_000))
    expect(result.current.opening?.[THEIRS]).toBe(5000)

    rerender({ visit: 'project' })
    expect(result.current.opening?.[THEIRS]).toBe(7000)
    rerender({ visit: 'issue' })
    expect(result.current.opening?.[THEIRS]).toBe(7000)
  })
})
