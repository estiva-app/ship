// @vitest-environment jsdom
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

describe('a cold load with an expired token and a refresh token (AUT-4)', () => {
  const tokenCalls = (answer: { status: number; body: unknown } | 'hang') =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      answer === 'hang'
        ? new Promise<Response>(() => {})
        : ({ ok: answer.status < 300, status: answer.status, json: async () => answer.body } as Response)) as typeof fetch)
  const expiredWithRefresh = () => validSession({ expiresAt: Date.now() - 1_000, refreshToken: 'rt-1' })

  it('renews in place and enters on the page asked for, with no trip to Estiva ID', async () => {
    expiredWithRefresh()
    window.history.replaceState({}, '', '/issue/abc#block-b1')
    const fetchSpy = tokenCalls({
      status: 200,
      body: { access_token: 'at-2', expires_in: 3600, refresh_token: 'rt-2', pubkey: 'b3'.repeat(32) },
    })
    const { bootAuth } = await freshBootWithNav()
    expect(await bootAuth()).toEqual({ kind: 'app' })
    expect(navigated).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://id.estiva.app/token')
    expect(JSON.parse(localStorage.getItem('ship.estiva-id.token')!).accessToken).toBe('at-2')
    expect(window.location.pathname + window.location.hash).toBe('/issue/abc#block-b1')
  })

  it('asks for the passkey on this page when Estiva ID refuses the renewal, without a silent trip', async () => {
    expiredWithRefresh()
    window.history.replaceState({}, '', '/issue/abc')
    tokenCalls({ status: 400, body: { error: 'invalid_grant' } })
    const { bootAuth } = await freshBootWithNav()
    expect(await bootAuth()).toEqual({ kind: 'shell', state: { phase: 'authenticating', reason: 'session_expired' } })
    expect(navigated).toEqual([])
    expect(window.location.pathname).toBe('/issue/abc')
  })

  it('enters on the held token when Estiva ID does not answer, rather than holding a blank page', async () => {
    vi.useFakeTimers()
    try {
      expiredWithRefresh()
      tokenCalls('hang')
      const { bootAuth, RENEWAL_WAIT_MS } = await freshBootWithNav()
      const boot = bootAuth()
      await vi.advanceTimersByTimeAsync(RENEWAL_WAIT_MS)
      expect(await boot).toEqual({ kind: 'app' })
      expect(navigated).toEqual([])
    } finally {
      vi.useRealTimers()
    }
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

  it('carries the path route, and a block link’s fragment with it', async () => {
    /*
      This asserted `returnTo === '#/p/abc'` until the redirect-URI fix, which is
      what REW-2 built and REW-3/4/5 invalidated by moving `web/` to real paths.
      Then it asserted the fragment was dropped. It need not be: the browser drops
      it at the navigation to `/authorize`, but `returnTo` waits in this tab's
      storage, not in that URL — and a block link (RIC-18) is the page plus
      `#block-<id>`, which must land on the block after signing in.
    */
    window.history.replaceState({}, '', '/p/abc#block-b1')
    const { bootAuth } = await freshBootWithNav()
    await bootAuth()
    const url = new URL(navigated[0])
    // Exact-string compared upstream, and fixed rather than the current path.
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/`)
    expect(sessionStorage.getItem('ship.estiva-id.returnTo')).toBe('/p/abc#block-b1')
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
    // `authenticating`: the button is "Continue with passkey", as Peek's, not "Try again" (AUT-4).
    if (result.kind === 'shell') expect(result.state).toEqual({ phase: 'authenticating', reason: 'no_session' })
    expect(navigated).toEqual([])
  })

  it('puts the person back on the link they opened, block and all, so trying again starts from it (c13b0096)', async () => {
    // Production, 5 October: a block link opened signed out came back on `/?error=login_required`, and "Try again"
    // started from there — signing in landed on the home page.
    window.history.replaceState({}, '', '/project/abc#block-b1')
    const { bootAuth: probe } = await freshBootWithNav()
    expect((await probe()).kind).toBe('leaving')
    setLocation('?error=login_required&state=s')
    const { bootAuth } = await freshBootWithNav()
    expect((await bootAuth()).kind).toBe('shell')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/project/abc#block-b1')
  })

  it('stays on the root when the refusal carries no stashed link', async () => {
    sessionStorage.setItem('estiva.authShell.silentAttempt', String(Date.now()))
    setLocation('?error=login_required')
    const { bootAuth } = await freshBootWithNav()
    expect((await bootAuth()).kind).toBe('shell')
    expect(window.location.pathname + window.location.search).toBe('/')
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
    sessionStorage.setItem('ship.estiva-id.returnTo', '/project/abc')

    reply({ access_token: 'at', pubkey: 'b3'.repeat(32), expires_in: 3600 })
    setLocation(`?code=abc&state=${state}`)
    const result = await (await freshBootWithNav()).bootAuth()

    expect(result).toEqual({ kind: 'app' })
    // The token has to be in storage BEFORE `api/store.ts` evaluates, which is
    // why `main.tsx` imports App dynamically after this resolves. If it were a
    // static import, the app would come up anonymous immediately after a
    // successful sign-in — and everything would render.
    expect(localStorage.getItem('ship.estiva-id.token')).toBeTruthy()
    // A path, not a fragment. `web/` routes on `location.pathname`, and this
    // asserted a hash until the redirect-URI fix — the last place the REW-2-era
    // premise was still written down as an expectation.
    expect(window.location.pathname).toBe('/project/abc')
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

/*
  The lockout, as tests.

  Reported from production: a token expiring on a project page sent the person
  to `/authorize` with `redirect_uri=https://ship.estiva.app/project/<slug>`,
  which Estiva ID refuses with `400 bad_request: That redirect_uri is not
  registered for this app`. That is a JSON error page on the identity origin,
  with no route back into the app — so it is a lockout rather than a bad
  experience.

  Measured against production the same day, with `prompt=none`: only
  `https://ship.estiva.app/` is registered. Not the origin without its trailing
  slash, not `/auth/callback`, not `/projects`.
*/
describe('the redirect URI is fixed, wherever the person happens to be', () => {
  const authorizeParam = (url: string, name: string) => new URL(url).searchParams.get(name)

  it('sends the origin root from a deep page, not the current path', async () => {
    // The exact shape that locked somebody out.
    setLocation('', '')
    window.history.replaceState({}, '', '/project/rich-text-and-blocks-254a0dee')

    const boot = await freshBootWithNav()
    await boot.bootAuth()

    expect(navigated).toHaveLength(1)
    expect(authorizeParam(navigated[0], 'redirect_uri')).toBe(`${ORIGIN}/`)
  })

  it('sends the same URI from the root, so one registered entry covers both', async () => {
    setLocation('')
    const boot = await freshBootWithNav()
    await boot.bootAuth()
    expect(authorizeParam(navigated[0], 'redirect_uri')).toBe(`${ORIGIN}/`)
  })

  it('carries the deep route in returnTo instead of losing it', async () => {
    /*
      The other half of the same stale premise. `returnTo` was
      `location.hash || '#/'`, which under path routing is the constant `'#/'` —
      so every sign-in came back to the root however deep a link somebody had
      opened, which is the thing PEEK-123 exists about.
    */
    window.history.replaceState({}, '', '/issue/abc?filter=open')
    const boot = await freshBootWithNav()
    await boot.bootAuth()

    expect(sessionStorage.getItem('ship.estiva-id.returnTo')).toBe('/issue/abc?filter=open')
  })

  it('refuses a returnTo that is not a path on this origin', async () => {
    // Read back from storage this tab wrote, which is not the same as trusted:
    // `//evil.example` is protocol-relative and `replaceState` would take it.
    setLocation('')
    const id = await import('./estivaId')
    id.restoreRoute('//evil.example/x')
    expect(window.location.pathname).toBe('/')
    id.restoreRoute('https://evil.example/x')
    expect(window.location.pathname).toBe('/')
  })

  it('does not overwrite a route something else already applied', async () => {
    window.history.replaceState({}, '', '/issues')
    const id = await import('./estivaId')
    id.restoreRoute('/project/abc')
    expect(window.location.pathname).toBe('/issues')
  })
})

/*
  MUST STAY LAST. `vi.doMock` below is not undone by `vi.restoreAllMocks()`, so
  once this block has run every later test sees `ID_CONFIG: null` — which makes
  `signInAvailable` false, `bootAuth` return `{ kind: 'app' }` without deciding
  anything, and every navigation assertion in the file silently observe nothing.
  Cost an hour on the redirect-URI fix, whose new tests were appended after it.
*/
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
