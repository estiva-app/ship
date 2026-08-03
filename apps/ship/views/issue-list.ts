/**
 * The issue list, in the two shapes every surface needs.
 *
 * `rows` is the default reading view; `table` is the denser one PEEK-22 asks
 * for. Both are here rather than in their calling surfaces because the columns
 * and the grouping rule have to agree — an issue that reads as "In Progress" in
 * one and "Todo" in the other would be a bug nobody could see from either file
 * alone.
 */
import { ISSUE_STATUSES } from '../../../src/kinds'
import { conversationsAbout, type Issue } from '../../../src/fold'
import type { Ctx } from '../context'
import { href } from '../router'
import { ago, empty, h, pill, short, statusPill } from '../ui'

/** Group issues into status order, dropping empty groups. */
export function byStatus(issues: Issue[]): { status: string; label: string; issues: Issue[] }[] {
  const groups = ISSUE_STATUSES.map((entry) => ({
    status: entry.value,
    label: entry.label,
    issues: issues.filter((issue) => issue.status === entry.value),
  }))
  // Statuses another app wrote that we have no vocabulary for. Shown in their
  // own group rather than hidden, because an issue that vanishes from every
  // list is worse than one in an oddly-named column.
  const known = new Set(ISSUE_STATUSES.map((e) => e.value))
  for (const issue of issues) {
    if (known.has(issue.status)) continue
    const held = groups.find((g) => g.status === issue.status)
    if (held) held.issues.push(issue)
    else groups.push({ status: issue.status, label: issue.status, issues: [issue] })
  }
  return groups.filter((group) => group.issues.length)
}

function issueLink(issue: Issue): HTMLAnchorElement {
  return h('a', {
    class: 'issue-title',
    href: href({ name: 'issue', addr: issue.addr }),
    text: issue.title,
  })
}

/** One issue as a reading row. */
export function issueRow(ctx: Ctx, issue: Issue): HTMLElement {
  const meta = h('div', { class: 'meta' })
  if (issue.ref) meta.append(pill(issue.ref, 'mono'))
  meta.append(statusPill(issue.status))
  if (issue.assignee) meta.append(pill(`@${ctx.who(issue.assignee)}`))
  meta.append(pill(`opened by ${ctx.who(issue.author)} · ${ago(issue.createdAt)}`))

  const threads = conversationsAbout(ctx.state.conversations, issue.addr).length
  if (threads) meta.append(pill(`${threads} conversation${threads === 1 ? '' : 's'}`))

  return h(
    'div',
    { class: 'row' },
    h(
      'div',
      { class: 'grow' },
      issueLink(issue),
      issue.description && h('div', { class: 'dim clamp', text: issue.description }),
      meta,
    ),
  )
}

/** The grouped reading list. */
export function issueRows(ctx: Ctx, issues: Issue[]): HTMLElement {
  const wrap = h('div')
  if (!issues.length) return empty('No issues yet.')
  for (const group of byStatus(issues)) {
    wrap.append(
      h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'group-head' },
          statusPill(group.status),
          h('span', { class: 'count', text: String(group.issues.length) }),
        ),
        ...group.issues.map((issue) => issueRow(ctx, issue)),
      ),
    )
  }
  return wrap
}

/**
 * The table view.
 *
 * Scrolls inside its own container rather than widening the page — a title
 * column plus four metadata columns overflows a narrow window, and a
 * horizontally scrolling *page* would take the sidebar with it.
 */
export function issueTable(ctx: Ctx, issues: Issue[]): HTMLElement {
  if (!issues.length) return empty('No issues yet.')

  const head = h(
    'tr',
    {},
    ...['', 'Title', 'Status', 'Assignee', 'Opened by', 'Updated'].map((label) =>
      h('th', { text: label }),
    ),
  )
  const body = h('tbody')
  for (const issue of issues) {
    // The most recent change to *this* issue, which is what "updated" means to
    // a reader — the root event's created_at never moves.
    const touched = ctx.state.activity.filter((change) => change.target === issue.addr).at(-1)
    body.append(
      h(
        'tr',
        {},
        h('td', { class: 'mono dim', text: issue.ref ?? '' }),
        h('td', {}, issueLink(issue)),
        h('td', {}, statusPill(issue.status)),
        h('td', { class: 'dim', text: issue.assignee ? ctx.who(issue.assignee) : '—' }),
        h('td', { class: 'dim', text: ctx.who(issue.author) }),
        h('td', { class: 'dim', text: ago(touched?.createdAt ?? issue.createdAt) }),
      ),
    )
  }
  return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, head), body))
}

/**
 * The kanban board.
 *
 * Drag-and-drop with the native HTML5 API — no library, and no pointer-event
 * reimplementation. Dropping publishes a `kind:1851` exactly like the status
 * dropdown does; the board is a second way to author the same event, not a
 * second source of truth.
 *
 * The card does **not** move optimistically. Every other surface in this app
 * re-reads the relay before it redraws, and a board that snapped first would be
 * the one place where the screen leads the shared record instead of following
 * it.
 */
export function issueBoard(ctx: Ctx, issues: Issue[]): HTMLElement {
  const board = h('div', { class: 'board' })

  for (const entry of ISSUE_STATUSES) {
    const inColumn = issues.filter((issue) => issue.status === entry.value)
    const column = h('div', { class: 'column' })
    const list = h('div', { class: 'column-body' })

    for (const issue of inColumn) {
      const card = h(
        'div',
        { class: 'kanban-card', draggable: true },
        issue.ref && h('div', { class: 'mono dim tiny', text: issue.ref }),
        h('a', {
          class: 'issue-title',
          href: href({ name: 'issue', addr: issue.addr }),
          text: issue.title,
        }),
        issue.assignee && h('div', { class: 'dim tiny', text: `@${ctx.who(issue.assignee)}` }),
      )
      card.ondragstart = (event) => {
        event.dataTransfer?.setData('text/plain', issue.addr)
        card.classList.add('dragging')
      }
      card.ondragend = () => card.classList.remove('dragging')
      list.append(card)
    }

    if (!inColumn.length) list.append(h('div', { class: 'empty tiny', text: 'Nothing here' }))

    column.append(
      h(
        'div',
        { class: 'column-head' },
        statusPill(entry.value),
        h('span', { class: 'count', text: String(inColumn.length) }),
      ),
      list,
    )

    // `preventDefault` on dragover is what makes an element a drop target at
    // all — without it the browser refuses the drop and nothing happens, with
    // no error anywhere.
    column.ondragover = (event) => {
      event.preventDefault()
      column.classList.add('drop-target')
    }
    column.ondragleave = () => column.classList.remove('drop-target')
    column.ondrop = async (event) => {
      event.preventDefault()
      column.classList.remove('drop-target')
      const addr = event.dataTransfer?.getData('text/plain')
      const issue = issues.find((candidate) => candidate.addr === addr)
      if (!issue || issue.status === entry.value) return
      const ok = await ctx.publish('Status change', () =>
        ctx.store.setField({
          folder: ctx.folderOf(issue),
          target: issue.addr,
          field: 'status',
          value: entry.value,
          note: `status → ${entry.value}`,
        }),
      )
      if (ok) await ctx.reload()
    }

    board.append(column)
  }
  return board
}

/** Shared empty-state copy, so every surface phrases "nothing here" the same. */
export function noIssues(what: string): HTMLElement {
  return empty(`No issues in ${what} yet.`)
}

export { short }
