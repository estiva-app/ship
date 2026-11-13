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
 * `ship.estiva.app/topic/<slug>-<d>` are one file, and since SHIPS-4 Ship draws
 * its own page of a topic there. Any `/<word>/<ref>` that is not one of Ship's
 * own words is an `elsewhere` route, and `HandoffPage` asks the manifests what the word means
 * and hands the file off to the app that draws it. The words are never listed
 * here — this file knows only Ship's own.
 *
 * A page that is not a file lives under `/app/`, so a word some app declares
 * tomorrow can never land on it. The team page is the one Ship has, at
 * `/app/teams/<id>`; it was `/folder/<id>` until PRO-22 and `/app/folder/<id>`
 * until its links said teams, and those paths still open it and are rewritten
 * once (`movedRedirect`), the way an old hash link is.
 */
import { useEffect, useState } from 'react'
import { identifierFromRef, objectRef } from '@estiva-app/interop'

export type Route =
  /** With `folder`, only the issues of the projects in that Folder (SHIPS-5). */
  | { name: 'issues'; folder?: string }
  /** `tab` is the status tab, Active when absent (SHIPS-7); `folder`, only that Folder's projects (SHIPS-5). */
  | { name: 'projects'; tab?: ProjectsTab; folder?: string }
  /**
   * `d` is the identity; `slug` is decoration that never resolves anything and
   * is absent when the caller has no title to hand (an inbound redirect, a
   * test, a link built before the object loaded).
   */
  | { name: 'project'; d: string; slug?: string; view: ProjectView; tab?: ProjectTab }
  /** No tab: an issue's page has one (ONE-6, step 4d). */
  | { name: 'issue'; d: string; slug?: string }
  /**
   * A Folder, addressed by its uuid — the same uuid that is its channel id and
   * the `d` of its state event (RFC 0.4 §5.2). No slug: a Folder's name lives
   * in its state, which may be private, and §4.3 keeps names out of addresses
   * for exactly that reason.
   */
  | { name: 'folder'; id: string }
  /** Topics (SHIPS-3); with `folder`, only the topics filed in that Folder. */
  | { name: 'topics'; folder?: string }
  /** One topic's page (SHIPS-4), by its `d`, as an issue is. */
  | { name: 'topic'; d: string; slug?: string }
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
const OWN_SEGMENTS = new Set(['app', 'o', 'project', 'projects', 'issue', 'issues', 'folder', 'topics', 'topic'])

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
 * Activity · Issues; 2 November: Activity went, its Mentioned in and History
 * to the Overview panel, ONE-6 step 4d). In the URL for the same reason the
 * view is, and left out when it is the first tab, so the everyday link stays
 * short. An old `?tab=activity` opens Overview, its comments beside it, which
 * is where the conversation it meant is now; an issue's, its one page.
 */
export type ProjectTab = 'overview' | 'issues'
const PROJECT_TABS: ProjectTab[] = ['overview', 'issues']

/** The Projects page's tabs, by what each status means (SHIPS-7); Active is the one a bare link opens. */
export type ProjectsTab = 'all' | 'planned' | 'active' | 'completed' | 'archived'
export const PROJECTS_TABS: ProjectsTab[] = ['all', 'planned', 'active', 'completed', 'archived']

/** The tab a Projects link asks for: `?tab=`, or `?archived` as links said it before the tabs. */
function projectsTab(query: string | undefined): ProjectsTab | undefined {
  const params = new URLSearchParams(query ?? '')
  if (params.has('archived')) return 'archived'
  const asked = params.get('tab') as ProjectsTab
  return PROJECTS_TABS.includes(asked) && asked !== 'active' ? asked : undefined
}

const PROJECT_VIEWS: ProjectView[] = ['table', 'board']
const DEFAULT_PROJECT_VIEW: ProjectView = 'table'

/** Build the path for a route — RFC 0.5 §7.2. */
export function href(route: Route): string {
  switch (route.name) {
    case 'issues':
      return route.folder ? `/app/teams/${route.folder}/issues` : '/issues'
    case 'projects': {
      const base = route.folder ? `/app/teams/${route.folder}/projects` : '/projects'
      return route.tab && route.tab !== 'active' ? `${base}?tab=${route.tab}` : base
    }
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
    case 'issue':
      return `/issue/${objectRef(route.d, route.slug)}`
    case 'folder':
      return `/app/teams/${route.id}`
    case 'topics':
      return route.folder ? `/app/teams/${route.folder}/topics` : '/topics'
    case 'topic':
      return `/topic/${objectRef(route.d, route.slug)}`
    case 'inbound':
      return `/o/${route.naddr}`
    case 'elsewhere':
      return `/${route.word}/${route.ref}${route.query ? `?${route.query}` : ''}`
  }
}

/**
 * Where Ship opens: Topics (SHIPS-5; Miky, 2 November, once Home was parked).
 * The bare address, a broken link and a reference that would not resolve all
 * land here, so none of them renders nothing.
 */
export const HOME: Route = { name: 'topics' }

/**
 * Parse a location. Anything unrecognised is {@link HOME}.
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
    const tab = projectsTab(query)
    return tab ? { name: 'projects', tab } : { name: 'projects' }
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
  if (parts[0] === 'topics') return { name: 'topics' }
  // A link to one message in a topic names what Ship's page does not show: it is Peek's, handed off as written
  // (record a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind).
  if (parts[0] === 'topic' && parts[1] && parts.length === 2) {
    const d = identifierFromRef(parts[1])
    if (d && !new URLSearchParams(query ?? '').has('thread')) return { name: 'topic', d }
    if (d) return { name: 'elsewhere', word: parts[0], ref: parts[1], query }
  }
  // A team's Topics, Projects and Issues (SHIPS-5), under the team page's path, or a path it had before:
  // `/app/folder/<id>` until its links said teams, `/folder/<id>` before PRO-22.
  const folderAt = parts[0] === 'app' && (parts[1] === 'teams' || parts[1] === 'folder') ? 2 : parts[0] === 'folder' ? 1 : -1
  const folder = folderAt !== -1 ? parts[folderAt] : undefined
  if (folder && parts[folderAt + 1] === 'topics') return { name: 'topics', folder }
  if (folder && parts[folderAt + 1] === 'projects') {
    const tab = projectsTab(query)
    return tab ? { name: 'projects', tab, folder } : { name: 'projects', folder }
  }
  if (folder && parts[folderAt + 1] === 'issues') return { name: 'issues', folder }
  // The team page; its older paths still open it, and `movedRedirect` corrects the bar.
  if (folder && parts.length === folderAt + 1) return { name: 'folder', id: folder }
  if (parts.length === 2 && !OWN_SEGMENTS.has(parts[0])) {
    return query ? { name: 'elsewhere', word: parts[0], ref: parts[1], query } : { name: 'elsewhere', word: parts[0], ref: parts[1] }
  }
  if (parts[0] === 'issue' && parts[1]) {
    const d = identifierFromRef(parts[1])
    if (d) return { name: 'issue', d }
  }
  if (parts[0] === 'issues') return { name: 'issues' }
  return HOME
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
  // An unrecognised hash falls through to Topics, and rewriting the URL to
  // `/topics` would hide that the link was broken rather than fix it.
  if (route.name === 'topics' && !route.folder && !/^\/topics(?:[/?]|$)/.test(hash)) return null
  return href(route)
}

/**
 * The path a team's page at an older address should become, or null.
 *
 * The team page and its Topics, Projects and Issues were `/folder/<id>…` until
 * PRO-22 and `/app/folder/<id>…` until their links said teams. Those paths are
 * in messages and descriptions on the relay and in browser histories, so they
 * are kept for good: they still open the same view, and this rewrites the bar
 * once so the address copied next is the teams one. A block link's `#…` stays.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-teams-link-says-teams-and-an-old-folder-link-still-opens-it.md
 */
export function movedRedirect(location: string): string | null {
  const local = location.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const [beforeHash, hash] = local.includes('#') ? [local.slice(0, local.indexOf('#')), local.slice(local.indexOf('#'))] : [local, '']
  const path = beforeHash.split('?')[0]
  if (!/^\/(app\/)?folder\/[^/]+(\/(topics|projects|issues))?\/?$/.test(path)) return null
  return href(parse(beforeHash)) + hash
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
      navigateTo(url)
    },
  }
}

/**
 * Change page in place: the new address, then the route listener. What a link's
 * plain click does — `linkTo`'s, and every estiva-ui link's through `AppProvider`
 * (0.60.0), which already leaves the modified clicks to the browser.
 */
export function navigateTo(url: string): void {
  history.pushState(null, '', url)
  dispatchEvent(new PopStateEvent('popstate'))
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
