import { IconLink } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { me, peopleIn, resolveInbound, useDirectory, useWorkspace, type DirectoryView, type FolderState, type WorkspaceState, installReadStateFlush } from '@/api'
import { AppShell } from '@/components/AppShell'
import { Banner } from '@/components/Banner'
import { ToastProvider, useToast, type ToastOptions } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { PageSkeleton, type PageSkeletonShape } from '@/components/PageSkeleton'
import { IdentityMenu } from '@/components/IdentityMenu'
import { Sidebar, type SidebarFolder, type SidebarProject } from '@/components/Sidebar'
import { EmptyState } from '@/components/ui/EmptyState'
import { topLevelFolders, useFolders } from '@/api/useFolders'
import { FolderPage } from '@/pages/FolderPage'
import { IssuePage } from '@/pages/IssuePage'
import { IssuesPage } from '@/pages/IssuesPage'
import { ProjectPage } from '@/pages/ProjectPage'
import type { Say } from '@/pages/act'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ID_CONFIG, RELAY_URL } from './config'
import { beginSignIn, beginSignOut, signInAvailable, signedIn } from './auth/estivaId'
import { identifierFromRef, type FolderSummary } from '@estiva-app/interop'
import { go, href, replace, useRoute, type Route } from './router'

/**
 * The app: the shell around whichever page the hash names, fed from the
 * relay through the seam. The pages themselves are the reviewed view
 * components; this file only decides which one is on screen and hands it
 * the fold's data.
 */
export default function App() {
  return (
    /*
      Two providers the package asks for (0.10.0), outside everything else:
      tooltips share one delay across a row (B6, D23), and the toast has one
      place to live (D35). Here rather than in main.tsx so that a test which
      renders <App /> gets them too.
    */
    <TooltipProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </TooltipProvider>
  )
}

function Shell() {
  const { state, error, loading, busy, refresh } = useWorkspace()
  const route = useRoute()
  const folders = useFolders()
  // The teams: what the sidebar lists, what a new project is filed into (FOL-2).
  const teams = useMemo(() => (folders ? topLevelFolders(folders) : undefined), [folders])
  const { showToast } = useToast()
  const { banner, say, clear } = useBanner(showToast)

  // Names and faces for everyone in the snapshot; re-read in full on navigation.
  const people = useMemo(() => (state ? peopleIn(state, me) : [me]), [state])
  const directory = useDirectory(people, href(route))

  useCanonicalPath(route)
  useInbound(route, say)
  /* Read markers are debounced, so the last few of a session would be lost when
     the tab goes away. `visibilitychange` is the one mobile browsers reliably
     fire when a tab is backgrounded or killed (CRO-8). */
  useEffect(() => installReadStateFlush(), [])

  const copyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(me)
      say('Public key copied')
    } catch {
      window.prompt('Copy your public key:', me)
    }
  }, [say])

  return (
    <AppShell
      logo="Estiva Ship"
      identity={
        <IdentityMenu
          me={{ name: directory.nameOf(me), picture: directory.personOf(me).picture }}
          signedIn={signedIn()}
          relayUrl={RELAY_URL}
          idBase={ID_CONFIG?.base}
          onCopyKey={copyKey}
          {...(signInAvailable
            ? {
                // Signed in: end the session at Estiva ID, because clearing the
                // local token is not signing out (PEEK-122). Signed out: a loud
                // attempt, since the person just asked.
                onSignOut: signedIn() ? beginSignOut : () => void beginSignIn(),
              }
            : {})}
        />
      }
      banner={
        error ? (
          <Banner tone="error">{`Could not read from the relay — ${error}`}</Banner>
        ) : busy ? (
          /*
            The one case where a quota refusal is worth saying — SHI-12's rule
            is right whenever there is a workspace on screen and wrong before
            there is one. Without this the page is simply empty: no projects,
            no issues, no explanation, and nothing to distinguish it from an
            app that has stopped.
          */
          <Banner tone="info">The relay is busy — waiting to load the workspace. This clears on its own.</Banner>
        ) : banner ? (
          /* An error stays until it is read, and the reader says when (D21's dismiss). */
          <Banner tone={banner.tone} onDismiss={clear}>
            {banner.text}
          </Banner>
        ) : undefined
      }
      /* The sidebar waits on the same read the page does, so it says so the
         same way — SHI-20. Before this it drew nothing at all while a full
         workspace read ran, beside a page already showing its shape.

         Folders are read separately and are not part of `state`, so they do
         not gate `loading`: the folder list arrives on its own schedule and an
         empty one is not the workspace still coming. */
      nav={
        <Sidebar
          {...sidebarProps(
            state,
            route,
            (teams ?? []).map((f) => ({ id: f.id, name: f.name })),
          )}
          onOpenFolder={(folder) => go({ name: 'folder', id: folder.id })}
          loading={!state && loading}
          foldersLoading={folders === undefined}
        />
      }
    >
      <Page route={route} state={state} loading={loading} directory={directory} teams={teams} say={say} refresh={refresh} />
    </AppShell>
  )
}

/** The shape each route arrives in; rows for anything else. A Folder has none here: it does not wait for the workspace. */
const SKELETON: Partial<Record<Route['name'], PageSkeletonShape>> = {
  projects: 'cards',
  issues: 'list',
  project: 'page',
  issue: 'page',
}

/** Which page the route names; an inbound reference shows nothing until it resolves. */
function Page({ route, state, loading, directory, teams, say, refresh }: { route: Route; state: WorkspaceState | null; loading: boolean; directory: DirectoryView; teams: FolderSummary[] | undefined; say: Say; refresh: (folders?: string[]) => Promise<void> }) {
  /*
    The first read has not landed. This used to render nothing at all, which is
    what "Ship sometimes does not load the projects and issues" was: a full read
    takes ~1.1 s against production and longer when the relay is busy, and for
    all of it the page was blank with no indication anything was coming.

    A skeleton rather than a spinner, because the shape of what arrives is
    known — Skeleton's own page: "data is on its way and the shape of what
    arrives is known, show that shape". Each route's own shape (UIG-14): it
    was six rows everywhere, and the projects route arrives as a grid.

    A Folder first, before either: it is not handed `state` — its contents are
    not Ship's fold, they are resolved through whichever app owns each file —
    so it never waits for the workspace, and draws its own rows while its
    files load (UIG-14 C8). The workspace's skeleton used to sit there first.
  */
  if (route.name === 'folder') return <FolderPage id={route.id} />
  if (!state && loading) return <PageSkeleton shape={SKELETON[route.name] ?? 'rows'} />
  if (!state) return null
  switch (route.name) {
    case 'projects':
      return <ProjectsPage state={state} directory={directory} teams={teams} archived={route.archived} say={say} refresh={refresh} />
    case 'issues':
      return <IssuesPage state={state} directory={directory} say={say} refresh={refresh} />
    case 'project':
      return <ProjectPage state={state} directory={directory} teams={teams} d={route.d} view={route.view} say={say} refresh={refresh} />
    case 'issue':
      return <IssuePage state={state} directory={directory} d={route.d} say={say} refresh={refresh} />
    default:
      return <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="Resolving reference…" />
  }
}

/**
 * The sidebar's numbers, on the old app's rules (`renderSidebar`): Issues
 * counts open issues outside archived projects; a project counts its open
 * issues (the old app counted all of them — our tooltip says "open", so open
 * it is; noted for Jan); archived projects are out of the navigation.
 */
export function sidebarProps(
  state: FolderState | null,
  route: Route,
  folders: SidebarFolder[] = [],
) {
  const projects = state?.projects ?? []
  const issues = state?.issues ?? []
  const isOpen = (status: string) => status !== 'done' && status !== 'cancelled'
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.addr))
  const openIssues = issues.filter((i) => isOpen(i.status) && !archived.has(i.projectAddr ?? '')).length
  const active: SidebarProject[] = projects
    .filter((p) => !p.archived)
    .map((p) => ({
      addr: p.addr,
      title: p.title,
      href: href({ name: 'project', d: p.id, slug: p.title, view: 'table' }),
      openCount: issues.filter((i) => i.projectAddr === p.addr && isOpen(i.status)).length,
      // The team it is under: the Folder its record names, or the one
      // `ship link-project` re-pointed it at (SHI-25).
      ...(p.contentFolder ? { folder: p.contentFolder } : {}),
    }))
  const current =
    route.name === 'project'
      ? { projectAddr: projects.find((p) => p.id === route.d)?.addr ?? '' }
      : route.name === 'folder'
        ? { folderId: route.id }
        : route.name === 'projects' ? ('projects' as const) : ('issues' as const)
  return {
    openIssues,
    issuesHref: href({ name: 'issues' }),
    projectsHref: href({ name: 'projects', archived: false }),
    projects: active,
    folders,
    current,
  }
}

/**
 * The old app's `say`, split the way D14 and D35 rule: an "ok" note is a
 * toast that fades on its own (the package's, bottom-left, five seconds), and
 * an error is a banner under the top bar that stays until it is dismissed or
 * the next one replaces it. Before 0.10.0 both were the banner, the "ok" kind
 * on a four-second timer of this file's own.
 */
function useBanner(showToast: (options: ToastOptions) => void) {
  const [banner, setBanner] = useState<{ tone: 'error'; text: string } | null>(null)
  const say = useCallback<Say>(
    (text, tone = 'ok') => {
      if (tone === 'ok') showToast({ label: text, type: 'success' })
      else setBanner({ tone, text })
    },
    [showToast],
  )
  const clear = useCallback(() => setBanner(null), [])
  return { banner, say, clear }
}

/**
 * Give the bare app URL a route, so `/` becomes `/issues`.
 *
 * **Only the bare URL.** This used to normalise the address bar to
 * `href(route)` for *any* route, which SHI-16 made wrong twice over.
 *
 * It looped. The old comment said "`replace` does not fire `hashchange`, so
 * this cannot loop" — true of a hash router, and no longer true: `replace` now
 * dispatches `popstate` because the browser does not fire one for a
 * `history` call the app made. Each dispatch re-parsed the location into a
 * fresh route object, `[route]` saw a new identity, and the effect ran again.
 * The test suite hung rather than failed, which is how it announced itself.
 *
 * And it would have eaten the slug. A route parsed from
 * `/issue/billing-entry-<uuid>` carries no slug — §7.2 says nothing resolves
 * through one — so `href` rebuilds the path without it, the strings differ, and
 * the address bar loses the human-readable half of every link somebody follows.
 *
 * A misspelt path is left alone deliberately: it renders the issue list, and
 * rewriting the URL would hide that the link was broken rather than fix it.
 */
function useCanonicalPath(route: Route) {
  useEffect(() => {
    if (route.name === 'inbound') return
    if (location.pathname === '/' || location.pathname === '') replace(route)
  }, [route])
}

/**
 * Land an inbound `#/o/<naddr>` — a reference pasted from Peek — on the
 * right surface, or on the issue list with a reason. `replace`, not `go`:
 * Back should not bounce off a route that immediately redirects again.
 */
function useInbound(route: Route, say: (text: string, tone?: 'ok' | 'error') => void) {
  useEffect(() => {
    if (route.name !== 'inbound') return
    let cancelled = false
    resolveInbound(route.naddr)
      .then((found) => {
        if (cancelled) return
        if (!found) {
          say('Could not resolve that reference — you may not have access to its Folder.', 'error')
          return replace({ name: 'issues' })
        }
        // The resolved object's `d` — its uuid — is the tail of the address,
        // and §7.2's grammar carries nothing else.
        const d = identifierFromRef(found.addr)
        if (!d) {
          say('That reference resolved to something without an identifier.', 'error')
          return replace({ name: 'issues' })
        }
        replace(found.kind === 'project' ? { name: 'project', d, view: 'table' } : { name: 'issue', d })
      })
      .catch(() => {
        if (cancelled) return
        say('That reference is not a valid nostr address.', 'error')
        replace({ name: 'issues' })
      })
      .finally(() => {
        // `replace` does not fire hashchange; tell the router by hand.
        if (!cancelled) dispatchEvent(new HashChangeEvent('hashchange'))
      })
    return () => {
      cancelled = true
    }
  }, [route, say])
}
