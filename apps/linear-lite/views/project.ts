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
import { href, type ProjectView } from '../router'
import { ago, assigneeSelect, editableText, empty, h, pill, statusPill, vocabSelect } from '../ui'
import { issueBoard, issueTable } from './issue-list'
import { addIssueButton } from './new-issue'
import { thread } from './thread'

export function projectView(ctx: Ctx, addr: string, view: ProjectView): HTMLElement {
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
      h('a', { href: href({ name: 'projects' }), text: 'Projects' }),
      h('span', { class: 'sep', text: '/' }),
      h('span', { class: 'dim', text: project.title }),
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
        h('h2', { text: 'Comments' }),
        // The project's conversation lives in the project's Folder — the same
        // container as the Peek topic, when one is paired. That is what makes a
        // comment here and a message there part of one thread rather than two.
        thread(ctx, { target: project.addr, folder: contentFolder }),
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
      ),
    ),
  )
}

function field(label: string, control: Node): HTMLElement {
  return h('div', { class: 'field' }, h('label', { text: label }), control)
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
    const ok = await ctx.publish('Folder link', () =>
      ctx.store.linkProjectFolder({
        recordFolder: project.originFolder,
        project: project.addr,
        folder: parsed,
      }),
    )
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
