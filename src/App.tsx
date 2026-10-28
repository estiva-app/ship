import { IconLink } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppProvider } from '@estiva-app/ui'
import { createFolder, me, peopleIn, resolveInbound, settleClaims, useDirectory, useWorkspace, type DirectoryView, type FolderState, type WorkspaceState, installReadStateFlush } from '@/api'
import { AppShell } from '@/components/AppShell'
import { Banner } from '@/components/Banner'
import { ToastProvider, useToast, type ToastOptions } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { PageSkeleton, type PageSkeletonShape } from '@/components/PageSkeleton'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar, type SidebarFolder, type SidebarProject } from '@/components/ShipSidebar'
import { EmptyState } from '@/components/ui/EmptyState'
import { reloadFolders, topLevelFolders, useFolders } from '@/api/useFolders'
import { NewFolderDialog } from '@/components/NewFolderDialog'
import { FolderPage } from '@/pages/FolderPage'
import { HandoffPage } from '@/pages/HandoffPage'
import { IssuePage } from '@/pages/IssuePage'
import { IssuesPage } from '@/pages/IssuesPage'
import { ProjectPage } from '@/pages/ProjectPage'
import { act, type Say } from '@/pages/act'
import { MoveProject } from '@/components/MoveProject'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ID_CONFIG, RELAY_URL } from './config'
import { beginSignIn, beginSignOut, signInAvailable, signedIn } from './auth/estivaId'
import { identifierFromRef, type FolderSummary } from '@estiva-app/interop'
import { naddrToAddr } from '@estiva-app/protocol'
import type { Opened } from '@/api/useWorkspace'
import { ThreadsContext } from '@/api/useThreads'
import { archivesOf, type Archives } from '@/lib/archive'
import { MentionPeopleProvider, WorkspacePeopleProvider, mentionPeople, workspacePeople } from '@/components/editing/mentionables'
import { useRoster } from '@/api/useRoster'
import { isRelayBusy } from '@/lib/relayBudget'
import { go, href, navigateTo, replace, useRoute, type Route } from './router'

/**
 * The app: the shell around whichever page the hash names, fed from the
 * relay through the seam. The pages themselves are the reviewed view
 * components; this file only decides which one is on screen and hands it
 * the fold's data.
 */
export default function App() {
  return (
    /*
      The providers the package asks for, outside everything else: tooltips
      share one delay across a row (B6, D23), the toast has one place to live
      (D35), and every link changes page through Ship's router rather than
      reloading (AppProvider, 0.60.0 — Ship's own NavItem existed only for
      that). Here rather than in main.tsx so that a test which renders <App />
      gets them too.
    */
    <AppProvider navigate={navigateTo}>
      <TooltipProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </TooltipProvider>
    </AppProvider>
  )
}

function Shell() {
  const route = useRoute()
  const { state, partial, error, loading, busy, refresh, wantThreads } = useWorkspace(openedBy(route))
  const folders = useFolders()
  // The teams: what the sidebar lists, what a new project is filed into (FOL-2).
  const teams = useMemo(() => (folders ? topLevelFolders(folders) : undefined), [folders])
  // What is archived, and what with (FOL-46): read against every Folder, archived teams included.
  const archives = useMemo(() => (state ? archivesOf(state, folders ?? []) : undefined), [state, folders])
  const { showToast } = useToast()
  const { banner, say, clear } = useBanner(showToast)
  // The project a sidebar row's "Move to Folder…" was chosen on (FOL-7), by address.
  const [moving, setMoving] = useState<string | null>(null)
  const movingProject = moving ? state?.projects.find((project) => project.addr === moving) : undefined
  const [creatingFolder, setCreatingFolder] = useState(false)

  /*
    "New folder" (FOL-8): the write, then the Folder listing read again — a new
    Folder is a channel and a state, neither of which is in the fold — and the
    new Folder's page, which is where it is renamed.
  */
  const newFolder = useCallback(
    async (name: string) => {
      let id: string | undefined
      let unlisted: string | undefined
      const ok = await act(
        'New folder',
        async () => {
          const result = await createFolder(name)
          if (result.ok) ({ id, unlisted } = result)
          return result
        },
        say,
        reloadFolders,
      )
      if (!ok || !id) return false
      // Created and not listed: opened anyway, so the one Folder that exists is the one on screen rather than a retry's second.
      say(unlisted ? `Created ${name}, but the relay refused to list it, so it is in no sidebar — ${unlisted}` : `Created ${name}`, unlisted ? 'error' : 'ok')
      go({ name: 'folder', id })
      return true
    },
    [say],
  )

  // Names and faces for everyone in the snapshot; re-read in full on navigation.
  const people = useMemo(() => (state ? peopleIn(state, me) : [me]), [state])
  // `@` offers the workspace's members, so their names are looked up too (CON-25); with no roster, the people in the snapshot.
  const roster = useRoster()
  const mentionKeys = useMemo(() => [...(roster ?? people)], [roster, people])
  const named = useMemo(() => [...new Set([...people, ...mentionKeys])], [people, mentionKeys])
  const directory = useDirectory(named, href(route))
  // By its two lookups, which change only when a profile arrives: the view itself is a new object every render.
  const { nameOf, personOf, profileOf } = directory
  const mentionable = useMemo(() => mentionPeople(mentionKeys, me, { nameOf, personOf, profileOf }), [mentionKeys, nameOf, personOf, profileOf])
  // Whom a linked issue's card offers as its assignee: the people the issue page's own picker draws from.
  const cardPeople = useMemo(() => workspacePeople(people, { profileOf }), [people, profileOf])

  useCanonicalPath(route)
  useInbound(route, say, clear)
  /* Read markers are debounced, so the last few of a session would be lost when
     the tab goes away. `visibilitychange` is the one mobile browsers reliably
     fire when a tab is backgrounded or killed (CRO-8). */
  useEffect(() => installReadStateFlush(), [])

  // A key or ref this tab just claimed — on any page — that an earlier claim
  // holds moves to the next free one (SPEC §6.1, SHI-4). A no-op until this tab
  // has claimed something.
  useEffect(() => {
    if (!state || partial || !signedIn()) return
    void settleClaims(state).then((results) => {
      if (results.length) void refresh()
    })
  }, [state, partial, refresh])

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
         empty one is not the workspace still coming.

         While only the opened page is read (APP-4) the sidebar is still
         waiting, so it draws as it does with no state: its counts are of the
         whole workspace. */
      nav={
        <ShipSidebar
          {...sidebarProps(
            partial ? null : state,
            route,
            (teams ?? []).map((f) => ({ id: f.id, name: f.name, addresses: f.addresses })),
            archives,
          )}
          onOpenFolder={(folder) => go({ name: 'folder', id: folder.id })}
          {...(teams?.length ? { onMoveProject: (project: SidebarProject) => setMoving(project.addr) } : {})}
          onNewFolder={() => setCreatingFolder(true)}
          loading={(!state && loading) || partial}
          foldersLoading={folders === undefined}
        />
      }
    >
      {/* Everyone `@` and `!@` offer in any message box on the page (CON-25). */}
      <MentionPeopleProvider value={mentionable}>
        <WorkspacePeopleProvider value={cardPeople}>
          {/* Each page asks for the conversations it draws (APP-5). */}
          <ThreadsContext.Provider value={wantThreads}>
            <Page route={route} state={partial && !opens(route, state) ? null : state} loading={loading || partial} directory={directory} teams={teams} folders={folders} archives={archives} say={say} refresh={refresh} />
          </ThreadsContext.Provider>
        </WorkspacePeopleProvider>
      </MentionPeopleProvider>
      {movingProject && teams && <MoveProject project={movingProject} teams={teams} say={say} onClose={() => setMoving(null)} />}
      {creatingFolder && <NewFolderDialog onCreate={newFolder} onClose={() => setCreatingFolder(false)} />}
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

/**
 * The project or issue the route opens, read before the whole workspace (APP-4):
 * its own page, or a `/o/<naddr>` — Peek's Open link — whose address already
 * names it while `useInbound` resolves it.
 */
function openedBy(route: Route): Opened | undefined {
  if (route.name === 'project' || route.name === 'issue') return { kind: route.name, d: route.d }
  if (route.name !== 'inbound') return undefined
  try {
    const addr = naddrToAddr(route.naddr)
    const d = identifierFromRef(addr)
    if (d && addr.startsWith('30850:')) return { kind: 'project', d }
    if (d && addr.startsWith('30851:')) return { kind: 'issue', d }
  } catch {
    // A malformed link: `useInbound` says so.
  }
  return undefined
}

/** The opened page's own read holds what this route shows; any other route waits for the whole workspace (APP-4). */
function opens(route: Route, state: WorkspaceState | null): boolean {
  if (route.name === 'project') return !!state?.projects.some((project) => project.id === route.d)
  if (route.name === 'issue') return !!state?.issues.some((issue) => issue.id === route.d)
  return false
}

/** Which page the route names; an inbound reference shows nothing until it resolves. */
function Page({ route, state, loading, directory, teams, folders, archives, say, refresh }: { route: Route; state: WorkspaceState | null; loading: boolean; directory: DirectoryView; teams: FolderSummary[] | undefined; folders: FolderSummary[] | undefined; archives: Archives | undefined; say: Say; refresh: (folders?: string[]) => Promise<void> }) {
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
  if (route.name === 'folder') return <FolderPage id={route.id} folders={folders} nameOf={directory.nameOf} say={say} />
  // Another app's file is not Ship's fold either: it resolves on its own (PRO-22).
  if (route.name === 'elsewhere') return <HandoffPage word={route.word} fileRef={route.ref} query={route.query} />
  if (!state && loading) return <PageSkeleton shape={SKELETON[route.name] ?? 'rows'} />
  if (!state || !archives) return null
  switch (route.name) {
    case 'projects':
      return <ProjectsPage state={state} directory={directory} teams={teams} archives={archives} archived={route.archived} say={say} refresh={refresh} />
    case 'issues':
      return <IssuesPage state={state} directory={directory} archives={archives} say={say} refresh={refresh} />
    case 'project':
      return <ProjectPage state={state} directory={directory} teams={teams} archives={archives} d={route.d} view={route.view} tab={route.tab ?? 'overview'} say={say} refresh={refresh} />
    case 'issue':
      return <IssuePage state={state} directory={directory} archives={archives} d={route.d} tab={route.tab ?? 'overview'} say={say} refresh={refresh} />
    default:
      return <EmptyState icon={<IconLink size={16} stroke={1.5} />} message="Resolving reference…" />
  }
}

/**
 * The sidebar's numbers, on the old app's rules (`renderSidebar`): Issues
 * counts open issues outside archived projects; a project counts its open
 * issues (the old app counted all of them — our tooltip says "open", so open
 * it is; noted for Jan); archived projects are out of the navigation.
 *
 * Archived is FOL-46's rule (`archivesOf`): an issue archived itself or with
 * its project is not counted, and a project archived itself or with its team
 * is not listed. Without `archives` only a project's own flag is read.
 */
export function sidebarProps(
  state: FolderState | null,
  route: Route,
  folders: SidebarFolder[] = [],
  archives: Archives | undefined = state ? archivesOf(state) : undefined,
) {
  const projects = state?.projects ?? []
  const isOpen = (status: string) => status !== 'done' && status !== 'cancelled'
  const issues = (state?.issues ?? []).filter((i) => !archives?.ofIssue(i))
  const openIssues = issues.filter((i) => isOpen(i.status)).length
  const active: SidebarProject[] = projects
    .filter((p) => !archives?.ofProject(p.addr))
    .map((p) => ({
      addr: p.addr,
      title: p.title,
      href: href({ name: 'project', d: p.id, slug: p.title, view: 'table' }),
      openCount: issues.filter((i) => i.projectAddr === p.addr && isOpen(i.status)).length,
      // Its own Folder: the one its record names, or the one `ship
      // link-project` re-pointed it at. The sidebar places it by the teams'
      // state and falls back to this only when no state lists it (FOL-5).
      ...(p.contentFolder ? { folder: p.contentFolder } : {}),
    }))
  const current =
    route.name === 'project'
      ? { projectAddr: projects.find((p) => p.id === route.d)?.addr ?? '' }
      : route.name === 'folder'
        ? { folderId: route.id }
        : route.name === 'elsewhere'
          ? // Another app's file is none of the sidebar's places, so none is lit.
            { projectAddr: '' }
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
    // `/app` too: the root of Ship's own pages, which has none of its own (PRO-22).
    if (location.pathname === '/' || location.pathname === '' || /^\/app\/?$/.test(location.pathname)) replace(route)
  }, [route])
}

/**
 * Land an inbound `#/o/<naddr>` — a reference pasted from Peek — on the
 * right surface, or on the issue list with a reason. `replace`, not `go`:
 * Back should not bounce off a route that immediately redirects again.
 */
function useInbound(route: Route, say: (text: string, tone?: 'ok' | 'error') => void, clear: () => void) {
  /* Bumped to ask a busy relay again. Tied to the link it is for, so another
     link starts at 0 without a reset that would run the read twice. */
  const [attempt, setAttempt] = useState<{ naddr: string; n: number } | null>(null)
  const naddr = route.name === 'inbound' ? route.naddr : null
  const n = attempt && attempt.naddr === naddr ? attempt.n : 0
  // The link the busy banner was said for, so it is said once and taken down when that link lands.
  const saidBusyFor = useRef<string | null>(null)
  useEffect(() => {
    if (naddr === null) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    resolveInbound(naddr)
      .then((found) => {
        if (cancelled) return
        // The relay answered: the busy banner is no longer true (SHI-12 — no red over a correct page).
        if (saidBusyFor.current === naddr) {
          saidBusyFor.current = null
          clear()
        }
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
      .catch((reason: unknown) => {
        if (cancelled) return
        /*
          A relay that stayed busy through protocol's quiet retries has not
          judged the address (APP-9): keep the route, say so once, and ask
          again. Declaring a good link invalid would send the person to the
          issue list with a false reason.
        */
        if (isRelayBusy(reason)) {
          if (saidBusyFor.current !== naddr) say('Too busy right now — try again shortly.', 'error')
          saidBusyFor.current = naddr
          retry = setTimeout(() => setAttempt({ naddr, n: n + 1 }), INBOUND_BUSY_RETRY_MS)
          return
        }
        if (saidBusyFor.current === naddr) saidBusyFor.current = null
        say('That reference is not a valid nostr address.', 'error')
        replace({ name: 'issues' })
      })
      .finally(() => {
        // `replace` does not fire hashchange; tell the router by hand.
        if (!cancelled && retry === undefined) dispatchEvent(new HashChangeEvent('hashchange'))
      })
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [naddr, say, clear, n])
}

/** How long an inbound link waits before asking a busy relay again (APP-9). */
const INBOUND_BUSY_RETRY_MS = 10_000
