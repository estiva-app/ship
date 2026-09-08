/**
 * Path routing, in RFC 0.5 §7.2's grammar.
 *
 *     /projects                    a directory of that kind
 *     /project/<slug>-<d>          one object
 *     /issue/<slug>-<d>
 *
 * ## It was a hash, and why it is not any more
 *
 * The hash was not a preference: Ship is served as static files and
 * `deploy/nginx.conf` had `try_files … =404`, so a real path 404s on reload —
 * "the link I pasted into Peek is broken when someone opens it" is the exact
 * failure this layer exists to prevent. §7.6 names that constraint and calls it
 * infrastructure, and SHI-16 pays it: the config now falls back to index.html.
 *
 * ## A path carries the `d` alone, and that is the point
 *
 * The old routes carried `<kind>:<pubkey>:<d>` — everything needed to render
 * without a lookup, and unresolvable by anyone else. §7.2's grammar carries the
 * uuid only, so a route now names an object the way another app can:
 * `{kinds: [30851], "#d": ["<uuid>"]}` is one query with no index behind it.
 *
 * Dropping the pubkey is safe because `d` is a v4 uuid (RFC 0.4 §4.3) and
 * §7.4's measurement holds: across 280 production records, no `(kind, d)` pair
 * is shared by two authors and no `d` appears under two kinds.
 *
 * The slug is decoration. `objectRef` builds it and `identifierFromRef` reads
 * the tail, both from `@estiva-app/interop` rather than from a copy here —
 * two implementations of one grammar is what SHA-19 was about.
 *
 * ## Old links still work
 *
 * Every `#/...` link ever pasted anywhere is translated on load and replaced
 * with the path form. `parse` reads both, so a hash link resolves rather than
 * landing on the issue list, and `hashRedirect` is what rewrites the address
 * bar once.
 *
 * ## The one route that needs resolving
 *
 * `/o/<naddr>` is the inbound case — a reference pasted from Peek, and what
 * Ship's NIP-89 `web` template advertises. An naddr carries kind, author and
 * `d` but **not** the Folder, so this route cannot be rendered directly. It is
 * resolved against the relay and then replaced with a real route. See
 * `resolveObject` in `store.ts`.
 */
import { useEffect, useState } from 'react'
import { identifierFromRef, objectRef } from '@estiva-app/interop'

export type Route =
  | { name: 'issues' }
  /** `archived` shows the archived list instead of the active one. */
  | { name: 'projects'; archived: boolean }
  /**
   * `d` is the identity; `slug` is decoration that never resolves anything and
   * is absent when the caller has no title to hand (an inbound redirect, a
   * test, a link built before the object loaded).
   */
  | { name: 'project'; d: string; slug?: string; view: ProjectView }
  | { name: 'issue'; d: string; slug?: string }
  /**
   * A Folder, addressed by its uuid — the same uuid that is its channel id and
   * the `d` of its state event (RFC 0.4 §5.2). No slug: a Folder's name lives
   * in its state, which may be private, and §4.3 keeps names out of addresses
   * for exactly that reason.
   */
  | { name: 'folder'; id: string }
  /** An inbound `nostr:naddr…`, not yet resolved to an object. */
  | { name: 'inbound'; naddr: string }

/**
 * How a project's issues are shown.
 *
 * Not a set of pages — a project has one page, and this toggles the issue list
 * inside it. Kept in the URL anyway so "look at the board" is a link you can
 * send someone.
 */
export type ProjectView = 'table' | 'board'

const PROJECT_VIEWS: ProjectView[] = ['table', 'board']
const DEFAULT_PROJECT_VIEW: ProjectView = 'table'

/** Build the path for a route — RFC 0.5 §7.2. */
export function href(route: Route): string {
  switch (route.name) {
    case 'issues':
      return '/issues'
    case 'projects':
      return route.archived ? '/projects?archived' : '/projects'
    case 'project': {
      const base = `/project/${objectRef(route.d, route.slug)}`
      // The default is left out — a shared link should be the short one unless
      // the sender meant a specific toggle.
      return route.view === DEFAULT_PROJECT_VIEW ? base : `${base}?view=${route.view}`
    }
    case 'issue':
      return `/issue/${objectRef(route.d, route.slug)}`
    case 'folder':
      return `/folder/${route.id}`
    case 'inbound':
      return `/o/${route.naddr}`
  }
}

/**
 * Parse a location. Anything unrecognised is the issue list.
 *
 * **Takes both shapes.** A path is the current grammar; a `#/...` hash is every
 * link published before SHI-16, including the ones sitting in other people's
 * messages. Reading both here — rather than only redirecting — means a hash
 * link resolves even if the redirect never fires.
 *
 * An old hash carried the full `<kind>:<pubkey>:<d>`; `identifierFromRef` reads
 * the uuid off the tail of either shape, which is the same rule §7.2 states for
 * ignoring a slug.
 */
export function parse(location: string): Route {
  const raw = location.includes('#') ? location.slice(location.indexOf('#') + 1) : location
  const [path, query] = raw.replace(/^\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'o' && parts[1]) return { name: 'inbound', naddr: parts[1] }
  if (parts[0] === 'projects') {
    return { name: 'projects', archived: new URLSearchParams(query ?? '').has('archived') }
  }
  if (parts[0] === 'project' && parts[1]) {
    const d = identifierFromRef(parts[1])
    if (d) {
      const requested = new URLSearchParams(query ?? '').get('view')
      const view = PROJECT_VIEWS.includes(requested as ProjectView)
        ? (requested as ProjectView)
        : DEFAULT_PROJECT_VIEW
      return { name: 'project', d, view }
    }
  }
  if (parts[0] === 'folder' && parts[1]) {
    return { name: 'folder', id: parts[1] }
  }
  if (parts[0] === 'issue' && parts[1]) {
    const d = identifierFromRef(parts[1])
    if (d) return { name: 'issue', d }
  }
  return { name: 'issues' }
}

/**
 * The path a `#/...` link should become, or null if there is nothing to move.
 *
 * Separate from `parse` because it answers a different question: `parse` says
 * what to render, this says whether the address bar is lying. Called once on
 * boot, so somebody who followed an old link keeps a URL they can copy again.
 */
export function hashRedirect(location: string): string | null {
  const hash = location.includes('#') ? location.slice(location.indexOf('#') + 1) : ''
  if (!hash || !hash.startsWith('/')) return null
  const route = parse(hash)
  // An unrecognised hash falls through to the issue list, and rewriting the URL
  // to `/issues` would hide that the link was broken rather than fix it.
  if (route.name === 'issues' && !hash.startsWith('/issues')) return null
  return href(route)
}

/** Navigate, adding a history entry. */
export function go(route: Route): void {
  history.pushState(null, '', href(route))
  dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * The props that make an in-app link an in-app link — SHI-20.
 *
 * ## Why every link needs this
 *
 * A package component that takes an `href` renders a plain `<a>` and nothing
 * else; `NavItem.mdx` says so and tells the caller to wrap it. Ship did not,
 * so **every sidebar click was a full document load**: `main.tsx` re-ran
 * `bootAuth`, re-imported `App`, and `useWorkspace` started again at `null` —
 * which is why the project list emptied and stayed empty for the length of a
 * whole workspace read. Peek wraps its rail item exactly this way and has
 * never had the bug.
 *
 * ## What it deliberately leaves alone
 *
 * The `href` stays a real address, so a link can be copied, pasted into Peek
 * and opened cold — the whole point of SHI-16's real paths.
 *
 * A modified click is the browser's business. Ctrl, Cmd, Shift, Alt and any
 * button but the first all fall through untouched, so open-in-new-tab and
 * open-in-new-window keep working. So does a click something else has already
 * handled.
 */
export function linkTo(url: string): {
  href: string
  onClick: (event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault: () => void }) => void
} {
  return {
    href: url,
    onClick: (event) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      history.pushState(null, '', url)
      dispatchEvent(new PopStateEvent('popstate'))
    },
  }
}

/**
 * Navigate **without** adding a history entry.
 *
 * For routes the user did not choose — in practice the redirect off
 * `#/o/<naddr>` once it resolves. Pushing that would make Back bounce off a
 * route that immediately redirects again, which reads as a broken Back button.
 */
export function replace(route: Route): void {
  history.replaceState(null, '', href(route))
  dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * The current route, updated on every navigation.
 *
 * `popstate` rather than `hashchange`, and `go`/`replace` dispatch it
 * themselves because the browser fires it only for history the *user* moved
 * through, never for a `pushState` the app made.
 *
 * The old-link redirect happens here, once, before the first render settles: a
 * `#/issue/<addr>` in somebody's message resolves and then the address bar says
 * so, rather than continuing to show a shape no other app can read.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(`${location.pathname}${location.search}${location.hash}`))
  useEffect(() => {
    const here = () => `${location.pathname}${location.search}${location.hash}`
    const moved = hashRedirect(here())
    if (moved) history.replaceState(null, '', moved)
    const fire = () => setRoute(parse(here()))
    addEventListener('popstate', fire)
    fire()
    return () => removeEventListener('popstate', fire)
  }, [])
  return route
}
