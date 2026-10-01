import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { hashRedirect, href, movedRedirect, parse, useRoute } from './router'

const UUID = '9c69f247-be6a-4ae7-9703-71cb971f5f93'
const OTHER = 'a5f99f8b-d480-4439-8e3c-8fa915422809'

/**
 * Navigate the way the app does — `pushState` plus the event, because the
 * browser fires `popstate` only for history the *user* moved through and never
 * for a `pushState` the app made.
 */
const goTo = (path: string) => {
  history.pushState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}

afterEach(() => {
  goTo('/')
})

describe('useRoute', () => {
  it('starts on the current path and follows changes', () => {
    goTo('/projects?archived')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'projects', archived: true })

    act(() => goTo(`/issue/billing-entry-${UUID}`))
    expect(result.current).toEqual({ name: 'issue', d: UUID })

    act(() => goTo('/o/naddr1xyz'))
    expect(result.current).toEqual({ name: 'inbound', naddr: 'naddr1xyz' })
  })

  it('every route survives an href → parse round trip', () => {
    // The slug is dropped on the way back, which is the contract rather than a
    // loss: §7.2 says it is decoration and nothing resolves through it.
    const routes = [
      [{ name: 'issues' }, { name: 'issues' }],
      [{ name: 'projects', archived: false }, { name: 'projects', archived: false }],
      [{ name: 'projects', archived: true }, { name: 'projects', archived: true }],
      [{ name: 'project', d: UUID, slug: 'payments', view: 'table' }, { name: 'project', d: UUID, view: 'table' }],
      // The board is on the Issues tab, so a link that asks for it opens that tab (Katerina, 30 September).
      [{ name: 'project', d: UUID, view: 'board' }, { name: 'project', d: UUID, view: 'board', tab: 'issues' }],
      [{ name: 'project', d: UUID, view: 'table', tab: 'activity' }, { name: 'project', d: UUID, view: 'table', tab: 'activity' }],
      [{ name: 'issue', d: UUID, tab: 'activity' }, { name: 'issue', d: UUID, tab: 'activity' }],
      [{ name: 'issue', d: UUID, slug: 'billing-entry' }, { name: 'issue', d: UUID }],
      [{ name: 'inbound', naddr: 'naddr1xyz' }, { name: 'inbound', naddr: 'naddr1xyz' }],
      [{ name: 'folder', id: UUID }, { name: 'folder', id: UUID }],
      [{ name: 'elsewhere', word: 'topic', ref: `level-2-${UUID}` }, { name: 'elsewhere', word: 'topic', ref: `level-2-${UUID}` }],
    ] as const
    for (const [route, expected] of routes) expect(parse(href(route))).toEqual(expected)
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
    expect(parse('/nonsense').name).toBe('issues')
    expect(parse('').name).toBe('issues')
  })

  it('recognises an inbound naddr', () => {
    // The route Peek's "open in Ship" links carry. It cannot be rendered
    // directly — an naddr has no Folder — so being *recognised* is the whole job.
    expect(parse('/o/naddr1abc')).toEqual({ name: 'inbound', naddr: 'naddr1abc' })
  })

  it('falls back to the default project view rather than trusting the query', () => {
    expect((parse(`/project/x-${UUID}?view=nonsense`) as { view: string }).view).toBe('table')
  })

  it('leaves the default view out of the URL', () => {
    // A shared link should be the short one unless the sender meant a toggle.
    expect(href({ name: 'project', d: UUID, view: 'table' })).not.toContain('view=')
    expect(href({ name: 'project', d: UUID, view: 'board' })).toContain('view=board')
  })
})

/**
 * RFC 0.5 §7.2, and the links that were published before it.
 *
 * Ship's URLs were `#/issue/<kind>:<pubkey>:<d>` until SHI-16. Those are in
 * other people's messages and in every browser history that has opened one, so
 * they resolve rather than landing on the issue list — and the address bar is
 * corrected once, so the next person who copies it gets the shareable shape.
 */
describe('the §7.2 grammar', () => {
  it('builds a path with the slug in front of the identity', () => {
    expect(href({ name: 'issue', d: UUID, slug: 'billing-entry' })).toBe(`/issue/billing-entry-${UUID}`)
  })

  it('omits the slug when there is no title to build one from', () => {
    expect(href({ name: 'issue', d: UUID })).toBe(`/issue/${UUID}`)
  })

  it('reads the identity off the tail, whatever the slug says', () => {
    // The property that keeps an old link working after a rename.
    expect(parse(`/issue/a-completely-different-title-${UUID}`)).toEqual({ name: 'issue', d: UUID })
  })

  it('falls back to the list for a path carrying no identity', () => {
    // Rather than rendering a page for an object that cannot exist.
    expect(parse('/issue/no-uuid-here').name).toBe('issues')
  })

  it('still resolves an old hash link, address and all', () => {
    expect(parse(`#/issue/30851:pk:${UUID}`)).toEqual({ name: 'issue', d: UUID })
    expect(parse(`#/project/30850:pk:${OTHER}?view=board`)).toEqual({ name: 'project', d: OTHER, view: 'board', tab: 'issues' })
  })

  it('rewrites an old hash link to the path form, once', () => {
    expect(hashRedirect(`https://ship.estiva.app/#/issue/30851:pk:${UUID}`)).toBe(`/issue/${UUID}`)
  })

  it('leaves a path URL alone, so a normal navigation is not rewritten', () => {
    expect(hashRedirect(`https://ship.estiva.app/issue/billing-${UUID}`)).toBe(null)
  })

  it('does not rewrite an unrecognised hash to the issue list', () => {
    // That would hide a broken link by pretending it pointed somewhere. Render
    // the fallback, but leave the URL saying what the person actually followed.
    expect(hashRedirect('https://ship.estiva.app/#/nonsense')).toBe(null)
  })
})

/**
 * RFC 0.5 §7.7 (PRO-22): the root is for files, whichever app owns them, and
 * Ship's own pages are under `/app/`.
 */
describe('the §7.7 root', () => {
  it('sends another app’s word to the hand-off, as written', () => {
    expect(parse(`/topic/level-2-${UUID}`)).toEqual({ name: 'elsewhere', word: 'topic', ref: `level-2-${UUID}` })
    // The query names a thread inside the topic, and the hand-off carries it on.
    expect(parse(`/topic/level-2-${UUID}?thread=abc`)).toEqual({ name: 'elsewhere', word: 'topic', ref: `level-2-${UUID}`, query: 'thread=abc' })
    expect(href({ name: 'elsewhere', word: 'topic', ref: `x-${UUID}`, query: 'thread=abc' })).toBe(`/topic/x-${UUID}?thread=abc`)
  })

  it('keeps Ship’s own words, and a broken one of them, off the hand-off', () => {
    expect(parse('/issue/no-uuid-here').name).toBe('issues')
    expect(parse('/project/no-uuid-here').name).toBe('issues')
    expect(parse('/app/nonsense').name).toBe('issues')
  })

  it('serves the Folder page under /app/', () => {
    expect(href({ name: 'folder', id: UUID })).toBe(`/app/folder/${UUID}`)
    expect(parse(`/app/folder/${UUID}`)).toEqual({ name: 'folder', id: UUID })
  })

  it('still opens the Folder page at its old path, and rewrites the bar once', () => {
    expect(parse(`/folder/${UUID}`)).toEqual({ name: 'folder', id: UUID })
    expect(movedRedirect(`/folder/${UUID}`)).toBe(`/app/folder/${UUID}`)
    expect(movedRedirect(`https://ship.estiva.app/folder/${UUID}`)).toBe(`/app/folder/${UUID}`)
    expect(movedRedirect(`/app/folder/${UUID}`)).toBe(null)
    expect(movedRedirect(`/issue/x-${UUID}`)).toBe(null)
  })

  it('rewrites the address bar off the old Folder path on load', () => {
    goTo(`/folder/${UUID}`)
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'folder', id: UUID })
    expect(location.pathname).toBe(`/app/folder/${UUID}`)
  })
})
