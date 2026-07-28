/**
 * Project detail — one page, with the issue list toggling between table and board.
 *
 * Both issue views are one query, not two: every issue in the project is
 * already folded by the time this renders, so flipping the toggle is a redraw
 * rather than a round trip. That is what makes the board usable at all.
 *
 * The Folder panel in the sidebar is the from-Linear half of PEEK-17. A project
 * *is* a Folder's worth of work, so the id is not plumbing to hide — it is the
 * handle you paste into Peek to make the topic and the project one container.
 */
import { PROJECT_STATUSES } from '../../../src/kinds'
import { folderLink, parseFolderLink } from '../../../src/events'
import type { Issue, Project } from '../../../src/fold'
import type { Ctx } from '../context'
import { go, href, type ProjectView } from '../router'
import {
  ago,
  assigneeSelect,
  editableText,
  empty,
  explainRejection,
  h,
  pill,
  statusPill,
  vocabSelect,
} from '../ui'
import { issueBoard, issueTable } from './issue-list'
import { addIssueButton } from './new-issue'
import { conversations } from './conversations'

export function projectView(
  ctx: Ctx,
  addr: string,
  view: ProjectView,
  relayUrl: string,
): HTMLElement {
  const project = ctx.state.projects.find((candidate) => candidate.addr === addr)
  if (!project) {
    return h(
      'div',
      { class: 'surface', 'data-surface': 'project-missing' },
      empty('That project is not in this workspace, or lives in a Folder you cannot read.'),
    )
  }

  const issues = ctx.state.issues.filter((issue) => issue.projectAddr === project.addr)
  // A change to the project record has to carry the Folder the *record* is in,
  // which is normally the same as its content Folder and differs only for a
  // project that was later re-linked. Getting this wrong is rejected at ingest.
  const recordFolder = project.originFolder
  const contentFolder = project.contentFolder

  const set = async (field: string, value: string, note: string) => {
    const ok = await ctx.publish(note, () =>
      ctx.store.setField({ folder: recordFolder, target: project.addr, field, value, note }),
    )
    if (ok) await ctx.reload()
    return ok
  }

  // One page, not three. The toggle switches how the issues are drawn; the
  // title, description and conversation stay put, because they are the project
  // rather than a view of it.
  const toggle = h('div', { class: 'toggle' })
  for (const [name, label] of [
    ['table', 'Table'],
    ['board', 'Board'],
  ] as [ProjectView, string][]) {
    toggle.append(
      h('a', {
        class: `toggle-option${view === name ? ' active' : ''}`,
        href: href({ name: 'project', addr: project.addr, view: name }),
        text: label,
      }),
    )
  }

  return h(
    'div',
    // Identifies which surface is on screen, and which object it is showing.
    // Both detail views share their markup, so "the sidebar has appeared" is
    // not enough to tell them apart — during a route change the outgoing
    // surface is still in the DOM, and anything waiting on shape alone matches
    // the one that is about to be replaced.
    { class: 'surface detail', 'data-surface': 'project', 'data-addr': addr, 'data-view': view },
    h(
      'div',
      { class: 'crumbs' },
      h('a', { href: href({ name: 'projects', archived: false }), text: 'Projects' }),
      h('span', { class: 'sep', text: '/' }),
      h('span', { class: 'dim', text: project.title }),
      project.archived && pill('Archived'),
    ),
    h(
      'div',
      { class: 'detail-main' },
      h(
        'div',
        { class: 'detail-body' },
        h(
          'div',
          { class: 'surface-head' },
          h('h1', { class: 'grow' }, editableText({
            value: project.title,
            placeholder: 'Untitled project',
            className: 'title-input',
            onCommit: (value) => set('title', value, 'Rename'),
          })),
          addIssueButton(ctx, project),
        ),
        editableText({
          value: project.description,
          placeholder: 'Add a description…',
          multiline: true,
          className: 'description',
          onCommit: (value) => set('description', value, 'Description'),
        }),
        h('div', { class: 'section-head' }, h('h2', { text: 'Issues' }), toggle),
        view === 'board' ? issueBoard(ctx, issues) : issueTable(ctx, issues),
        h('h2', { text: 'Conversations' }),
        // Everything in the Folder, including threads that also appear under an
        // issue. Deliberately duplicated rather than moved: hiding a thread
        // from the project because it mentions an issue just makes people
        // wonder where it went.
        conversations(ctx, {
          list: ctx.state.conversations.filter((c) => c.root.folder === contentFolder),
          folder: contentFolder,
          about: project.addr,
          // A project conversation is already in the topic it belongs to, so a
          // reference would be noise.
          withReference: false,
          relayUrl,
        }),
      ),
      h(
        'aside',
        { class: 'detail-side' },
        field('Status', vocabSelect({
          vocab: PROJECT_STATUSES,
          value: project.status,
          onChange: (value) => set('status', value, `Status → ${value}`),
        })),
        // PEEK-22 calls this "assignee"; the spec's tag is `lead`. Same field,
        // folded rather than read off the root, so somebody who did not create
        // the project can still hand it to someone.
        field('Assignee', assigneeSelect({
          people: ctx.people,
          value: project.lead,
          me: ctx.identity.pubkey,
          onChange: (value) => set('lead', value, value ? 'Assign project' : 'Unassign project'),
        })),
        progress(issues),
        folderPanel(ctx, project, contentFolder),
        dangerZone(ctx, project, issues),
      ),
    ),
  )
}

function field(label: string, control: Node): HTMLElement {
  return h('div', { class: 'field' }, h('label', { text: label }), control)
}

/**
 * Archive and delete.
 *
 * Two operations with genuinely different reach, so they are not two styles of
 * the same button:
 *
 * **Archive** is a `kind:1851` — reversible, attributable, and available to
 * anyone in the Folder. It hides the project from the lists and nothing more.
 * This is the one almost everybody wants.
 *
 * **Delete** is a NIP-09 `kind:5`, and three things about it have to be said
 * rather than discovered. It is a *request*: relays may decline, and a copy
 * elsewhere is untouched. It is **author-only**, because NIP-09 is scoped to
 * the pubkey that signed the original — so it is simply absent for everyone
 * else rather than present and failing. And it removes the project *record*,
 * not the issues, which are separate events with their own authors; they stay
 * in the Folder and stop being reachable from here.
 *
 * Rendered as quiet links, not buttons. Nothing in this panel is a thing you
 * do often, and a red button in a sidebar reads as an invitation.
 */
function dangerZone(ctx: Ctx, project: Project, issues: Issue[]): HTMLElement {
  const panel = h('div', { class: 'danger-zone' })

  const archive = h('button', {
    class: 'link-button',
    text: project.archived ? 'Unarchive project' : 'Archive project',
  })
  archive.onclick = async () => {
    archive.disabled = true
    const ok = await ctx.publish(project.archived ? 'Unarchive' : 'Archive', () =>
      ctx.store.archiveProject({
        recordFolder: project.originFolder,
        project: project.addr,
        archived: !project.archived,
      }),
    )
    if (ok) {
      ctx.say(project.archived ? 'Project restored.' : 'Project archived.')
      await ctx.reload()
    } else archive.disabled = false
  }
  panel.append(archive)

  // NIP-09 only honours a deletion from the pubkey that signed the original, so
  // offering this to anyone else would be a button that always fails.
  if (ctx.isMe(project.author)) {
    const remove = h('button', { class: 'link-button danger', text: 'Delete project' })
    remove.onclick = async () => {
      const warning =
        `Delete “${project.title}”?\n\n` +
        'This publishes a NIP-09 deletion request. Relays may decline it, and copies ' +
        'held elsewhere are unaffected.\n\n' +
        (issues.length
          ? `Its ${issues.length} issue${issues.length === 1 ? '' : 's'} are separate events and are NOT deleted — ` +
            'they stay in the Folder and stop being reachable from here.\n\n'
          : '') +
        'Archiving is reversible and usually what you want.'
      if (!window.confirm(warning)) return
      remove.disabled = true
      const ok = await ctx.publish('Delete', () =>
        ctx.store.deleteProject({
          recordFolder: project.originFolder,
          project: project.addr,
        }),
      )
      if (ok) {
        ctx.say('Deletion requested.')
        // Nothing left to render here.
        go({ name: 'projects', archived: false })
      } else remove.disabled = false
    }
    panel.append(remove)
  }

  return panel
}

function progress(issues: Issue[]): HTMLElement {
  const done = issues.filter((issue) => issue.status === 'done').length
  const percent = issues.length ? Math.round((done / issues.length) * 100) : 0
  return h(
    'div',
    { class: 'field' },
    h('label', { text: 'Progress' }),
    h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${percent}%` })),
    h('div', { class: 'dim tiny', text: `${done} of ${issues.length} done` }),
  )
}

/**
 * The Folder this project's work lives in, and how to pair it with a Peek topic.
 *
 * Re-linking is a `kind:1851`, so anyone in the workspace can do it — usually
 * necessary, because the person who owns the Peek topic is frequently not the
 * person who created the project.
 *
 * Issues already filed under the previous Folder keep their `h` and stay
 * readable; nothing moves, because nothing can. The warning says so rather than
 * letting someone discover it afterwards.
 */
function folderPanel(ctx: Ctx, project: Project, contentFolder: string): HTMLElement {
  const panel = h('div', { class: 'field' }, h('label', { text: 'Folder' }))

  const id = h('div', { class: 'mono tiny dim break', text: contentFolder })
  const copy = h('button', { class: 'tiny-button', text: 'Copy Folder link' })
  copy.onclick = async () => {
    // A `folder:<uuid>` link, not a URL. A Folder belongs to no single app, so
    // a link pointing at Linear-lite's own port would misdescribe what it is.
    const link = folderLink(contentFolder)
    try {
      await navigator.clipboard.writeText(link)
      ctx.say('Folder link copied — paste it into Peek to pair a topic.')
    } catch {
      window.prompt('Copy this Folder link:', link)
    }
  }

  const relink = h('button', { class: 'tiny-button', text: 'Pair with another Folder…' })
  relink.onclick = async () => {
    const pasted = window.prompt(
      'Paste a Peek topic\'s Folder link.\n\n' +
        'New issues will go there. Issues already filed stay readable in the old Folder — ' +
        'events cannot move.',
    )
    if (!pasted) return
    const parsed = parseFolderLink(pasted)
    if (!parsed) return ctx.say('That does not look like a Folder link or a UUID.', 'error')
    if (parsed === contentFolder) return ctx.say('Already paired with that Folder.')
    const ok = await ctx.publish('Folder link', async () => {
      const result = await ctx.store.linkProjectFolder({
        recordFolder: project.originFolder,
        project: project.addr,
        folder: parsed,
      })
      return result.ok ? result : { ok: false, reason: explainRejection(result.reason, parsed) }
    })
    if (ok) {
      ctx.say('Paired. New issues will land in that Folder.')
      await ctx.reload()
    }
  }

  panel.append(id, h('div', { class: 'side-actions' }, copy, relink))
  if (project.fields.folder) {
    panel.append(
      h('div', {
        class: 'dim tiny',
        text: `Re-linked by ${ctx.who(project.fields.folder.by)} · ${ago(project.fields.folder.at)}`,
      }),
    )
  }
  return panel
}

export { pill, statusPill }
