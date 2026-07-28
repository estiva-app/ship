/**
 * Issue detail — the surface a reference from Peek lands on.
 *
 * Everything here is an event: the status dropdown, the assignee picker, the
 * project it belongs to, even a typo fix in the title. All of them are
 * `kind:1851` changes rather than edits to the root, so somebody who did not
 * author the issue can still act on it — which is the same reason Peek can act
 * on it, and the two paths publish byte-identical events.
 */
import { ISSUE_STATUSES, PROJECT_STATUSES } from '../../../src/kinds'
import { addrToNaddr } from '../../../lib/nostr/nip19'
import { conversationsAbout, type Issue } from '../../../src/fold'
import type { Ctx } from '../context'
import { href } from '../router'
import { ago, assigneeSelect, editableText, empty, h, pill, short, statusPill, vocabSelect } from '../ui'
import { conversations } from './conversations'

export function issueView(ctx: Ctx, addr: string, relayUrl: string): HTMLElement {
  const issue = ctx.state.issues.find((candidate) => candidate.addr === addr)
  if (!issue) {
    return h(
      'div',
      { class: 'surface', 'data-surface': 'issue-missing' },
      empty(
        'That issue is not in this workspace. It may live in a Folder you cannot read, ' +
          'or the link may point at a different workspace.',
      ),
    )
  }

  const project = ctx.state.projects.find((candidate) => candidate.addr === issue.projectAddr)
  const folder = ctx.folderOf(issue)

  /** Every field edit on this surface is the same publish. */
  const set = async (field: string, value: string, note: string) => {
    const ok = await ctx.publish(note, () =>
      ctx.store.setField({ folder, target: issue.addr, field, value, note }),
    )
    if (ok) await ctx.reload()
    return ok
  }

  const crumbs = h(
    'div',
    { class: 'crumbs' },
    h('a', { href: href({ name: 'issues' }), text: 'Issues' }),
    h('span', { class: 'sep', text: '/' }),
    project
      ? h('a', {
          href: href({ name: 'project', addr: project.addr, view: 'table' }),
          text: project.title,
        })
      : h('span', { class: 'dim', text: 'Inbox' }),
    issue.ref && h('span', { class: 'sep', text: '/' }),
    issue.ref && h('span', { class: 'mono dim', text: issue.ref }),
  )

  const title = editableText({
    value: issue.title,
    placeholder: 'Untitled issue',
    className: 'title-input',
    onCommit: (value) => set('title', value, 'Rename'),
  })

  const description = editableText({
    value: issue.description,
    placeholder: 'Add a description…',
    multiline: true,
    className: 'description',
    onCommit: (value) => set('description', value, 'Description'),
  })

  return h(
    'div',
    { class: 'surface detail', 'data-surface': 'issue', 'data-addr': issue.addr },
    crumbs,
    h('div', { class: 'detail-main' },
      h('div', { class: 'detail-body' },
        h('h1', {}, title),
        description,
        h('h2', { text: 'Conversations' }),
        // Threads that mention this issue anywhere — including ones started in
        // Peek before the issue came up, which is the context somebody needs.
        conversations(ctx, {
          list: conversationsAbout(ctx.state.conversations, issue.addr),
          folder,
          about: issue.addr,
          withReference: true,
          relayUrl,
        }),
        h('h2', { text: 'Activity' }),
        activity(ctx, issue),
      ),
      h('aside', { class: 'detail-side' },
        field('Status', vocabSelect({
          vocab: ISSUE_STATUSES,
          value: issue.status,
          onChange: (value) => set('status', value, `Status → ${value}`),
        })),
        field('Assignee', assigneeSelect({
          people: ctx.people,
          value: issue.assignee,
          me: ctx.identity.pubkey,
          onChange: (value) => set('assignee', value, value ? 'Assign' : 'Unassign'),
        })),
        field('Project', projectSelect(ctx, issue, set)),
        provenance(ctx, issue),
        h('div', { class: 'side-actions' }, copyRefButton(ctx, issue, relayUrl)),
      ),
    ),
  )
}

function field(label: string, control: Node): HTMLElement {
  return h('div', { class: 'field' }, h('label', { text: label }), control)
}

/**
 * Move an issue between projects.
 *
 * Sets the `project` field, which the fold prefers over the root's `a` tag. The
 * issue's *events* do not move Folder — they cannot, being immutable — so a
 * moved issue is still read out of its original container. That is a real
 * wrinkle rather than a hidden one: it is why `loadWorkspace` reads the union
 * of every Folder a project has ever pointed at.
 */
function projectSelect(
  ctx: Ctx,
  issue: Issue,
  set: (field: string, value: string, note: string) => Promise<boolean>,
): HTMLSelectElement {
  const select = h('select')
  select.append(h('option', { value: '', text: 'Inbox (no project)' }))
  for (const project of ctx.state.projects) {
    const option = h('option', { value: project.addr, text: project.title })
    option.selected = project.addr === issue.projectAddr
    select.append(option)
  }
  select.value = issue.projectAddr ?? ''
  select.onchange = async () => {
    select.disabled = true
    const target = ctx.state.projects.find((p) => p.addr === select.value)
    const ok = await set('project', select.value, `Move to ${target?.title ?? 'Inbox'}`)
    if (!ok) {
      select.value = issue.projectAddr ?? ''
      select.disabled = false
    }
  }
  return select
}

/**
 * Who set what.
 *
 * The visible payoff of the change-event model: the person who opened an issue
 * is usually not the person who closed it, and on a shared record that
 * distinction is the whole point.
 */
function provenance(ctx: Ctx, issue: Issue): HTMLElement {
  const rows = h('div', { class: 'provenance' })
  rows.append(
    h('div', { class: 'dim tiny', text: `Opened by ${ctx.who(issue.author)} · ${ago(issue.createdAt)}` }),
  )
  for (const [name, folded] of Object.entries(issue.fields)) {
    rows.append(
      h('div', {
        class: 'dim tiny',
        text: `${name} set by ${ctx.who(folded.by)} · ${ago(folded.at)}`,
      }),
    )
  }
  return rows
}

/** This issue's slice of the change stream. */
function activity(ctx: Ctx, issue: Issue): HTMLElement {
  const changes = ctx.state.activity.filter((change) => change.target === issue.addr)
  if (!changes.length) return empty('Nothing has changed yet.')
  const feed = h('div', { class: 'feed' })
  // Newest first for reading; the fold itself consumes them oldest first.
  for (const change of [...changes].reverse()) {
    const value =
      change.value === ''
        ? '(none)'
        : /^[0-9a-f]{64}$/.test(change.value)
          ? ctx.who(change.value)
          : change.value
    feed.append(
      h(
        'div',
        { class: 'feed-item' },
        h('div', { text: `${ctx.who(change.author)} set ${change.field} to ${value}` }),
        h('div', { class: 'when', text: ago(change.createdAt) }),
      ),
    )
  }
  return feed
}

/**
 * Copy `nostr:naddr1…` — the handoff to every other app.
 *
 * NIP-21's URI scheme wrapping a NIP-19 pointer, which is what Peek scans
 * message bodies for (NIP-27). Nothing about it is Linear-lite-specific: any
 * app that can decode an naddr can resolve it, including apps that do not exist
 * yet. The relay hint travels with the pointer so the consumer does not have to
 * already know where this object lives.
 */
function copyRefButton(ctx: Ctx, issue: Issue, relayUrl: string): HTMLButtonElement {
  const button = h('button', { text: 'Copy reference for Peek' })
  button.onclick = async () => {
    const uri = `nostr:${addrToNaddr(issue.addr, [relayUrl])}`
    try {
      await navigator.clipboard.writeText(uri)
      ctx.say('Reference copied — paste it into a Peek message.')
    } catch {
      // Clipboard access needs a secure context and a user gesture, and fails
      // silently often enough that a visible fallback is worth four lines.
      window.prompt('Copy this reference:', uri)
    }
  }
  return button
}

export { PROJECT_STATUSES, pill, short, statusPill }
