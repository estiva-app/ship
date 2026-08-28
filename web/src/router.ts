/**
 * Hash routing.
 *
 * The hash rather than the History API because Estiva Ship is served as static
 * files with no rewrite rule — a real path would 404 on reload, and "the link I
 * pasted into Peek is broken when someone opens it" is the exact failure this
 * whole layer exists to prevent. `deploy/nginx.conf` says the same thing from
 * the other side: `try_files … =404`, with no rewrite to index.html.
 *
 * ## No workspace in the URL
 *
 * There is nothing to put there. The workspace is the relay, and the relay is
 * where this app is pointed — so an address plus the host is already everything
 * needed to render a route. An earlier cut carried a workspace Folder id in
 * every path; it made links longer and meant a link only worked for someone who
 * happened to be in the same app-private index.
 *
 * ## The one route that needs resolving
 *
 * `#/o/<naddr>` is the inbound case — a reference pasted from Peek. An naddr
 * carries kind, author and `d`, but **not** the Folder, so this route cannot be
 * rendered directly. It is resolved against the relay and then replaced with a
 * real route. See `resolveObject` in `store.ts`.
 *
 * ## Moved here in REW-9, unchanged
 *
 * This was `apps/ship/router.ts`, and until the old app was deleted this file
 * re-exported it rather than copying it: every route it defines — including the
 * inbound one Peek's "open in Ship" links carry — had to survive the rewrite
 * byte for byte, and one copy is how that is guaranteed rather than hoped for.
 *
 * The implementation below is that file, with one deletion: `start(onChange)`,
 * which registered a `hashchange` listener imperatively. `useRoute` at the
 * bottom is its React equivalent and the only caller `start` ever had was the
 * vanilla app's boot.
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'issues' }
  /** `archived` shows the archived list instead of the active one. */
  | { name: 'projects'; archived: boolean }
  | { name: 'project'; addr: string; view: ProjectView }
  | { name: 'issue'; addr: string }
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

/**
 * Build the hash for a route.
 *
 * Addresses are `<kind>:<pubkey>:<d>` and colons are legal in a fragment, but
 * they get percent-encoded anyway: a `d` is a UUID today and there is nothing
 * in the spec promising it always will be.
 */
export function href(route: Route): string {
  switch (route.name) {
    case 'issues':
      return '#/issues'
    case 'projects':
      return route.archived ? '#/projects?archived' : '#/projects'
    case 'project': {
      const base = `#/project/${encodeURIComponent(route.addr)}`
      // The default is left out — a shared link should be the short one unless
      // the sender meant a specific toggle.
      return route.view === DEFAULT_PROJECT_VIEW ? base : `${base}?view=${route.view}`
    }
    case 'issue':
      return `#/issue/${encodeURIComponent(route.addr)}`
    case 'inbound':
      return `#/o/${route.naddr}`
  }
}

/** Parse the current `location.hash`. Anything unrecognised is the issue list. */
export function parse(hash: string): Route {
  const [path, query] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'o' && parts[1]) return { name: 'inbound', naddr: parts[1] }
  if (parts[0] === 'projects') {
    return { name: 'projects', archived: new URLSearchParams(query ?? '').has('archived') }
  }
  if (parts[0] === 'project' && parts[1]) {
    const requested = new URLSearchParams(query ?? '').get('view')
    const view = PROJECT_VIEWS.includes(requested as ProjectView)
      ? (requested as ProjectView)
      : DEFAULT_PROJECT_VIEW
    return { name: 'project', addr: parts[1], view }
  }
  if (parts[0] === 'issue' && parts[1]) return { name: 'issue', addr: parts[1] }
  return { name: 'issues' }
}

/** Navigate, adding a history entry. */
export function go(route: Route): void {
  location.hash = href(route)
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
}

/** The current route, updated on every hash change. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const fire = () => setRoute(parse(location.hash))
    addEventListener('hashchange', fire)
    fire()
    return () => removeEventListener('hashchange', fire)
  }, [])
  return route
}
