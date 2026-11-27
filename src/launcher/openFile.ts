import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { LauncherContext, LauncherMessage } from '@estiva-app/launcher'
import { documentForEditing, inlineTextOf, type ContentFormat } from '@estiva-app/protocol'
import { appDrafts, DRAFT_MAX_CHARS, draftKeys } from '@/lib/drafts'
import type { ThreadData } from '@/components/ConversationThread'

/*
  KIN-6 — what ⌘K asks about in Ship: the issue or project that is open. An issue's parts are its description's blocks
  as the editor holds them now (typing not yet saved included), then every comment on it, a resolved thread's marked
  (Decided on KIN-5, for Ship too). A project's are its description's blocks, then each of its issues on one line
  (title, status, who has it), then the comments on the project itself; an issue's own comments stay with that issue
  (Miky, KIN-6 kickoff). The page puts itself here while it is drawn, and the comments column its threads; the box
  reads it when it is opened.
*/

/** What the open issue or project lets the box do: put an answer in a new comment or its description; show a part. */
export interface OpenFileActions {
  /** Whether a new comment can be written on it (not archived, readable to comment on). */
  canComment: boolean
  /** Whether its description can be changed by you now. */
  canEdit: boolean
  /** Bring the comments column into view, when it was hidden. */
  showComments: () => void
  /** A new comment on this block (or the whole file): the box reopens holding its draft. */
  startDraft: (block: string | null) => void
}

/** One of a project's issues, as an ask reads it. */
export interface OpenIssueLine {
  address: string
  ref?: string
  title: string
  status: string
  who?: string
  open: () => void
}

export interface OpenFile extends OpenFileActions {
  address: string
  kind: 'issue' | 'project'
  title: string
  /** The project an issue is in, or the project itself: where Add issue puts a new one. */
  project?: { title: string }
  /** The team it is in, by id: where ⌘K's New document starts (KIN-9). Absent: in no team, or not read yet. */
  team?: string
  editor: Editor | null
  /** The description as stored: what is read when there is no editor (an archived file, or before it arrives). */
  description: string
  format: ContentFormat
  /** A project's issues, in the order its page lists them. */
  issues?: readonly OpenIssueLine[]
  /** Its comments as the page reads them, whether the comments column is shown or hidden. */
  threads: readonly ThreadData[]
}

let file: OpenFile | null = null
/** Which threads are resolved, as the comments column knows it while it is shown (hidden: none is marked). */
let resolutions: { address: string; resolved: (thread: string) => boolean } | null = null
/** Each comment the box was last handed: the block it was written on (none: the whole file). */
const comments = new Map<string, string | null>()
/** Each issue line the box was last handed, by its part id. */
const issueLines = new Map<string, OpenIssueLine>()
/** The block the cursor was in when the box was opened from the description you were writing in. */
let cursorBlock: string | null = null

/**
 * The issue or project page puts itself here while it is drawn: registered once per address, and the fields brought up
 * to date after each render without leaving and coming back.
 */
export function useOpenFile(open: OpenFile | null): void {
  const address = open?.address
  useEffect(() => {
    if (open && file?.address === open.address) file = open
  })
  useEffect(() => {
    if (!open) return
    file = open
    return () => {
      if (file?.address === open.address) file = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registered per address; the effect above keeps the fields current
  }, [address])
}

/** The comments column says which of the file's threads are resolved, while it is shown. */
export function useOpenThreads(address: string | undefined, resolved: (thread: string) => boolean): void {
  useEffect(() => {
    if (!address) return
    const held = { address, resolved }
    resolutions = held
    return () => {
      if (resolutions === held) resolutions = null
    }
  }, [address, resolved])
}

/** The description's blocks as the editor holds them: id and words, in order; a list's items and a table's cells each one. */
export function passagesOf(editor: Editor | null): { id: string; text: string }[] {
  if (!editor) return []
  const out: { id: string; text: string }[] = []
  editor.state.doc.descendants((node) => {
    const id = node.attrs.blockId
    if (!id) return true
    // A block holding blocks (a list, a table, a row) is read through them.
    let inner = false
    node.descendants((child) => {
      if (child.attrs.blockId) inner = true
      return !inner
    })
    if (inner) return true
    const text = node.textContent.trim()
    if (text) out.push({ id: String(id), text })
    return false
  })
  return out
}

/** The description's blocks as stored, when there is no editor to read them from (read only, or not arrived yet). */
export function passagesOfText(description: string, format: ContentFormat): { id: string; text: string }[] {
  if (!description.trim()) return []
  try {
    return documentForEditing(description, format)
      .content.map((block) => ({ id: block.id, text: inlineTextOf(block).trim() }))
      .filter((p) => p.text)
  } catch {
    return []
  }
}

export const PASSAGE = 'In the description'
const ISSUE_LINE = 'An issue in the project'
const short = (text: string) => (text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text)
const blockOf = (anchor: ThreadData['root']['anchor']) => (anchor && anchor.state === 'resolved' ? anchor.id : null)

/** What is open, for the box: the issue or project and its parts, or nothing on any other page. */
export function captureOpenFile(): LauncherContext {
  cursorBlock = null
  comments.clear()
  issueLines.clear()
  if (!file) return {}
  // Opened with ⌘K while writing the description: the editor still has focus, and the answer can go where you were.
  const editor = file.editor
  if (editor?.isFocused && editor.isEditable) {
    const top = editor.state.selection.$from.node(1)
    cursorBlock = top?.attrs.blockId ? String(top.attrs.blockId) : null
  }
  const passages = editor ? passagesOf(editor) : passagesOfText(file.description, file.format)
  const textOf = new Map(passages.map((p) => [p.id, p.text]))
  const lines: LauncherMessage[] = (file.issues ?? []).map((issue, i) => {
    const id = `issue-${i}`
    issueLines.set(id, issue)
    const name = [issue.ref, issue.title || 'Untitled issue'].filter(Boolean).join(' ')
    // The source row reads as the story draws it ("REL-1 · In Progress · Ana Duarte"); the model reads the whole line.
    const where = [issue.ref, issue.status, issue.who].filter(Boolean).join(' · ') || ISSUE_LINE
    return { id, author: '', timestamp: '', where, body: `${name} — ${issue.status}, ${issue.who ? `assigned to ${issue.who}` : 'assigned to nobody'}` }
  })
  const isResolved = resolutions?.address === file.address ? resolutions.resolved : () => false
  const said: LauncherMessage[] = file.threads.flatMap((thread) => {
    const block = blockOf(thread.root.anchor)
    const on = block ? textOf.get(block) : undefined
    const where = on ? `Comment on “${short(on)}”` : `Comment on the whole ${file!.kind}`
    const resolved = isResolved(thread.id)
    // A thread whose comment is gone stands on its earliest reply (`rootMissing`), which is still a reply.
    return [thread.root, ...thread.replies].flatMap((item): LauncherMessage[] => {
      if (!item.body.trim()) return []
      comments.set(item.id, block)
      return [{ id: item.id, author: item.author.name ?? 'Someone', timestamp: '', where, body: item.body, ...(resolved ? { resolved: true } : {}) }]
    })
  })
  return {
    open: {
      kind: 'page',
      title: file.title,
      references: [],
      messages: [...passages.map((p) => ({ id: p.id, author: '', timestamp: '', where: PASSAGE, body: p.text })), ...lines, ...said],
    },
  }
}

/** The block a part is on: a passage is its own block; a comment, the block it was written on; anything else none. */
export function blockOfPart(part: LauncherMessage): string | null {
  if (part.where === PASSAGE) return part.id
  return comments.get(part.id) ?? null
}

/** The open issue or project, while one is open. */
export function openFileNow(): OpenFile | null {
  return file
}

/** Where you were writing when the box was opened, if you were. */
export function cursorBlockAtOpen(): string | null {
  return cursorBlock
}

/**
 * Hold the answer as the file's new comment: after the words of one already started, which keep their place (as in
 * Leaf). Says whether one was started, or null when the words could not be held (storage refused, or too long for a
 * draft, which would drop what was started): then nothing changes.
 */
export function holdCommentDraft(address: string, text: string): 'started' | 'new' | null {
  const key = draftKeys.object(address)
  const held = appDrafts.readDraft(key)
  const started = held?.text.trim()
  const next = started ? `${started}\n\n${text}` : text
  if (next.length > DRAFT_MAX_CHARS) return null
  appDrafts.write(key, next, held?.urgent ?? [])
  if (appDrafts.read(key) !== next) return null
  return started ? 'started' : 'new'
}

/** Draft the answer as a comment on the open file, on this block when the box is empty. False when it cannot be. */
export function draftComment(text: string, block: string | null): boolean {
  if (!file?.canComment) return false
  const held = holdCommentDraft(file.address, text)
  if (!held) return false
  // A comment already started keeps its place too: only an empty box moves to the cited block.
  file.startDraft(held === 'new' ? block : null)
  return true
}

/**
 * The words as new paragraphs under a block of the description (or at its end), through the editor, so the
 * description saves them as it saves your typing. False when it cannot be edited, or has no editor yet.
 */
export function insertBlock(editor: Editor | null, canEdit: boolean, text: string, after: string | null): boolean {
  if (!editor || !canEdit || !editor.isEditable) return false
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  if (paragraphs.length === 0) return false
  let at = editor.state.doc.content.size
  if (after) {
    // A block inside a list or a table: the answer goes under the whole list, as a block of the description.
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs.blockId !== after) return true
      const top = editor.state.doc.resolve(pos)
      at = top.depth === 0 ? pos + node.nodeSize : top.after(1)
      return false
    })
  }
  const content = paragraphs.map((words) => ({ type: 'paragraph', content: [{ type: 'text', text: words }] }))
  if (!editor.chain().insertContentAt(at, content).scrollIntoView().run()) return false
  // The description saves when the editor is left (DocumentEditor's blur): saved now, as your typing is when you leave
  // it, or a newer save arriving while it is not being written in would replace it (as KIN-5 found in Leaf).
  editor.emit('blur', { editor, event: new FocusEvent('blur'), transaction: editor.state.tr })
  return true
}

/** Insert the answer into the open file's description. */
export function insertIntoDescription(text: string, after: string | null): boolean {
  if (!file) return false
  return insertBlock(file.editor, file.canEdit, text, after)
}

/** Bring a cited part into view: a passage's block, a comment's column, or an issue's page. False when it is not there. */
export function showPart(part: LauncherMessage): boolean {
  const issue = issueLines.get(part.id)
  if (issue) {
    issue.open()
    return true
  }
  if (part.where !== PASSAGE) {
    if (!comments.has(part.id) || !file) return false
    file.showComments()
    return true
  }
  const element = document.querySelector(`[data-block-id="${CSS.escape(part.id)}"]`)
  if (!element) return false
  element.scrollIntoView({ block: 'center' })
  return true
}
