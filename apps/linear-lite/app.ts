/**
 * Linear-lite — the UI.
 *
 * Plain DOM, no framework, no client-side state beyond "which project is
 * selected". Every mutation publishes an event and then re-reads the Folder
 * from the relay, so what you see is always the folded shared record rather
 * than an optimistic local guess. That is slower than a real tracker would be,
 * and it is the point: if the screen and the relay ever disagreed, the demo
 * would be lying.
 */
import { localIdentity, Relay } from '../../lib/nostr/relay'
import { ISSUE_STATUSES, lookupStatus, PROJECT_STATUSES } from '../../src/kinds'
import { nextRef, refPrefix, Store } from '../../src/store'
import type { Change, FolderState, Issue } from '../../src/fold'

const RELAY_URL = 'http://localhost:3000'
const FOLDER_KEY = 'linear-lite.folder'

const identity = localIdentity('linear-lite.secretkey')
const store = new Store(new Relay(RELAY_URL, identity), identity)

let folder = localStorage.getItem(FOLDER_KEY) ?? ''
let selectedProject: string | null = null
let state: FolderState = { projects: [], issues: [], activity: [], comments: new Map() }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = {
  folder: $<HTMLInputElement>('folder'),
  banner: $<HTMLDivElement>('banner'),
  whoami: $<HTMLSpanElement>('whoami'),
  projects: $<HTMLDivElement>('projects'),
  issues: $<HTMLDivElement>('issues'),
  issuesHeading: $<HTMLHeadingElement>('issues-heading'),
  activity: $<HTMLDivElement>('activity'),
  newProject: $<HTMLFormElement>('new-project'),
  newIssue: $<HTMLFormElement>('new-issue'),
}

const short = (pubkey: string) => `${pubkey.slice(0, 8)}…`
const isMe = (pubkey: string) => pubkey === identity.pubkey
const who = (pubkey: string) => (isMe(pubkey) ? 'you' : short(pubkey))

function say(message: string, kind: 'ok' | 'error' = 'ok') {
  el.banner.textContent = message
  el.banner.className = kind
  if (kind === 'ok') setTimeout(() => (el.banner.className = ''), 4000)
}

/** Every publish goes through here, because HTTP 200 does not mean accepted. */
async function publish(what: string, action: () => Promise<{ ok: boolean; reason?: string }>) {
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

function statusPill(status: string, vocab = ISSUE_STATUSES) {
  const entry = lookupStatus(vocab, status)
  const span = document.createElement('span')
  span.className = `pill status-${entry.colour}`
  span.innerHTML = `<span class="dot"></span>${entry.label}`
  return span
}

function pill(text: string) {
  const span = document.createElement('span')
  span.className = 'pill'
  span.textContent = text
  return span
}

function renderProjects() {
  el.projects.replaceChildren()
  if (!state.projects.length) {
    el.projects.innerHTML = '<div class="empty">No projects yet.</div>'
    return
  }
  const all = document.createElement('div')
  all.className = `card${selectedProject === null ? ' selected' : ''}`
  all.innerHTML = `<h3>All issues</h3><div class="pill">${state.issues.length} total</div>`
  all.onclick = () => {
    selectedProject = null
    render()
  }
  el.projects.append(all)

  for (const project of state.projects) {
    const count = state.issues.filter((i) => i.projectAddr === project.addr).length
    const card = document.createElement('div')
    card.className = `card${selectedProject === project.addr ? ' selected' : ''}`
    const heading = document.createElement('h3')
    heading.textContent = project.title
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.append(statusPill(project.status, PROJECT_STATUSES), pill(`${count} issue${count === 1 ? '' : 's'}`))
    if (!isMe(project.author)) meta.append(pill(`by ${short(project.author)}`))
    card.append(heading, meta)
    card.onclick = () => {
      selectedProject = project.addr
      render()
    }
    el.projects.append(card)
  }
}

/** The status picker is the one control that publishes a kind:1851. */
function statusPicker(issue: Issue) {
  const select = document.createElement('select')
  for (const entry of ISSUE_STATUSES) {
    const option = document.createElement('option')
    option.value = entry.value
    option.textContent = entry.label
    option.selected = entry.value === issue.status
    select.append(option)
  }
  // A status Linear-lite does not know about still has to be selectable-away
  // from, so show it rather than silently snapping to Todo.
  if (!ISSUE_STATUSES.some((entry) => entry.value === issue.status)) {
    const option = document.createElement('option')
    option.value = issue.status
    option.textContent = `${issue.status} (unknown)`
    option.selected = true
    select.prepend(option)
  }
  select.onchange = async () => {
    select.disabled = true
    const ok = await publish('Status change', () =>
      store.setField({
        folder,
        target: issue.addr,
        field: 'status',
        value: select.value,
        note: `status → ${select.value}`,
      }),
    )
    if (ok) await load()
    else select.disabled = false
  }
  return select
}

function assigneeButton(issue: Issue) {
  const button = document.createElement('button')
  const assigned = issue.assignee && issue.assignee !== ''
  button.textContent = assigned ? (isMe(issue.assignee!) ? 'Unassign me' : `Take from ${short(issue.assignee!)}`) : 'Assign to me'
  button.onclick = async () => {
    button.disabled = true
    // Unassigning writes an empty value rather than deleting the change. An
    // append-only stream has no "undo"; "set to nothing" is a fact like any
    // other, and it keeps the activity feed truthful about what happened.
    const value = assigned && isMe(issue.assignee!) ? '' : identity.pubkey
    const ok = await publish('Assignment', () =>
      store.setField({
        folder,
        target: issue.addr,
        field: 'assignee',
        value,
        note: value ? 'assigned' : 'unassigned',
      }),
    )
    if (ok) await load()
    else button.disabled = false
  }
  return button
}

function renderIssues() {
  const project = state.projects.find((p) => p.addr === selectedProject)
  el.issuesHeading.textContent = project ? `Issues · ${project.title}` : 'Issues · all'

  const visible = selectedProject
    ? state.issues.filter((issue) => issue.projectAddr === selectedProject)
    : state.issues

  el.issues.replaceChildren()
  if (!visible.length) {
    el.issues.innerHTML = '<div class="empty">No issues yet.</div>'
    return
  }

  for (const issue of visible) {
    const row = document.createElement('div')
    row.className = 'row'

    const grow = document.createElement('div')
    grow.className = 'grow'
    const heading = document.createElement('h3')
    heading.textContent = issue.title
    grow.append(heading)
    if (issue.description) {
      const description = document.createElement('div')
      description.className = 'dim'
      description.textContent = issue.description
      grow.append(description)
    }

    const meta = document.createElement('div')
    meta.className = 'meta'
    if (issue.ref) meta.append(pill(issue.ref))
    meta.append(statusPill(issue.status))
    if (issue.assignee) meta.append(pill(`@${who(issue.assignee)}`))
    meta.append(pill(`opened by ${who(issue.author)}`))
    // Provenance from the fold: who actually set the status, which is usually
    // not the person who opened the issue. This is the visible payoff of §1.3.
    const statusField = issue.fields.status
    if (statusField) meta.append(pill(`status set by ${who(statusField.by)}`))
    grow.append(meta)

    row.append(grow, statusPicker(issue), assigneeButton(issue))
    el.issues.append(row)
  }
}

function describe(change: Change) {
  const target =
    state.issues.find((issue) => issue.addr === change.target) ??
    state.projects.find((project) => project.addr === change.target)
  const name = target ? target.title : change.target
  // A pubkey is a value like any other to the fold, but 64 hex characters in a
  // feed is unreadable. The manifest will say `as: "pubkey"` for exactly this
  // reason (LINEAR_LITE_SPEC.md §2); until then, recognise the shape.
  const value =
    change.value === ''
      ? '(none)'
      : /^[0-9a-f]{64}$/.test(change.value)
        ? who(change.value)
        : change.value
  return `${who(change.author)} set ${change.field} to ${value} on ${name}`
}

function renderActivity() {
  el.activity.replaceChildren()
  if (!state.activity.length) {
    el.activity.innerHTML = '<div class="empty">Nothing has changed yet.</div>'
    return
  }
  // Newest first for reading; the fold itself consumes them oldest first.
  for (const change of [...state.activity].reverse()) {
    const item = document.createElement('div')
    item.className = 'feed-item'
    const text = document.createElement('div')
    text.textContent = describe(change)
    const when = document.createElement('div')
    when.className = 'when'
    when.textContent = new Date(change.createdAt * 1000).toLocaleString()
    item.append(text, when)
    el.activity.append(item)
  }
}

function render() {
  renderProjects()
  renderIssues()
  renderActivity()
}

async function load() {
  if (!folder) {
    state = { projects: [], issues: [], activity: [], comments: new Map() }
    render()
    return
  }
  try {
    state = await store.loadFolder(folder)
    if (selectedProject && !state.projects.some((p) => p.addr === selectedProject)) {
      selectedProject = null
    }
    render()
  } catch (error) {
    say(`Could not read the Folder — ${(error as Error).message}`, 'error')
  }
}

async function openFolder(id: string, { create = false } = {}) {
  folder = id.trim().toLowerCase()
  el.folder.value = folder
  localStorage.setItem(FOLDER_KEY, folder)
  selectedProject = null
  if (create) {
    // FRICTION.md A4: the Folder has to exist before anything can go into it,
    // and a duplicate create is reported as success.
    const ok = await publish('Folder create', () =>
      store.ensureFolder(folder, `linear-lite-${folder.slice(0, 8)}`),
    )
    if (ok) say(`Folder ready — ${folder}`)
  }
  await load()
}

el.whoami.textContent = `you: ${short(identity.pubkey)}`
el.folder.value = folder

$('open').onclick = () => {
  // Opening an existing Folder still runs the create, because a Folder someone
  // else made is one we are not a member of, and the relay would reject our
  // writes with a membership error rather than an obvious one. A duplicate
  // create is harmless; a missing one is a confusing failure ten steps later.
  if (el.folder.value.trim()) void openFolder(el.folder.value, { create: true })
}
$('new-folder').onclick = () => void openFolder(crypto.randomUUID(), { create: true })
$('reload').onclick = () => void load()

el.newProject.onsubmit = async (event) => {
  event.preventDefault()
  if (!folder) return say('Open or create a Folder first.', 'error')
  const form = new FormData(el.newProject)
  const ok = await publish('Project', async () => {
    const { result } = await store.createProject({
      folder,
      title: String(form.get('title')),
      description: String(form.get('description') ?? ''),
    })
    return result
  })
  if (ok) {
    el.newProject.reset()
    await load()
  }
}

el.newIssue.onsubmit = async (event) => {
  event.preventDefault()
  if (!folder) return say('Open or create a Folder first.', 'error')
  const form = new FormData(el.newIssue)
  const project = state.projects.find((p) => p.addr === selectedProject)
  const ok = await publish('Issue', async () => {
    const { result } = await store.createIssue({
      folder,
      title: String(form.get('title')),
      description: String(form.get('description') ?? ''),
      projectAddr: project?.addr,
      ref: nextRef(
        project ? refPrefix(project.title) : 'LL',
        state.issues.map((issue) => issue.ref),
      ),
    })
    return result
  })
  if (ok) {
    el.newIssue.reset()
    await load()
  }
}

void load()
