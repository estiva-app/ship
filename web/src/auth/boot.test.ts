/**
 * The boot decision's plumbing (REW-2).
 *
 * `decideBoot` itself is tested in `@estiva-app/identity`, alongside Peek, so
 * what is worth testing here is the I/O around it: that the observation handed to
 * it reflects the address bar and storage, and that each action becomes the right
 * thing on screen.
 *
 * Every failure below is silent. A boot that concludes "anonymous" after a
 * successful sign-in renders perfectly, answers whatever the relay lets an
 * anonymous reader see, and the only symptom is that you are not who you just
 * signed in as.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** jsdom's own origin — `replaceState` cannot cross one. */
const ORIGIN = window.location.origin

/** The config module is read at import time, so it is mocked before anything else. */
vi.mock('../config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELAY_URL: 'https://estiva.estiva.app',
  workspaceLabel: () => 'estiva.estiva.app',
}))

const setLocation = (search: string, hash = '') => {
  window.history.replaceState({}, '', `/${search}${hash}`)
}

/** Where the flow would have gone. jsdom implements no navigation. */
let navigated: string[] = []

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  setLocation('')
  navigated = []
  vi.restoreAllMocks()
})

/**
 * A fresh module graph with navigation captured.
 *
 * `setNavigate` has to be called on the *same* module instance `boot` imports,
 * so it is wired here rather than in `beforeEach` — `vi.resetModules()` between
 * tests would otherwise hand `boot` a different `estivaId` than the one the test
 * configured, and every navigation assertion would silently observe nothing.
 */
const freshBootWithNav = async () => {
  vi.resetModules()
  const id = await import('./estivaId')
  id.setNavigate((url) => navigated.push(url))
  return import('./boot')
}

afterEach(() => {
  vi.resetModules()
})

const validSession = (over: Record<string, unknown> = {}) =>
  localStorage.setItem(
    'ship.estiva-id.token',
    JSON.stringify({ accessToken: 'at', pubkey: 'b3'.repeat(32), expiresAt: Date.now() + 3_600_000, ...over }),
  )

describe('a cold load with a live session', () => {
  it('enters, without touching the identity service', async () => {
    validSession()
    const { bootAuth } = await freshBootWithNav()
    expect(await bootAuth()).toEqual({ kind: 'app' })
    expect(navigated).toEqual([])
  })

  it('does not enter on a token that expires within the minute of slack', async () => {
    // Ship reads a token as unusable a minute early: one that dies mid-request is
    // worse than one refreshed slightly early, and re-running the flow is silent.
    validSession({ expiresAt: Date.now() + 30_000 })
    const { bootAuth } = await freshBootWithNav()
    const result = await bootAuth()
    expect(result.kind).not.toBe('app')
  })
})

describe('a cold load with nothing', () => {
  it('probes silently and reports that the page is leaving', async () => {
    const { bootAuth } = await freshBootWithNav()
    expect(await bootAuth()).toEqual({ kind: 'leaving' })
    const url = new URL(navigated[0])
    // `prompt=none` is what makes it silent: a browser with no session comes
    // straight back with `error=login_required` rather than landing on a sign-in
    // page for a service the person is usually already signed into.
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('client_id')).toBe('estiva-ship')
  })

  it('carries the hash route, because a fragment cannot survive the redirect', async () => {
    setLocation('', '#/p/abc')
    const { bootAuth } = await freshBootWithNav()
    await bootAuth()
    // `redirect_uri` must match a registered entry exactly, so it carries no
    // fragment — the route rides in returnTo instead (PEEK-123).
    const url = new URL(navigated[0])
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/`)
    expect(sessionStorage.getItem('ship.estiva-id.returnTo')).toBe('#/p/abc')
  })

  it('marks the guard, so a second cold load does not probe again', async () => {
    const { bootAuth } = await freshBootWithNav()
    await bootAuth()
    expect(sessionStorage.getItem('estiva.authShell.silentAttempt')).toBeTruthy()

    // Second load, same tab, still nothing held: the guard is what turns this
    // into one attempt rather than a bounce.
    navigated = []
    const again = await (await freshBootWithNav()).bootAuth()
    expect(again.kind).toBe('shell')
    expect(navigated).toEqual([])
  })
})

describe('coming back from a silent probe with no session', () => {
  it('offers a passkey rather than looping', async () => {
    sessionStorage.setItem('estiva.authShell.silentAttempt', String(Date.now()))
    setLocation('?error=login_required')
    const { bootAuth } = await freshBootWithNav()
    const result = await bootAuth()
    expect(result.kind).toBe('shell')
    if (result.kind === 'shell') expect(result.state.phase).toBe('failed')
    expect(navigated).toEqual([])
  })
})

describe('coming back with a code', () => {
  const reply = (body: unknown, ok = true) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok,
      status: ok ? 200 : 400,
      json: async () => body,
    } as Response)

  it('redeems it, restores the route, and clears the query', async () => {
    setLocation('')
    const first = await freshBootWithNav()
    await first.bootAuth() // writes the verifier/state and stashes returnTo
    const state = sessionStorage.getItem('ship.estiva-id.state')!
    sessionStorage.setItem('ship.estiva-id.returnTo', '#/p/abc')

    reply({ access_token: 'at', pubkey: 'b3'.repeat(32), expires_in: 3600 })
    setLocation(`?code=abc&state=${state}`)
    const result = await (await freshBootWithNav()).bootAuth()

    expect(result).toEqual({ kind: 'app' })
    // The token has to be in storage BEFORE `api/store.ts` evaluates, which is
    // why `main.tsx` imports App dynamically after this resolves. If it were a
    // static import, the app would come up anonymous immediately after a
    // successful sign-in — and everything would render.
    expect(localStorage.getItem('ship.estiva-id.token')).toBeTruthy()
    expect(window.location.hash).toBe('#/p/abc')
    expect(window.location.search).toBe('')
  })

  it('shows an honest shell when the exchange is refused, and clears the spent code', async () => {
    setLocation('')
    await (await freshBootWithNav()).bootAuth()
    const state = sessionStorage.getItem('ship.estiva-id.state')!

    reply({}, false)
    setLocation(`?code=abc&state=${state}`)
    const result = await (await freshBootWithNav()).bootAuth()

    expect(result.kind).toBe('shell')
    if (result.kind === 'shell' && result.state.phase === 'failed') {
      expect(result.state.reason).toBe('exchange_failed')
    }
    // A spent code left in the address bar invites a reload that fails again for
    // a different reason, which is a worse error than the real one.
    expect(window.location.search).toBe('')
    expect(localStorage.getItem('ship.estiva-id.token')).toBeNull()
  })

  it('refuses a code whose state did not come from this tab, without asking /token', async () => {
    setLocation('')
    await (await freshBootWithNav()).bootAuth()
    const fetchSpy = reply({ access_token: 'at' })
    setLocation('?code=abc&state=somebody-elses')
    const result = await (await freshBootWithNav()).bootAuth()

    expect(result.kind).toBe('shell')
    // The shape of a login-CSRF, refused before the exchange rather than after.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('a build with no sign-in', () => {
  it('runs anonymous-only without deciding anything', async () => {
    vi.doMock('../config', () => ({
      ID_CONFIG: null,
      RELAY_URL: 'https://estiva.estiva.app',
      workspaceLabel: () => 'estiva.estiva.app',
    }))
    vi.resetModules()
    const { bootAuth } = await import('./boot')
    expect(await bootAuth()).toEqual({ kind: 'app' })
    expect(navigated).toEqual([])
    // An empty ID_BASE is a real mode, not a broken one. Local builds are this by
    // default, so a local build cannot reach production identity by accident.
    expect(sessionStorage.length).toBe(0)
  })
})
