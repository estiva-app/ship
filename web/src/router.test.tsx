import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { href, parse, useRoute } from './router'

const setHash = (hash: string) => {
  location.hash = hash
  // jsdom updates the hash synchronously but a route change is observed
  // through the event, so fire it the way the browser would.
  dispatchEvent(new HashChangeEvent('hashchange'))
}

afterEach(() => {
  setHash('')
})

describe('useRoute', () => {
  it('starts on the current hash and follows changes', () => {
    setHash('#/projects?archived')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'projects', archived: true })

    act(() => setHash('#/issue/30851%3Apk%3Ad'))
    expect(result.current).toEqual({ name: 'issue', addr: '30851:pk:d' })

    act(() => setHash('#/o/naddr1xyz'))
    expect(result.current).toEqual({ name: 'inbound', naddr: 'naddr1xyz' })
  })

  it('every route survives an href → parse round trip', () => {
    const routes = [
      { name: 'issues' },
      { name: 'projects', archived: false },
      { name: 'projects', archived: true },
      { name: 'project', addr: '30850:pk:d', view: 'table' },
      { name: 'project', addr: '30850:pk:d', view: 'board' },
      { name: 'issue', addr: '30851:pk:d' },
      { name: 'inbound', naddr: 'naddr1xyz' },
    ] as const
    for (const route of routes) expect(parse(href(route))).toEqual(route)
  })
})

/**
 * Moved here from `scripts/app.test.ts` in REW-9, with the router itself.
 *
 * That file imported `href` and `parse` from `apps/ship/router` and asserted
 * these five cases; deleting the old app would have deleted them, which is the
 * failure REW-9 names — coverage lost because the subject moved, not because
 * anyone decided the behaviour no longer mattered. The round trip above already
 * lived here; these did not.
 */
describe('parse, at the edges', () => {
  it('falls back to the issue list for anything unrecognised', () => {
    // Both of these reach a person: a typo'd link, and the bare app URL with no
    // fragment at all. Neither may render nothing.
    expect(parse('#/nonsense').name).toBe('issues')
    expect(parse('').name).toBe('issues')
  })

  it('recognises an inbound naddr', () => {
    // The route Peek's "open in Ship" links carry. It cannot be rendered
    // directly — an naddr has no Folder — so being *recognised* is the whole job.
    expect(parse('#/o/naddr1abc')).toEqual({ name: 'inbound', naddr: 'naddr1abc' })
  })

  it('falls back to the default project view rather than trusting the query', () => {
    expect((parse('#/project/x?view=nonsense') as { view: string }).view).toBe('table')
  })

  it('leaves the default view out of the URL', () => {
    // A shared link should be the short one unless the sender meant a toggle.
    expect(href({ name: 'project', addr: 'x', view: 'table' })).not.toContain('view=')
    expect(href({ name: 'project', addr: 'x', view: 'board' })).toContain('view=board')
  })
})
