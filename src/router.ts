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
 *
 * ## The root is for files; Ship's own pages are under `/app/`
 *
 * RFC 0.5 §7.7 (PRO-22): the path names the file and the host names the
 * perspective, so `peek.estiva.app/topic/<slug>-<d>` and
 * `ship.estiva.app/topic/<slug>-<d>` are one file. Ship has no view of a
 * topic, so any `/<word>/<ref>` that is not one of Ship's own words is an
 * `elsewhere` route, and `HandoffPage` asks the manifests what the word means
 * and hands the file off to the app that draws it. The words are never listed
 * here — this file knows only Ship's own.
 *
 * A page that is not a file lives under `/app/`, so a word some app declares
 * tomorrow can never land on it. The Folder page is the one Ship has; it was
 * `/folder/<id>` until PRO-22, and that path still opens it and is rewritten
 * once (`movedRedirect`), the way an old hash link is.
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
  | { name: 'project'; d: string; slug?: string; view: ProjectView; tab?: ProjectTab }
  | { name: 'issue'; d: string; slug?: string; tab?: IssueTab }
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
   * `/<word>/<ref>` for a word that is not Ship's — another app's file, opened
   * on Ship's host (RFC 0.5 §7.7). Kept as written: which kind the word names
   * is the manifests' to say, and the page asks them. `query` too, because a
   * Peek thread link names its comment there (`?thread=<id>`) and the hand-off
   * carries it on (Miky, 2026-10-01).
   */
  | { name: 'elsewhere'; word: string; ref: string; query?: string }

/**
 * The first segments Ship answers itself. Anything else with a ref after it is
 * somebody's file, and goes to the hand-off. `folder` is here because the old
 * Folder path still opens the Folder page; it is not a word Ship serves.
 */
const OWN_SEGMENTS = new Set(['app', 'o', 'project', 'projects', 'issue', 'issues', 'folder'])

/**
 * How a project's issues are shown.
 *
 * Not a set of pages — a project has one page, and this toggles the issue list
 * inside it. Kept in the URL anyway so "look at the board" is a link you can
 * send someone.
 */
export type ProjectView = 'table' | 'board'

/**
 * Which tab of a project page is open (Katerina, 29 September: Overview ·
 * Activity · Issues). In the URL for the same reason the view is — "look at
 * the conversation on this project" is a link you can send — and left out
 * when it is the first tab, so the everyday link stays short.
 */
export type ProjectTab = 'overview' | 'activity' | 'issues'
/** An issue page's tabs: an issue has no Issues tab. */
export type IssueTab = 'overview' | 'activity'
const PROJECT_TABS: ProjectTab[] = ['overview', 'activity', 'issues']
const ISSUE_TABS: IssueTab[] = ['overview', 'activity']

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
      // The defaults are left out — a shared link should be the short one unless
      // the sender meant a specific tab or toggle.
      const query = new URLSearchParams()
      if (route.tab && route.tab !== 'overview') query.set('tab', route.tab)
      if (route.view !== DEFAULT_PROJECT_VIEW) query.set('view', route.view)
      const q = query.toString()
      return q ? `${base}?${q}` : base
    }
    case 'issue': {
      const base = `/issue/${objectRef(route.d, route.slug)}`
      return route.tab && route.tab !== 'overview' ? `${base}?tab=${route.tab}` : base
    }
    case 'folder':
      return `/app/folder/${route.id}`
    case 'inbound':
      return `/o/${route.naddr}`
    case 'elsewhere':
      return `/${route.word}/${route.ref}${route.query ? `?${route.query}` : ''}`
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
  // Only an old `#/…` link carries its route in the hash. Any other fragment — a block link's `#block-<id>`
  // (RIC-18) — belongs to the page the path names.
  const at = location.indexOf('#')
  const raw = at !== -1 && location[at + 1] === '/' ? location.slice(at + 1) : at !== -1 ? location.slice(0, at) : location
  const [path, query] = raw.replace(/^\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'o' && parts[1]) return { name: 'inbound', naddr: parts[1] }
  if (parts[0] === 'projects') {
    return { name: 'projects', archived: new URLSearchParams(query ?? '').has('archived') }
  }
  if (parts[0] === 'project' && parts[1]) {
    const d = identifierFromRef(parts[1])
    if (d) {
      const params = new URLSearchParams(query ?? '')
      const requested = params.get('view')
      const view = PROJECT_VIEWS.includes(requested as ProjectView)
        ? (requested as ProjectView)
        : DEFAULT_PROJECT_VIEW
      const asked = params.get('tab')
      // A link from before the tabs that asked for a view meant the issues: open that tab.
      const tab: ProjectTab = PROJECT_TABS.includes(asked as ProjectTab) ? (asked as ProjectTab) : requested ? 'issues' : 'overview'
      // The first tab is no tab at all, so a plain link reads back as it was written.
      return tab === 'overview' ? { name: 'project', d, view } : { name: 'project', d, view, tab }
    }
  }
  if (parts[0] === 'app' && parts[1] === 'folder' && parts[2]) {
    return { name: 'folder', id: parts[2] }
  }
  // Where the Folder page was until PRO-22; `movedRedirect` corrects the bar.
  if (parts[0] === 'folder' && parts[1]) {
    return { name: 'folder', id: parts[1] }
  }
  if (parts.length === 2 && !OWN_SEGMENTS.has(parts[0])) {
    return query ? { name: 'elsewhere', word: parts[0], ref: parts[1], query } : { name: 'elsewhere', word: parts[0], ref: parts[1] }
  }
  if (parts[0] === 'issue' && parts[1]) {
    const d = identifierFromRef(parts[1])
    if (d) {
      const asked = new URLSearchParams(query ?? '').get('tab')
      return ISSUE_TABS.includes(asked as IssueTab) && asked !== 'overview' ? { name: 'issue', d, tab: asked as IssueTab } : { name: 'issue', d }
    }
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

/**
 * The path a page that moved under `/app/` (PRO-22) should become, or null.
 *
 * Only the Folder page moved. Its old path is in browser histories and in the
 * sidebar links of every tab opened before the deploy, so it still opens the
 * page, and this rewrites the bar once so the address copied next is the new one.
 */
export function movedRedirect(location: string): string | null {
  const path = location.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0]
  if (!/^\/folder\/[^/]+\/?$/.test(path)) return null
  return href(parse(path))
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
    const moved = hashRedirect(here()) ?? movedRedirect(here())
    if (moved) history.replaceState(null, '', moved)
    const fire = () => setRoute(parse(here()))
    addEventListener('popstate', fire)
    fire()
    return () => removeEventListener('popstate', fire)
  }, [])
  return route
}
