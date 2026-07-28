/**
 * Shared DOM primitives.
 *
 * Plain `document.createElement`, no framework and no template strings holding
 * user data — a project title goes through `textContent`, never `innerHTML`,
 * because on a shared relay the titles are written by other people.
 */
import { ISSUE_STATUSES, lookupStatus, type VocabEntry } from '../../src/kinds'
import type { Conversation, Issue, Project } from '../../src/fold'

/** Element factory: `h('div', {class: 'row'}, child, 'text')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (key === 'class') node.className = String(value)
    else if (key === 'text') node.textContent = String(value)
    else node.setAttribute(key, String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

export const short = (pubkey: string) => `${pubkey.slice(0, 8)}…`

/** A status chip, coloured from the vocabulary the manifest publishes. */
export function statusPill(status: string, vocab: VocabEntry[] = ISSUE_STATUSES): HTMLElement {
  const entry = lookupStatus(vocab, status)
  return h('span', { class: `pill status-${entry.colour}` }, h('span', { class: 'dot' }), entry.label)
}

export function pill(text: string, extra = ''): HTMLElement {
  return h('span', { class: `pill ${extra}`.trim(), text })
}

export function empty(message: string): HTMLElement {
  return h('div', { class: 'empty', text: message })
}

/**
 * A `<select>` over a vocabulary that publishes on change.
 *
 * Disables itself while the write is in flight. Without that, a fast second
 * change races the first and the fold — correctly — keeps whichever landed
 * last, which looks like the UI ignoring a click.
 */
export function vocabSelect(args: {
  vocab: VocabEntry[]
  value: string
  onChange: (value: string) => Promise<boolean>
}): HTMLSelectElement {
  const select = h('select')
  for (const entry of args.vocab) {
    const option = h('option', { value: entry.value, text: entry.label })
    option.selected = entry.value === args.value
    select.append(option)
  }
  // A value outside the vocabulary — written by another app — still has to be
  // selectable-away-from, so show it rather than silently snapping to the
  // default and appearing to change something nobody touched.
  if (!args.vocab.some((entry) => entry.value === args.value)) {
    const option = h('option', { value: args.value, text: `${args.value} (unknown)` })
    option.selected = true
    select.prepend(option)
  }
  select.onchange = async () => {
    select.disabled = true
    const ok = await args.onChange(select.value)
    if (!ok) {
      select.value = args.value
      select.disabled = false
    }
  }
  return select
}

/**
 * Everyone this workspace has seen act.
 *
 * Derived from events already loaded rather than queried: there is no user
 * directory on a relay, and the set of people who have authored or been
 * assigned something is the closest honest answer to "who can I assign this
 * to". It grows as people participate, which is the right behaviour — an
 * assignee picker listing strangers would be worse than one listing only the
 * people actually working here.
 */
export function participants(args: {
  projects: Project[]
  issues: Issue[]
  conversations: Conversation[]
  changes: { author: string; field: string; value: string }[]
}): string[] {
  const seen = new Set<string>()
  for (const project of args.projects) {
    seen.add(project.author)
    if (project.lead) seen.add(project.lead)
  }
  for (const issue of args.issues) {
    seen.add(issue.author)
    if (issue.assignee) seen.add(issue.assignee)
  }
  for (const conversation of args.conversations) {
    seen.add(conversation.root.author)
    for (const reply of conversation.replies) seen.add(reply.author)
  }
  for (const change of args.changes) {
    seen.add(change.author)
    // An assignee that has since been changed away from is still a person who
    // works here.
    if (/^[0-9a-f]{64}$/.test(change.value)) seen.add(change.value)
  }
  seen.delete('')
  return [...seen].sort()
}

/**
 * Assignee picker.
 *
 * "Unassigned" writes an empty value rather than deleting the change. An
 * append-only stream has no undo; "set to nothing" is a fact like any other,
 * and it keeps the activity feed truthful about what happened.
 */
export function assigneeSelect(args: {
  people: string[]
  value: string | undefined
  me: string
  onChange: (value: string) => Promise<boolean>
}): HTMLSelectElement {
  const current = args.value ?? ''
  const select = h('select')
  select.append(h('option', { value: '', text: 'Unassigned' }))
  const people = args.people.includes(current) || !current ? args.people : [...args.people, current]
  for (const pubkey of people) {
    select.append(
      h('option', {
        value: pubkey,
        text: pubkey === args.me ? `you (${short(pubkey)})` : short(pubkey),
      }),
    )
  }
  select.value = current
  select.onchange = async () => {
    select.disabled = true
    const ok = await args.onChange(select.value)
    if (!ok) {
      select.value = current
      select.disabled = false
    }
  }
  return select
}

/**
 * Click-to-edit text.
 *
 * Commits on blur or Enter, reverts on Escape. Deliberately not a permanently
 * open input: these fields belong to whoever wrote them, and a page full of
 * text boxes invites edits that each cost a published event.
 */
export function editableText(args: {
  value: string
  placeholder: string
  multiline?: boolean
  className?: string
  onCommit: (value: string) => Promise<boolean>
}): HTMLElement {
  const view = h('div', {
    class: `editable ${args.className ?? ''}`.trim(),
    title: 'Click to edit',
    text: args.value || args.placeholder,
  })
  if (!args.value) view.classList.add('placeholder')

  view.onclick = () => {
    const input = args.multiline ? h('textarea') : h('input')
    input.value = args.value
    input.className = args.className ?? ''
    if (args.multiline) (input as HTMLTextAreaElement).rows = 4

    let settled = false
    const finish = async (commit: boolean) => {
      if (settled) return
      settled = true
      const next = input.value.trim()
      if (!commit || next === args.value) {
        input.replaceWith(view)
        return
      }
      input.disabled = true
      const ok = await args.onCommit(next)
      // On failure the caller has already shown why; put the text back so the
      // edit is not silently lost.
      if (!ok) {
        input.disabled = false
        settled = false
        return
      }
    }
    input.onblur = () => void finish(true)
    input.onkeydown = (event) => {
      if (event.key === 'Escape') void finish(false)
      // Enter commits a single-line field; in a textarea it is a newline.
      if (event.key === 'Enter' && !args.multiline) {
        event.preventDefault()
        void finish(true)
      }
    }
    view.replaceWith(input)
    input.focus()
    if (input instanceof HTMLInputElement) input.select()
  }
  return view
}

/**
 * A modal dialog.
 *
 * Uses `<dialog>` rather than a hand-rolled overlay: the browser already does
 * focus trapping, backdrop rendering, Escape-to-close and inertness of the page
 * behind it, and reimplementing those badly is how a form becomes unusable with
 * a keyboard.
 *
 * Removes itself from the DOM on close, so opening the same form twice never
 * leaves a stale copy holding old values.
 */
export function openModal(args: { title: string; body: HTMLElement }): () => void {
  const dialog = h('dialog', { class: 'modal' })
  const close = () => dialog.close()
  const header = h(
    'div',
    { class: 'modal-head' },
    h('h2', { text: args.title }),
    (() => {
      const button = h('button', { class: 'tiny-button', 'aria-label': 'Close', text: '✕' })
      button.onclick = close
      return button
    })(),
  )
  dialog.append(header, args.body)
  // Clicking the backdrop closes. The check is against the dialog itself
  // because the backdrop is not a separate element — a click on any child
  // bubbles up here and must not count.
  dialog.onclick = (event) => {
    if (event.target === dialog) close()
  }
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
  // Focus the first field so the form is typeable immediately.
  dialog.querySelector<HTMLElement>('input, textarea')?.focus()
  return close
}

/**
 * A dropdown anchored to a trigger button.
 *
 * Closes on outside click, on Escape, and on any activation inside it — a menu
 * that stays open after you have chosen something reads as a menu that did not
 * register the choice.
 */
export function dropdown(args: { label: string; className?: string; build: (close: () => void) => HTMLElement }): HTMLElement {
  const wrap = h('div', { class: `dropdown ${args.className ?? ''}`.trim() })
  const trigger = h('button', { class: 'dropdown-trigger', text: args.label })
  let panel: HTMLElement | undefined

  const close = () => {
    panel?.remove()
    panel = undefined
    document.removeEventListener('click', onOutside, true)
    document.removeEventListener('keydown', onKey)
  }
  const onOutside = (event: MouseEvent) => {
    if (!wrap.contains(event.target as Node)) close()
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }

  trigger.onclick = () => {
    if (panel) return close()
    panel = h('div', { class: 'dropdown-panel' }, args.build(close))
    wrap.append(panel)
    // Capture phase, so a click that also triggers something inside still
    // closes the menu rather than racing it.
    document.addEventListener('click', onOutside, true)
    document.addEventListener('keydown', onKey)
  }

  wrap.append(trigger)
  return wrap
}

/**
 * Turn the relay's rejection into something actionable.
 *
 * `restricted: not a channel member` reads as a permissions problem and is
 * usually a *missing container* (FRICTION.md A4). It is the single most likely
 * failure when pairing with a Peek topic, because Peek creates a topic in its
 * own database and only publishes the `kind:9007` when the topic is first
 * synced — so a brand-new topic's Folder link points at something the relay has
 * never heard of. Sending one message in the topic fixes it.
 */
export function explainRejection(reason: string | undefined, folder: string): string {
  if (reason?.includes('not a channel member')) {
    return (
      `The relay does not know Folder ${folder.slice(0, 8)}… — most likely the Peek topic ` +
      'has not been published yet. Send a message in that topic, then try again. ' +
      '(If it is somebody else\'s private topic, you need to be added to it.)'
    )
  }
  return reason ?? 'no reason given'
}

/** Relative time, because an activity feed reads better in "3m ago". */
export function ago(seconds: number): string {
  const delta = Math.max(0, Date.now() / 1000 - seconds)
  if (delta < 60) return 'just now'
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  if (delta < 604800) return `${Math.floor(delta / 86400)}d ago`
  return new Date(seconds * 1000).toLocaleDateString()
}
