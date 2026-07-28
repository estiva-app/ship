/**
 * Linear-lite — the shell.
 *
 * Plain DOM, no framework. Every mutation publishes an event and then re-reads
 * from the relay, so what you see is always the folded shared record rather
 * than an optimistic local guess. That is slower than a real tracker would be,
 * and it is the point: if the screen and the relay ever disagreed, the demo
 * would be lying.
 *
 * ## One container per project, and no workspace object
 *
 * A project **is** a Folder: its record, its issues, their change events and its
 * conversation all carry the same `h`. There is no workspace above that, because
 * Buzz already has one — a *community*, resolved from the relay host before a
 * request is authenticated, so the relay URL is the workspace
 * (`~/buzz/ARCHITECTURE.md` §1). `store.loadAll` discovers projects by asking
 * the relay for `kind:30850` and lets access control decide what comes back.
 *
 * Everything below this line works on the folded result and does not think
 * about Folders again, except when publishing, where the `h` has to match the
 * object being written to.
 */
import { localIdentity, Relay } from '../../lib/nostr/relay'
import { naddrToAddr } from '../../lib/nostr/nip19'
import { Store } from '../../src/store'
import type { FolderState, Issue, Project } from '../../src/fold'
import type { Ctx } from './context'
import { href, parse, replace, start, type Route } from './router'
import { dropdown, h, participants, short } from './ui'
import { issuesView } from './views/issues'
import { projectsView } from './views/projects'
import { projectView } from './views/project'
import { issueView } from './views/issue'

const RELAY_URL = 'http://localhost:3000'
/**
 * How often a detail surface re-reads.
 *
 * The whole product claim is that acting on an issue in Peek shows up here, and
 * a claim you have to press Reload to observe reads as two apps rather than
 * one. Scoped to detail views: a list is usually not what somebody is staring
 * at while a colleague acts, and polling every surface would be chatter for its
 * own sake.
 */
const POLL_MS = 5000

const identity = localIdentity('linear-lite.secretkey')
const store = new Store(new Relay(RELAY_URL, identity), identity)

let state: FolderState = { projects: [], issues: [], activity: [], comments: new Map() }
let route: Route = { name: 'issues' }
let poll: ReturnType<typeof setInterval> | undefined

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = {
  banner: $<HTMLDivElement>('banner'),
  sidebar: $<HTMLElement>('sidebar'),
  main: $<HTMLElement>('main'),
  profile: $<HTMLDivElement>('profile'),
}

function say(message: string, kind: 'ok' | 'error' = 'ok') {
  el.banner.textContent = message
  el.banner.className = kind
  if (kind === 'ok') setTimeout(() => (el.banner.className = ''), 4000)
}

/** Every publish goes through here, because HTTP 200 does not mean accepted. */
async function publish(
  what: string,
  action: () => Promise<{ ok: boolean; reason?: string }>,
): Promise<boolean> {
  try {
    const result = await action()
    if (!result.ok) {
      say(`${what} rejected — ${result.reason ?? 'no reason given'}`, 'error')
      return false
    }
    return true
  } catch (error) {
    say(`${what} failed — ${(error as Error).message}`, 'error')
    return false
  }
}

const isMe = (pubkey: string) => pubkey === identity.pubkey
const who = (pubkey: string) => (isMe(pubkey) ? 'you' : short(pubkey))

function context(): Ctx {
  return {
    store,
    identity,
    state,
    route,
    people: participants({
      projects: state.projects,
      issues: state.issues,
      comments: state.comments,
      changes: state.activity,
    }),
    say,
    publish,
    reload: () => load(),
    isMe,
    who,
    // An issue's events must carry the issue's own `h` — the Folder it is
    // already in, which is not necessarily the project's current one if the
    // project has since been re-linked.
    folderOf: (issue: Issue) => issue.folder,
    folderForProject: (project: Project) => project.contentFolder,
  }
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  el.sidebar.replaceChildren()

  const link = (label: string, target: Route, count?: number, active = false) =>
    h(
      'a',
      { class: `nav-item${active ? ' active' : ''}`, href: href(target) },
      h('span', { text: label }),
      count !== undefined && h('span', { class: 'count', text: String(count) }),
    )

  const open = state.issues.filter(
    (issue) => issue.status !== 'done' && issue.status !== 'cancelled',
  ).length

  el.sidebar.append(
    h(
      'div',
      { class: 'nav-group' },
      link('Issues', { name: 'issues' }, open, route.name === 'issues'),
      link('Projects', { name: 'projects' }, state.projects.length, route.name === 'projects'),
    ),
  )

  // Projects are listed individually because a project is the unit of work in
  // this app — and, since a project *is* a Folder, the unit of sharing too.
  if (state.projects.length) {
    const group = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label', text: 'Projects' }))
    for (const project of state.projects) {
      const count = state.issues.filter((issue) => issue.projectAddr === project.addr).length
      group.append(
        link(
          project.title,
          { name: 'project', addr: project.addr, view: 'table' },
          count,
          route.name === 'project' && route.addr === project.addr,
        ),
      )
    }
    el.sidebar.append(group)
  }

}

/**
 * The profile menu.
 *
 * Identity and workspace both live here rather than in the sidebar: they are
 * the two things you look at once and then stop thinking about.
 *
 * The workspace shown is **the relay**, because that is what a workspace is on
 * this substrate — Buzz resolves a community from the request host before a
 * connection is even authenticated, so everyone pointed at this URL is in the
 * same organisation, across every app. There is nothing here to switch or
 * create; pointing the app at a different relay is what "another workspace"
 * means, and that is a deployment concern rather than a button.
 */
function renderProfile() {
  el.profile.replaceChildren(
    dropdown({
      label: `you: ${short(identity.pubkey)}`,
      build: (close) => {
        const panel = h(
          'div',
          {},
          h('div', { class: 'menu-label', text: 'Signed in as' }),
          h('div', { class: 'mono tiny dim break menu-value', text: identity.pubkey }),
          h('div', { class: 'menu-label', text: 'Workspace' }),
          h('div', { class: 'mono tiny dim break menu-value', text: RELAY_URL }),
          h('div', {
            class: 'dim tiny menu-value',
            text: 'Everyone on this relay shares this workspace, in every app.',
          }),
        )
        const copy = h('button', { class: 'menu-item', text: 'Copy my public key' })
        copy.onclick = async () => {
          close()
          try {
            await navigator.clipboard.writeText(identity.pubkey)
            say('Public key copied.')
          } catch {
            window.prompt('Copy your public key:', identity.pubkey)
          }
        }
        panel.append(copy)
        return panel
      },
    }),
  )
}

// ── Loading and rendering ───────────────────────────────────────────────────

async function load(): Promise<void> {
  try {
    state = await store.loadAll()
  } catch (error) {
    say(`Could not read from the relay — ${(error as Error).message}`, 'error')
  }
  render()
}

/**
 * Re-read without redrawing unless something actually changed.
 *
 * The poll runs while a detail surface is open, and a blind re-render every
 * five seconds would close any dropdown the user had open and discard a
 * half-typed comment. Comparing a cheap fingerprint first means the common case
 * — nothing happened — costs one query and no DOM work.
 */
async function refresh(): Promise<void> {
  if (document.hidden) return
  try {
    const next = await store.loadAll()
    if (fingerprint(next) === fingerprint(state)) return
    state = next
    render()
  } catch {
    // A failed poll is not worth a banner: the user did not ask for it, and the
    // next tick will either succeed or the next explicit action will report it.
  }
}

function fingerprint(snapshot: FolderState): string {
  const comments = [...snapshot.comments.values()].reduce((total, t) => total + t.length, 0)
  return [
    snapshot.projects.length,
    snapshot.issues.length,
    snapshot.activity.length,
    comments,
    // Counts alone miss an edit that replaced a root event in place.
    snapshot.activity.at(-1)?.id ?? '',
    snapshot.issues.map((issue) => `${issue.status}${issue.assignee ?? ''}`).join(),
  ].join('|')
}

function render() {
  renderSidebar()
  renderProfile()
  const ctx = context()

  const view =
    route.name === 'projects'
      ? projectsView(ctx)
      : route.name === 'project'
        ? projectView(ctx, route.addr, route.view)
        : route.name === 'issue'
          ? issueView(ctx, route.addr, RELAY_URL)
          : issuesView(ctx)

  el.main.replaceChildren(view)
}

// ── Inbound references ──────────────────────────────────────────────────────

/**
 * Land an inbound `nostr:naddr…` on the right surface.
 *
 * The pointer carries kind, author and `d` but not the Folder, so the object
 * has to be resolved before it can be routed — and resolving it tells us the
 * Folder, which tells us whether the current workspace can even see it.
 *
 * This is the return leg of the roundtrip. Getting it wrong does not error; it
 * shows an empty screen, which is why every failure below says something
 * specific instead.
 */
async function resolveInbound(naddr: string) {
  el.main.replaceChildren(
    h('div', { class: 'surface' }, h('div', { class: 'empty', text: 'Resolving reference…' })),
  )
  let address: string
  try {
    address = naddrToAddr(naddr)
  } catch {
    say('That reference is not a valid nostr address.', 'error')
    return replace({ name: 'issues' })
  }

  // Resolving is what tells us the Folder — the pointer does not carry one — and
  // it is also the honest access check: if this comes back empty the object is
  // in a Folder this identity cannot read, which is a different problem from a
  // bad link and deserves a different message.
  const resolved = await store.resolveObject(address).catch(() => null)
  if (!resolved) {
    say('Could not resolve that reference — you may not have access to its Folder.', 'error')
    return replace({ name: 'issues' })
  }

  await load()
  const [kind] = address.split(':')
  replace(
    kind === String(30850)
      ? { name: 'project', addr: address, view: 'table' }
      : { name: 'issue', addr: address },
  )
  route = parse(location.hash)
  render()
}

// ── Boot ────────────────────────────────────────────────────────────────────

renderProfile()

start(async (next) => {
  route = next

  if (next.name === 'inbound') return void resolveInbound(next.naddr)

  // Normalise the address bar to the canonical form of wherever we ended up —
  // an empty or misspelt hash renders the issue list, and the URL should say so
  // rather than leaving something unshareable on screen. `replace` does not
  // fire `hashchange`, so this cannot loop.
  if (location.hash !== href(next)) replace(next)

  clearInterval(poll)
  poll = undefined
  await load()
  // Polling only on detail surfaces: a list is rarely what somebody is staring
  // at while a colleague acts on something, and polling everywhere would be
  // relay chatter for its own sake.
  if (next.name === 'issue' || next.name === 'project') {
    poll = setInterval(() => void refresh(), POLL_MS)
  }
})

// A tab that was hidden for ten minutes should not show ten-minute-old state
// the moment it is looked at again.
addEventListener('visibilitychange', () => {
  if (!document.hidden && poll) void refresh()
})
