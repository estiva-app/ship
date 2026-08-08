/**
 * All issues in the workspace — every project's Folder, plus the inbox.
 *
 * The list is the union across containers, which is why it exists as its own
 * surface: once a project owns its Folder, "everything assigned to me" is no
 * longer answerable by opening one project.
 */
import type { Ctx } from '../context'
import { h } from '../ui'
import { issueRows } from './issue-list'
import { addIssueButton } from './new-issue'

export function issuesView(ctx: Ctx): HTMLElement {
  const mine = ctx.state.issues.filter((issue) => issue.assignee === ctx.signer.pubkey)
  const open = ctx.state.issues.filter(
    (issue) => issue.status !== 'done' && issue.status !== 'cancelled',
  )

  const filters = h('div', { class: 'tabs' })
  const scopes: [string, typeof ctx.state.issues][] = [
    ['All', ctx.state.issues],
    ['Open', open],
    ['Assigned to me', mine],
  ]

  const body = h('div')
  const draw = (issues: typeof ctx.state.issues) => body.replaceChildren(issueRows(ctx, issues))

  scopes.forEach(([label, issues], index) => {
    const tab = h('button', {
      class: `tab${index === 0 ? ' active' : ''}`,
      text: `${label} (${issues.length})`,
    })
    tab.onclick = () => {
      for (const other of Array.from(filters.children)) other.classList.remove('active')
      tab.classList.add('active')
      draw(issues)
    }
    filters.append(tab)
  })
  draw(ctx.state.issues)

  return h(
    'div',
    { class: 'surface', 'data-surface': 'issues' },
    h(
      'div',
      { class: 'surface-head' },
      h('h1', { class: 'grow', text: 'Issues' }),
      // No project selected, so this files into the workspace inbox — the form
      // says so rather than letting it be discovered afterwards.
      addIssueButton(ctx, undefined),
    ),
    filters,
    body,
  )
}
