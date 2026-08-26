import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { me, peopleIn, resolveInbound, useDirectory, useWorkspace, type DirectoryView, type FolderState } from '@/api'
import { AppShell } from '@/components/AppShell'
import { Banner } from '@/components/Banner'
import { IdentityMenu } from '@/components/IdentityMenu'
import { Sidebar, type SidebarProject } from '@/components/Sidebar'
import { EmptyState } from '@/components/ui/EmptyState'
import { IssuesPage } from '@/pages/IssuesPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ID_CONFIG, RELAY_URL } from './config'
import { href, replace, useRoute, type Route } from './router'

/**
 * The app: the shell around whichever page the hash names, fed from the
 * relay through the seam. The pages themselves are the reviewed view
 * components; this file only decides which one is on screen and hands it
 * the fold's data.
 */
export default function App() {
  const { state, error } = useWorkspace()
  const route = useRoute()
  const { banner, say } = useBanner()

  // Names and faces for everyone in the snapshot; re-read in full on navigation.
  const people = useMemo(() => (state ? peopleIn(state, me) : [me]), [state])
  const directory = useDirectory(people, href(route))

  useCanonicalHash(route)
  useInbound(route, say)

  const copyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(me)
      say('Public key copied.')
    } catch {
      window.prompt('Copy your public key:', me)
    }
  }, [say])

  return (
    <AppShell
      identity={
        <IdentityMenu
          me={{ name: directory.nameOf(me), picture: directory.personOf(me).picture }}
          signedIn={false}
          relayUrl={RELAY_URL}
          idBase={ID_CONFIG?.base}
          onCopyKey={copyKey}
        />
      }
      banner={
        error ? (
          <Banner tone="error">{`Could not read from the relay — ${error}`}</Banner>
        ) : banner ? (
          <Banner tone={banner.tone}>{banner.text}</Banner>
        ) : undefined
      }
      sidebar={<Sidebar {...sidebarProps(state, route)} />}
    >
      <Page route={route} state={state} directory={directory} />
    </AppShell>
  )
}

/** Which page the route names. Placeholders remain until steps 4–6 land. */
function Page({ route, state, directory }: { route: Route; state: FolderState | null; directory: DirectoryView }) {
  if (!state) return null
  switch (route.name) {
    case 'projects':
      return <ProjectsPage state={state} directory={directory} archived={route.archived} />
    case 'issues':
      return <IssuesPage state={state} directory={directory} />
    default:
      return <EmptyState className="py-12" message={`${route.name} — wiring in progress`} />
  }
}

/**
 * The sidebar's numbers, on the old app's rules (`renderSidebar`): Issues
 * counts open issues outside archived projects; a project counts its open
 * issues (the old app counted all of them — our tooltip says "open", so open
 * it is; noted for Jan); archived projects are out of the navigation.
 */
export function sidebarProps(state: FolderState | null, route: Route) {
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
      href: href({ name: 'project', addr: p.addr, view: 'table' }),
      openCount: issues.filter((i) => i.projectAddr === p.addr && isOpen(i.status)).length,
    }))
  const current =
    route.name === 'project' ? { projectAddr: route.addr } : route.name === 'projects' ? ('projects' as const) : ('issues' as const)
  return {
    openIssues,
    issuesHref: href({ name: 'issues' }),
    projectsHref: href({ name: 'projects', archived: false }),
    projects: active,
    current,
  }
}

/** The old app's `say`: an "ok" note clears itself after four seconds, an error stays. */
function useBanner() {
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const say = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    clearTimeout(timer.current)
    setBanner({ tone, text })
    if (tone === 'ok') timer.current = setTimeout(() => setBanner(null), 4000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { banner, say }
}

/**
 * Normalise the address bar to the canonical form of wherever we ended up —
 * an empty or misspelt hash renders the issue list, and the URL should say
 * so. `replace` does not fire `hashchange`, so this cannot loop.
 */
function useCanonicalHash(route: Route) {
  useEffect(() => {
    if (route.name === 'inbound') return
    if (location.hash !== href(route)) replace(route)
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
        replace(found.kind === 'project' ? { name: 'project', addr: found.addr, view: 'table' } : { name: 'issue', addr: found.addr })
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
