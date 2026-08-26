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

  it('reuses the old app\'s router unchanged: every route survives an href → parse round trip', () => {
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
