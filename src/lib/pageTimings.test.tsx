// @vitest-environment jsdom
/**
 * Ship's page-open timings, read at the wire: the body that would leave the
 * browser for Estiva ID names the kind of screen and how it was opened, and
 * none of the text planted in a title or the page address. The timer's own
 * rules (quiet spell, hidden tabs, allowance) are `@estiva-app/platform`'s,
 * tested there; here, which navigations in Ship start one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The sign-in's own token handling is @estiva-app/identity's, tested there; here a signed-in QA-1.
vi.mock('@/config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELEASE: 'abc123',
}))
vi.mock('@/auth/estivaId', () => ({ currentToken: () => ({ accessToken: 'qa-1-token' }) }))

const PLANTED_TITLE = 'plantedtitle board offsite'
const PLANTED_SLUG = 'plantedslug-board-offsite'
const ISSUE = `/issue/${PLANTED_SLUG}-70a66624-a6d2-4ce9-968f-e5adc23e1ede`
const OTHER_ISSUE = `/issue/${PLANTED_SLUG}-two-9c69f247-be6a-4ae7-9703-71cb971f5f93`

let requests: Array<{ url: string; body: string }>
let stopTimings: () => void

/** MutationObserver callbacks and the token read are microtasks. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/** The page draws a loading placeholder in its main area, then the page itself. */
async function load(ms: number) {
  const main = document.createElement('main')
  main.innerHTML = '<div class="animate-pulse h-4"></div>'
  document.body.replaceChildren(main)
  await flush()
  vi.advanceTimersByTime(ms)
  main.innerHTML = `<h1>${PLANTED_TITLE}</h1>`
  await flush()
  vi.advanceTimersByTime(1000)
  await flush()
}

const bodies = () => requests.map((r) => JSON.parse(r.body))

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      requests.push({ url, body: init.body })
      return new Response(null, { status: 202 })
    }),
  )
  window.history.replaceState({}, '', ISSUE)
  document.body.replaceChildren()
  const { startPageTimings } = await import('./pageTimings')
  stopTimings = startPageTimings()
  // This load drew no placeholder: it goes out as such, and the test starts clean.
  vi.advanceTimersByTime(5000)
  await flush()
  requests = []
})

afterEach(() => {
  stopTimings()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Ship page-open timings', () => {
  it('times an issue opened by a click, named by kind of screen, with none of the planted text', async () => {
    const { navigateTo } = await import('@/router')
    navigateTo(OTHER_ISSUE)
    await load(700)
    expect(bodies()).toEqual([
      { release: 'abc123', screen: 'issue', how: 'in-app', waitMs: 700, ready: 'placeholder-gone' },
    ])
    expect(requests[0]?.url).toBe('https://id.estiva.app/timing')
    expect(requests[0]?.body).not.toMatch(/planted|offsite|9c69f247/)
  })

  it('times the Issues page opened through go()', async () => {
    const { go } = await import('@/router')
    go({ name: 'issues' })
    await load(300)
    expect(bodies().map((b) => [b.screen, b.how])).toEqual([['issues', 'in-app']])
  })

  it('starts no timing for a change of tab or filter on the same page, nor for a redirect', async () => {
    const { navigateTo, replace } = await import('@/router')
    navigateTo(`${ISSUE}?tab=activity`)
    await load(300)
    replace({ name: 'projects', tab: 'all' })
    await load(300)
    expect(requests).toEqual([])
  })

  it("times the browser's own back button", async () => {
    const { navigateTo } = await import('@/router')
    navigateTo(OTHER_ISSUE)
    await load(100)
    navigateTo('/projects')
    await load(100)
    requests = []
    // Back, as the browser does it: the address changes, then a popstate the app did not send.
    window.history.replaceState({}, '', OTHER_ISSUE)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await load(400)
    expect(bodies().map((b) => [b.screen, b.how, b.waitMs])).toEqual([['issue', 'in-app', 400]])
  })
})
