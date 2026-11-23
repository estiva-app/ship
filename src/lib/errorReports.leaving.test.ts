// @vitest-environment jsdom
/**
 * A page that is leaving reports no failure (SHI-68): its requests are cancelled as it goes, each one lands as "not
 * reached", and the "didn't load" it draws in its last moment is seen by nobody. Read at the wire: what would leave
 * the browser for Estiva ID.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELEASE: 'abc123',
}))
vi.mock('@/auth/estivaId', () => ({ currentToken: () => ({ accessToken: 'qa-1-token' }) }))

/** The reporter reads the token, then sends: a few turns of the microtask queue, no timer. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
let reports: string[]

beforeEach(() => {
  reports = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      if (String(url).endsWith('/report')) reports.push(init.body)
      return new Response(null, { status: 202 })
    }),
  )
  window.history.pushState({}, '', '/topics')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reports no “didn’t load” from a page that has started to leave, and reports again once the page is shown to have stayed', async () => {
  const { startErrorReports } = await import('./errorReports')
  const { reportFailureNow } = await import('./failureReports')
  const { heardFromId } = await import('./heardFailures')
  startErrorReports()

  // The page reloads: the browser says so, then cancels the signature a read was waiting for.
  window.dispatchEvent(new Event('beforeunload'))
  heardFromId(new TypeError('Failed to fetch'))
  reportFailureNow('not-loaded')
  await flush()
  expect(reports).toEqual([])

  // Brought back by Back, or it never left: a failure now is one a person sees.
  window.dispatchEvent(new Event('pageshow'))
  reportFailureNow('not-loaded')
  await flush()
  expect(reports.map((body) => JSON.parse(body).named)).toEqual(['not-loaded'])
})

it('reports again a while after a leave that never happened, when the browser does not say the page stayed', async () => {
  vi.useFakeTimers()
  try {
    const { startErrorReports } = await import('./errorReports')
    const { reportFailureNow } = await import('./failureReports')
    startErrorReports()

    // A link to a mail address: the browser says the page is leaving, and it stays.
    window.dispatchEvent(new Event('beforeunload'))
    reportFailureNow('not-loaded')
    await flush()
    expect(reports).toEqual([])

    vi.advanceTimersByTime(60_000)
    reportFailureNow('not-sent')
    await flush()
    expect(reports.map((body) => JSON.parse(body).named)).toEqual(['not-sent'])
  } finally {
    vi.useRealTimers()
  }
})
