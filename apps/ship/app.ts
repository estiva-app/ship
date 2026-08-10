/**
 * Estiva Ship — the shell.
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
import { Relay } from '../../lib/nostr/relay'
import { estivaIdSigner, localSigner, type Signer } from '../../lib/nostr/signer'
import { beginSignIn, completeSignIn, currentSession, signOut } from '../../lib/auth/estiva-id'
import { lookupMembers, type MemberDirectory } from '../../lib/estiva-id/directory'
import { naddrToAddr } from '../../lib/nostr/nip19'
import { Store } from '../../src/store'
import type { FolderState, Issue, Project } from '../../src/fold'
import type { Directory } from '../../src/profiles'
import type { Ctx } from './context'
import { href, parse, replace, start, type Route } from './router'
import { avatar, dropdown, h, participants, short } from './ui'
import { issuesView } from './views/issues'
import { projectsView } from './views/projects'
import { projectView } from './views/project'
import { issueView } from './views/issue'

/**
 * Substituted by esbuild at build time — see `build.mjs`.
 *
 * Declared rather than imported because the value belongs to the deployment,
 * not to the source: a build for the hosted relay and a build for a laptop are
 * the same code pointed at two different workspaces.
 */
declare const __RELAY_URL__: string
declare const __ID_BASE__: string
declare const __CLIENT_ID__: string

const RELAY_URL = __RELAY_URL__

/**
 * Estiva ID, when this build has one (PEEK-47).
 *
 * Empty means sign-in is not offered and the app runs anonymous-only. That is
 * not a degraded mode — it is the path that demonstrates an independent client
 * with no account participating in the shared record, which is a large part of
 * what this app is for.
 */
const ID_CONFIG = __ID_BASE__ ? { base: __ID_BASE__, clientId: __CLIENT_ID__ } : null
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

/**
 * Who is signing, decided once at boot.
 *
 * Signed in: Estiva ID holds the key and this process never sees one. Signed
 * out: a throwaway per-browser key, exactly as before. `Store` cannot tell the
 * difference, which is the whole point of the signer seam (PEEK-44).
 */
let estivaSession = ID_CONFIG ? currentSession() : null
const signer: Signer =
  ID_CONFIG && estivaSession
    ? estivaIdSigner({ base: ID_CONFIG.base, pubkey: estivaSession.pubkey, token: estivaSession.token })
    : localSigner('ship.secretkey')

const signedIn = () => estivaSession !== null
const store = new Store(new Relay(RELAY_URL, signer), signer)

/**
 * The name to show for whoever is using this app.
 *
 * Read from the relay's `kind:0` exactly like anybody else's — Estiva ID
 * publishes it and this app does not (PEEK-48).
 *
 * **Signed out there is no name, and a truncated pubkey is the right answer.**
 * That was the open question on the ticket, decided here rather than left to
 * fall out: an anonymous participant genuinely is anonymous, and a
 * locally-invented nickname would be this app asserting an identity no other
 * app can see — the exact confusion the single-writer rule exists to remove.
 * You are either somebody the ecosystem knows, or a key.
 */
function displayName(): string {
  return directory.get(signer.pubkey)?.name ?? `${signer.pubkey.slice(0, 8)}…`
}

let state: FolderState = { projects: [], issues: [], activity: [], conversations: [] }
let route: Route = { name: 'issues' }
let poll: ReturnType<typeof setInterval> | undefined

/**
 * Who everyone is, from `kind:0`.
 *
 * Populated from the relay, not from anything this app stores — the names in
 * here were mostly written by Peek, about people who have never opened
 * Ship. That is the entire mechanism behind "the same person in both
 * apps": neither app has the other's user table, both read the same profiles.
 */
let directory: Directory = new Map()

/**
 * Who among them has an Estiva ID account, and what it knows (PEEK-50).
 *
 * Separate from `directory` because the two have different sources, different
 * audiences and different lifetimes. `directory` is `kind:0` off the relay and
 * is readable by anyone, including apps nobody here wrote. This is the private
 * half — email, role, status — behind a bearer token, and it stays empty for
 * an anonymous browser because an anonymous browser is not a member of the
 * workspace and has no business reading colleagues' contact details.
 *
 * Merging them into one map would lose exactly that distinction, which is the
 * distinction the whole two-channel design exists to make.
 */
let members: MemberDirectory = new Map()

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

const isMe = (pubkey: string) => pubkey === signer.pubkey
const nameOf = (pubkey: string) => directory.get(pubkey)?.name ?? short(pubkey)
const who = (pubkey: string) => (isMe(pubkey) ? 'you' : nameOf(pubkey))

/**
 * A name plus whatever actually identifies the person (PEEK-50).
 *
 * The handle wins over a truncated key when there is one. Both disambiguate, but
 * a handle is readable and is unique *by construction* — Buzz canonicalises
 * `nip05` to the relay's own domain and will not let two people claim the same
 * one — whereas eight hex characters are unique only in practice and mean
 * nothing to a person reading them.
 *
 * Somebody with no name at all is already shown as a short key, and appending
 * their handle to it would be two identifiers and no name.
 */
function label(pubkey: string): string {
  const name = nameOf(pubkey)
  if (name === short(pubkey)) return name
  const handle = directory.get(pubkey)?.nip05
  return `${name} (${handle ?? short(pubkey)})`
}

/**
 * Learn who a set of pubkeys are.
 *
 * `refresh` distinguishes the two callers. A navigation or an explicit reload
 * re-reads every profile, so a rename made in Peek shows up on the next screen
 * you open. The five-second poll asks only about keys it has never seen, so
 * sitting on an issue does not re-query the whole cast every tick for names
 * that almost never change.
 *
 * Failure is swallowed: a missing name degrades to a truncated pubkey, which is
 * where this app started, and is not worth a banner over an issue list that
 * loaded fine.
 */
async function learn(pubkeys: string[], refresh: boolean): Promise<void> {
  const wanted = refresh ? pubkeys : pubkeys.filter((pubkey) => !directory.has(pubkey))
  if (!wanted.length) return
  try {
    for (const [pubkey, profile] of await store.profiles(wanted)) directory.set(pubkey, profile)
  } catch {
    // Names are a nicety; the record is what matters and it already loaded.
  }

  // The private half, and only when there is a token to ask with. Not chained
  // to the `kind:0` fetch succeeding: they are independent sources, and a relay
  // that failed to return profiles says nothing about whether Estiva ID can
  // answer.
  if (ID_CONFIG && estivaSession) {
    for (const [pubkey, member] of await lookupMembers(ID_CONFIG, estivaSession, wanted)) {
      members.set(pubkey, member)
    }
  }
}

/**
 * Everyone visible in the current state — the directory's fetch list.
 *
 * **Always including yourself**, even when you appear nowhere. Without that, a
 * person who has not yet touched anything is never looked up, so the profile
 * menu shows their raw key and — since PEEK-50 — none of their contact details,
 * on the one screen whose entire job is saying who you are. Somebody's first
 * visit is exactly when that looks broken.
 */
function peopleIn(snapshot: FolderState): string[] {
  const seen = participants({
    projects: snapshot.projects,
    issues: snapshot.issues,
    conversations: snapshot.conversations,
    changes: snapshot.activity,
  })
  return seen.includes(signer.pubkey) ? seen : [signer.pubkey, ...seen]
}

function context(): Ctx {
  return {
    store,
    signer,
    state,
    route,
    // Sorted by how they are labelled rather than by key: a picker ordered by
    // hex is ordered by nothing a person can see.
    people: peopleIn(state).sort((a, b) => label(a).localeCompare(label(b))),
    say,
    publish,
    reload: () => load(),
    isMe,
    who,
    nameOf,
    profile: (pubkey: string) => directory.get(pubkey),
    member: (pubkey: string) => members.get(pubkey),
    label,
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

  const active = state.projects.filter((project) => !project.archived)
  const archivedAddrs = new Set(
    state.projects.filter((project) => project.archived).map((project) => project.addr),
  )
  const open = state.issues.filter(
    (issue) =>
      issue.status !== 'done' &&
      issue.status !== 'cancelled' &&
      !archivedAddrs.has(issue.projectAddr ?? ''),
  ).length

  el.sidebar.append(
    h(
      'div',
      { class: 'nav-group' },
      link('Issues', { name: 'issues' }, open, route.name === 'issues'),
      link(
        'Projects',
        { name: 'projects', archived: false },
        active.length,
        route.name === 'projects',
      ),
    ),
  )

  // Archived projects are out of the navigation entirely. They are still one
  // click away from the Projects surface, which is where you go when you are
  // looking for something rather than working on it.
  if (active.length) {
    const group = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label', text: 'Projects' }))
    for (const project of active) {
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
  const me = directory.get(signer.pubkey)
  el.profile.replaceChildren(
    dropdown({
      label: displayName(),
      icon: avatar({ pubkey: signer.pubkey, profile: me, title: 'you', size: 20 }),
      build: (close) => {
        const panel = h(
          'div',
          {},
          h('div', { class: 'menu-label', text: signedIn() ? 'Signed in as' : 'Acting as' }),
          h('div', { class: 'menu-value', text: displayName() }),
          h('div', {
            class: 'dim tiny menu-value',
            text: signedIn()
              ? 'Your Estiva ID. The same person you are in Estiva Peek.'
              : 'A key held by this browser only. Nobody else knows who you are.',
          }),
          // Your own private half (PEEK-50). Shown here because this menu is
          // already the "who am I" surface, and seeing your email next to a
          // profile that demonstrably does not contain it is the clearest way
          // to understand the two-channel split.
          members.get(signer.pubkey)?.email
            ? h('div', {
                class: 'dim tiny menu-value',
                text: `${members.get(signer.pubkey)?.email} · known to Estiva, never published to the relay`,
              })
            : null,
          h('div', { class: 'mono tiny dim break menu-value', text: signer.pubkey }),
          h('div', { class: 'menu-label', text: 'Workspace' }),
          h('div', { class: 'mono tiny dim break menu-value', text: RELAY_URL }),
          h('div', {
            class: 'dim tiny menu-value',
            text: 'Everyone on this relay shares this workspace, in every app.',
          }),
        )
        /**
         * Renaming is not this app's business at all any more (PEEK-48).
         *
         * Signed in, the profile belongs to Estiva ID — sole publisher of
         * `kind:0`, and `/sign` refuses one for every app regardless. Signed
         * out there is nobody to rename: the key has no profile, by decision.
         * Offering a rename in either case would imply this app owns something
         * it does not.
         */
        if (signedIn() && ID_CONFIG) {
          const account = h('a', {
            class: 'menu-item',
            text: 'Edit your profile in Estiva ID',
          }) as HTMLAnchorElement
          account.href = ID_CONFIG.base
          account.target = '_blank'
          account.rel = 'noreferrer'
          panel.append(account)
        }

        const copy = h('button', { class: 'menu-item', text: 'Copy my public key' })
        copy.onclick = async () => {
          close()
          try {
            await navigator.clipboard.writeText(signer.pubkey)
            say('Public key copied.')
          } catch {
            window.prompt('Copy your public key:', signer.pubkey)
          }
        }
        panel.append(copy)

        /**
         * Signing out returns to the anonymous key, not to an error screen.
         *
         * That path is not a fallback for when identity is unavailable — it is
         * the demonstration that an independent client with no account can
         * still take part in the shared record, which is a large part of what
         * this app is for (PEEK-47).
         */
        if (ID_CONFIG) {
          const auth = h('button', {
            class: 'menu-item',
            text: signedIn() ? 'Sign out' : 'Sign in with Estiva ID',
          })
          auth.onclick = () => {
            close()
            if (signedIn()) {
              signOut()
              location.reload()
            } else {
              void beginSignIn(ID_CONFIG)
            }
          }
          panel.append(auth)
        }

        return panel
      },
    }),
  )
}

// ── Loading and rendering ───────────────────────────────────────────────────

async function load(): Promise<void> {
  try {
    state = await store.loadAll()
    await learn(peopleIn(state), true)
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
    // Only the newcomers: whoever just commented is very likely the one author
    // on screen we have no name for yet.
    await learn(peopleIn(next), false)
    render()
  } catch {
    // A failed poll is not worth a banner: the user did not ask for it, and the
    // next tick will either succeed or the next explicit action will report it.
  }
}

function fingerprint(snapshot: FolderState): string {
  const messages = snapshot.conversations.reduce((n, c) => n + 1 + c.replies.length, 0)
  return [
    snapshot.projects.length,
    snapshot.issues.length,
    snapshot.activity.length,
    messages,
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
      ? projectsView(ctx, route.archived)
      : route.name === 'project'
        ? projectView(ctx, route.addr, route.view, RELAY_URL)
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

/**
 * Coming back from Estiva ID.
 *
 * Handled before anything else runs, and it ends in a reload rather than
 * continuing: the signer is chosen once, at module load, from whatever session
 * exists then. Exchanging the code and carrying on would leave the app holding
 * the anonymous signer for the rest of the page's life, having just signed in.
 *
 * One extra load, only on the callback, in exchange for not threading async
 * identity through every module-level consumer of `signer`.
 */
async function finishSignIn(): Promise<boolean> {
  if (!ID_CONFIG) return false
  const params = new URLSearchParams(location.search)
  if (!params.has('code') && !params.has('error')) return false

  el.main.replaceChildren(h('p', { class: 'dim', text: 'Signing you in…' }))
  const outcome = await completeSignIn(ID_CONFIG)
  if (outcome.kind === 'failed') {
    // Not a reload: the person should read this rather than watch it flash past.
    el.main.replaceChildren(
      h('p', { class: 'error', text: outcome.reason }),
      h('p', { class: 'dim tiny', text: 'You can keep using the app signed out.' }),
    )
    return true
  }
  location.reload()
  return true
}

function boot() {
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
}

// The callback path renders its own thing and reloads, so the app only boots
// when this page load is not the tail of a sign-in.
void finishSignIn().then((handled) => {
  if (!handled) boot()
})

// A tab that was hidden for ten minutes should not show ten-minute-old state
// the moment it is looked at again.
addEventListener('visibilitychange', () => {
  if (!document.hidden && poll) void refresh()
})
