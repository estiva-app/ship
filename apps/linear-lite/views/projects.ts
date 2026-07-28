/**
 * The projects list.
 *
 * Reads only the workspace Folder — this is the surface the two-Folder split
 * bought. If project records lived in their own containers, drawing this screen
 * would mean opening every project first.
 */
import { PROJECT_STATUSES } from '../../../src/kinds'
import { parseFolderLink } from '../../../src/events'
import type { Ctx } from '../context'
import { href } from '../router'
import { ago, empty, explainRejection, h, openModal, pill, statusPill } from '../ui'

export function projectsView(ctx: Ctx, showArchived: boolean): HTMLElement {
  const active = ctx.state.projects.filter((project) => !project.archived)
  const archived = ctx.state.projects.filter((project) => project.archived)
  const shown = showArchived ? archived : active
  const list = h('div', { class: 'cards' })

  if (!shown.length) {
    list.append(
      empty(
        showArchived
          ? 'Nothing archived.'
          : 'No projects yet. Create one to get a Folder you can share with Peek.',
      ),
    )
  }

  for (const project of shown) {
    const issues = ctx.state.issues.filter((issue) => issue.projectAddr === project.addr)
    const done = issues.filter((issue) => issue.status === 'done').length
    const meta = h(
      'div',
      { class: 'meta' },
      statusPill(project.status, PROJECT_STATUSES),
      pill(`${issues.length} issue${issues.length === 1 ? '' : 's'}`),
      issues.length > 0 && pill(`${done}/${issues.length} done`),
      pill(`by ${ctx.who(project.author)} · ${ago(project.createdAt)}`),
      project.archived && pill('Archived'),
    )
    list.append(
      h(
        'a',
        {
          class: 'card',
          href: href({ name: 'project', addr: project.addr, view: 'table' }),
        },
        h('h3', { text: project.title }),
        project.description && h('div', { class: 'dim clamp', text: project.description }),
        meta,
      ),
    )
  }

  // The toggle only appears when there is something behind it — an
  // "Archived (0)" control is noise on the common path.
  const tabs = h('div', { class: 'tabs' })
  if (archived.length) {
    for (const [label, wantArchived] of [
      [`Active (${active.length})`, false],
      [`Archived (${archived.length})`, true],
    ] as [string, boolean][]) {
      tabs.append(
        h('a', {
          class: `tab${showArchived === wantArchived ? ' active' : ''}`,
          href: href({ name: 'projects', archived: wantArchived }),
          text: label,
        }),
      )
    }
  }

  return h(
    'div',
    { class: 'surface', 'data-surface': 'projects' },
    h(
      'div',
      { class: 'surface-head' },
      h('h1', { class: 'grow', text: 'Projects' }),
      addProjectButton(ctx),
    ),
    archived.length ? tabs : h('div'),
    list,
  )
}

/** "Add project", opening the form in a modal rather than parking it on the page. */
export function addProjectButton(ctx: Ctx): HTMLButtonElement {
  const button = h('button', { class: 'primary', text: 'Add project' })
  button.onclick = () => {
    const close = openModal({ title: 'New project', body: newProjectForm(ctx, () => close()) })
  }
  return button
}

/**
 * Create a project — and, unless told otherwise, its Folder.
 *
 * The "pair with an existing Folder" field is PEEK-17's from-Linear half, and
 * with a project being a Folder there is nothing more to it than that: paste a
 * Peek topic's Folder link and the project is created *in* the topic, so they
 * are one container from the first event. No linking step to forget. Leaving it
 * blank creates a fresh Folder, which is the common case.
 */
function newProjectForm(ctx: Ctx, onDone?: () => void): HTMLFormElement {
  const form = h('form', { class: 'new-project' })
  const title = h('input', { name: 'title', placeholder: 'New project title', required: true })
  const description = h('textarea', { name: 'description', placeholder: 'Description (optional)' })
  const pair = h('input', {
    name: 'folder',
    class: 'mono',
    placeholder: 'Pair with an existing Folder — paste a Peek topic link (optional)',
  })
  const submit = h('button', { class: 'primary', type: 'submit', text: 'Create project' })
  form.append(title, description, pair, submit)

  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!title.value.trim()) return

    // Validate before publishing anything. A bad Folder id would otherwise
    // create the project and fail on the second write, leaving a record
    // pointing at a container that does not exist.
    let folder: string | undefined
    if (pair.value.trim()) {
      const parsed = parseFolderLink(pair.value)
      if (!parsed) {
        ctx.say('That does not look like a Folder link or a UUID.', 'error')
        return
      }
      folder = parsed
    }

    submit.disabled = true
    const ok = await ctx.publish('Project', async () => {
      const { result } = await ctx.store.createProject({
        title: title.value.trim(),
        description: description.value.trim(),
        folder,
      })
      // A paired create is the one place a rejection has a specific, fixable
      // cause worth naming.
      if (!result.ok && folder) {
        return { ok: false, reason: explainRejection(result.reason, folder) }
      }
      return result
    })
    submit.disabled = false

    if (ok) {
      form.reset()
      onDone?.()
      ctx.say(
        folder
          ? 'Project created in the Folder you pasted — it and that topic are now one container.'
          : 'Project created, with its own Folder.',
      )
      await ctx.reload()
    }
  }
  return form
}
