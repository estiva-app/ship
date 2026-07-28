/**
 * The create-issue form.
 *
 * One module because two surfaces need it and they must not disagree about
 * *which Folder the issue lands in*. That is the single decision this model
 * makes easy to get wrong, and it has exactly one right answer: the project's
 * Folder, because a project **is** a Folder.
 *
 * Which is also why an issue cannot be filed without a project. There is no
 * workspace container to fall back to and no inbox — every event needs an `h`,
 * and the only Folders in this app are projects. Opened from the issue list,
 * the form asks which one; opened from a project, it already knows.
 */
import { nextRef, refPrefix } from '../../../src/store'
import type { Project } from '../../../src/fold'
import type { Ctx } from '../context'
import { empty, h, openModal } from '../ui'

/**
 * "Add issue", opening the form in a modal.
 *
 * The form used to sit permanently above the list. On a project page that put a
 * two-field form between the reader and the work, on every visit, for the one
 * action they had probably already taken.
 */
export function addIssueButton(ctx: Ctx, project: Project | undefined): HTMLButtonElement {
  const button = h('button', { class: 'primary', text: 'Add issue' })
  button.onclick = () => {
    const close = openModal({
      title: project ? `New issue in ${project.title}` : 'New issue',
      body: newIssueForm(ctx, project, () => close()),
    })
  }
  return button
}

export function newIssueForm(
  ctx: Ctx,
  project: Project | undefined,
  onDone?: () => void,
): HTMLElement {
  // Nothing can be filed yet, and saying so beats a form whose submit button
  // silently does nothing.
  if (!project && !ctx.state.projects.length) {
    return empty('Create a project first — an issue lives in a project’s Folder.')
  }

  const form = h('form', { class: 'new-issue' })
  const title = h('input', {
    name: 'title',
    placeholder: project ? `New issue in ${project.title}` : 'Issue title',
    required: true,
  })
  const description = h('textarea', { name: 'description', placeholder: 'Description (optional)' })

  // Only when the surface has not already fixed it.
  const picker = h('select', { name: 'project' })
  if (!project) {
    for (const candidate of ctx.state.projects) {
      picker.append(h('option', { value: candidate.addr, text: candidate.title }))
    }
  }

  const submit = h('button', { class: 'primary', type: 'submit', text: 'Create issue' })
  form.append(title, description)
  if (!project) form.append(h('label', { class: 'field-label', text: 'Project' }), picker)
  form.append(submit)

  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!title.value.trim()) return
    const target = project ?? ctx.state.projects.find((p) => p.addr === picker.value)
    if (!target) return ctx.say('Pick a project for this issue.', 'error')

    submit.disabled = true
    const ok = await ctx.publish('Issue', async () => {
      const { result } = await ctx.store.createIssue({
        folder: ctx.folderForProject(target),
        title: title.value.trim(),
        description: description.value.trim(),
        projectAddr: target.addr,
        // Display-only, and derived from what we can currently see — two people
        // filing at once can collide. The address is the identity; this is a
        // label (LINEAR_LITE_SPEC.md §1.2).
        ref: nextRef(
          refPrefix(target.title),
          ctx.state.issues.map((issue) => issue.ref),
        ),
      })
      return result
    })

    submit.disabled = false
    if (ok) {
      form.reset()
      onDone?.()
      await ctx.reload()
    }
  }
  return form
}
