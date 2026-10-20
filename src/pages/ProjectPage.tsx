import { IconLinkOff } from '@tabler/icons-react'
import { newestDrawn, useMarkRead, useShownThreads } from '@/lib/useMarkRead'
import { useNewSince } from '@/lib/useNewSince'
import { ownConversations, recordChannel } from '@/lib/ownConversation'
import { pointerToAddress, referenceToPointer, resolveBlockAnchor, type ContentFormat, type Embed, type PartPointer } from '@estiva-app/protocol'
import type { AttachmentIndex, EditIndex } from '@/api'
import { signedIn } from '@/auth/estivaId'
import { useReopenHeld } from '@/auth/heldTyping'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ISSUE_STATUSES,
  PROJECT_STATUSES,
  archiveProject,
  createIssue,
  deleteMessage,
  editMessage,
  deleteProject,
  me,
  peopleIn,
  react,

  reply,

  unreact,
  assignMissingRefs,
  setProjectField,
  startConversation,
  workFolder,
  channelContext,
  fileContext,
  threadContext,
  useMergedReadState,
  useFeedJudges,
  unreadByThread,
  commentsOn,
  mentionsOf,
  commentsOnAny,
  type CardEdit,
  type DirectoryView,
  type FolderState,
  type WorkspaceState,
} from '@/api'
import { useRelated } from '@/api/useRelated'
import { MEMBER_FIELD_PREFIX } from '@estiva-app/conversation'
import { Members } from '@/components/Members'
import { membershipActions } from './membership'
import { useReferencePage } from '@/api/references'
import type { ThreadData } from '@/components/ConversationThread'
import type { ActivityItem } from '@/components/Activity'
import type { IssuesTableRow } from '@/components/IssuesTable'
import { NewIssueDialog } from '@/components/NewIssueDialog'
import type { RailPerson } from '@/components/ProjectRail'
import { placedIn } from '@/lib/placement'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectView } from '@/views/ProjectView'
import { go, href, type ProjectTab, type ProjectView as ProjectViewName } from '../router'
import { act, actInField, sayOnceLeft, type Say } from './act'
import { hrefForIssue, rowFor } from './IssuesPage'
import { MoveProject } from '@/components/MoveProject'
import { ArchiveDialog } from '@/components/ArchiveDialog'
import { ArchivedNotice } from '@/components/ArchivedNotice'
import { archivedLine, lockedReason, ownArchive, type Archives } from '@/lib/archive'
import { KIND } from '@/nostr/kinds'

export type { Say } from './act'

/**
 * Drop the reference that points at the page you are already on — SHI-1.
 *
 * This replaces the old app's `stripReferences`, which removed **every**
 * `nostr:naddr…` from a body before drawing it. That was right about one
 * reference and wrong about all the others: `startConversation` appends the
 * issue's own pointer to each comment, and showing bech32 for the object whose
 * page you are reading is noise — but a thread on a project naming one of its
 * issues, or a Peek message naming something else entirely, carried a pointer
 * that Ship then deleted rather than resolving. Katerina saw the result as
 * "avatar + name + timestamp only".
 *
 * So the rule narrows from *"references are not text to read"* to *"the object
 * this surface already is, is not worth repeating"*. Everything else is drawn
 * by `Conversations` as the object it names.
 *
 * Only a **standalone** reference is removed — a paragraph that is nothing but
 * the pointer, which is exactly the shape `postMessage` appends (`\n\n${ref}`).
 * A pointer written inside a sentence is somebody's prose and stays where they
 * put it, resolved in place (§13.1, RIC-10).
 */
export function omitOwnReference(body: string, addr?: string): string {
  if (!addr) return body
  const paragraphs = body.split(/\n[ \t]*\n/)
  const kept = paragraphs.filter((paragraph) => {
    const text = paragraph.trim()
    if (!NADDR_ONLY.test(text)) return true
    try {
      return pointerToAddress(referenceToPointer(text)) !== addr
    } catch {
      // A pointer that will not decode is not this object's; leave it alone
      // rather than deleting somebody's text on a parse failure.
      return true
    }
  })
  return kept.join('\n\n').trim()
}

/** A paragraph that is nothing but one `nostr:` pointer. */
const NADDR_ONLY = /^nostr:naddr1[0-9acdefghjklmnpqrstuvwxyz]+$/i

/** A conversation from the fold as the thread card draws it: names and faces for keys, the fold's order kept. */
export function threadFor(
  conversation: FolderState['conversations'][number],
  directory: DirectoryView,
  /*
    The body a comment's anchor is resolved against — SPEC §13.6. Passed in
    because only the page knows which object's description these comments are
    about, and because the anchor has to be resolved against the description as
    it is *now*: that is what makes a deleted block show as deleted rather than
    as no anchor at all. Omitted where there is no single object, and every
    anchor is then reported unaddressable rather than silently dropped.
  */
  body?: { value: string; format: ContentFormat },
  /** The object this surface is: its own pointer is dropped, every other one is drawn (SHI-1). */
  self?: string,
  /*
    Edits, applied here rather than in the fold — CON-4.

    `foldFolder` is a two-repo contract whose conformance test walks the union
    of keys, so the edit cannot be a field on `Message`; the package folds it
    beside the fold and this is where the two meet. A message with no edit is
    untouched, so the omitted case is exactly today's behaviour.
  */
  edits?: EditIndex,
  /*
    Attachments, beside the fold for the same reason as `edits` — CON-12.

    Passed rather than read here because `threadFor` is pure over one
    conversation and the index is folded once per workspace read.
  */
  attachments?: AttachmentIndex,
  /** Whom each message names urgently, beside the fold for the same reason (CON-24). */
  urgent?: Record<string, string[]>,
  /** The blocks each message shows, beside the fold for the same reason (COM-2). */
  parts?: Record<string, PartPointer[]>,
  /** The cards each message asks for, folded over its edits (SPEC §13.6.2, OPT-16). */
  embeds?: Record<string, Embed[]>,
): ThreadData {
  const message = (m: FolderState['conversations'][number]['root']) => {
    const edit = edits?.[m.id]
    return {
      id: m.id,
      // A NIP-22 comment, or a reply to one, carries an `A`; chat does not (fold.ts).
      kind: m.anchor ? 1111 : 9,
      author: directory.personOf(m.author),
      at: m.createdAt,
      // The edited text, if there is one — an edit changes the body and its
      // attachments (RFC 0.4 §7.2.1, amended 2026-09-23). The reference still
      // comes out of it, so an edit that keeps the pointer keeps the widget.
      body: omitOwnReference(edit?.body ?? m.body, self),
      // Milliseconds from the fold, seconds everywhere else on this shape.
      // Only a body change marks it: an edit that re-attaches files under the
      // same text is not "edited" (§7.2.1, CON-5).
      editedAt: edit?.editedAt !== undefined ? Math.floor(edit.editedAt / 1000) : undefined,
      anchor: resolveBlockAnchor(m.blockId, body?.value ?? '', body?.format ?? 'marker'),
      // Carried for the unread rule only: your own writing is never new to you.
      by: m.author,
      // Files, read off `imeta` beside the fold — CON-12. Undefined for the
      // messages that carry none, which is nearly all of them.
      files: attachments?.[m.id],
      // The urgent keys of the message as sent: an edit carries none, so an edited message keeps them (CON-24).
      urgent: urgent?.[m.id],
      // Its `part` tags as sent: an edit carries none, so an edited message keeps them (COM-2).
      parts: parts?.[m.id],
      // Its `embed` set, folded like `files`: an edit can change or remove a card (OPT-16).
      embeds: embeds?.[m.id],
      // The anchored block, read live from its object like any part (COM-2).
      anchorPart: m.blockId && m.anchor ? { address: m.anchor, block: m.blockId } : undefined,
    }
  }
  return { id: conversation.id, root: message(conversation.root), replies: conversation.replies.map(message) }
}

/**
 * The Folder a message was posted in — CON-4.
 *
 * An edit is the one conversation write that is channel-scoped, so it needs
 * this, and it must be the **message's** Folder rather than the page's: a
 * message reached through Activity belongs to another file. `Message.folder` is
 * carried by the fold for exactly this reason ("needed to reply into the same
 * container"), and this is its second caller.
 *
 * `undefined` for a message this reader cannot place — a root that carried no
 * `h`. Refusing is the honest answer there; guessing would publish an edit into
 * a channel the message is not in.
 */
export function folderOfMessage(state: FolderState, messageId: string): string | undefined {
  for (const conversation of state.conversations) {
    for (const message of [conversation.root, ...conversation.replies]) {
      if (message.id === messageId) return message.folder || undefined
    }
  }
  return undefined
}

/**
 * What an edit of one message needs to keep its cards right (SPEC §13.6.2): its
 * whole text as it stands, its own reference included (the drawn body leaves
 * that out), its folded cards and parts, and the file its conversation is on.
 * With `remove`, the edit is ✕ on that file's card.
 */
export function cardEditOf(state: WorkspaceState, messageId: string, remove?: string): CardEdit | undefined {
  for (const conversation of state.conversations) {
    for (const message of [conversation.root, ...conversation.replies]) {
      if (message.id !== messageId) continue
      return {
        before: state.edits[messageId]?.body ?? message.body,
        embeds: state.embeds[messageId],
        parts: state.parts[messageId],
        here: message.anchor ?? conversation.root.anchor ?? conversation.about[0],
        remove,
      }
    }
  }
  return undefined
}

/**
 * Where a thread lives, in words a reader recognises — CON-9's Activity rows.
 *
 * A thread in Activity belongs to a *different* file from the page around it,
 * and the row has to say which, because replying goes there rather than here.
 *
 * Resolved from the Folder, which is the only containment an event carries. A
 * project names its content Folder; an issue names its own. Both are checked
 * because a mention may have been written in either.
 *
 * **`undefined` is a real answer and is drawn as nothing.** A Folder that is no
 * project's — a top-level Folder's own chat, an old Peek topic channel — is a
 * Folder and nothing else to Ship: it has no name for it, and
 * inventing one ("Folder 4f3a…") would be a worse row than a quiet one. The
 * same goes for a Folder this reader cannot see into: the thread reached them
 * some other way and its home did not.
 */
export function whereThreadLives(folder: string, state: FolderState): string | undefined {
  return placeOf(folder, state).where
}

/** The same answer, and whether it named a project or an issue — so the place can carry that one's icon. */
export function placeOf(folder: string, state: FolderState): { where?: string; whereKind?: 'project' | 'issue' } {
  if (!folder) return {}
  const project = state.projects.find((candidate) => candidate.contentFolder === folder)
  if (project) return { where: project.title, whereKind: 'project' }
  const issue = state.issues.find((candidate) => candidate.folder === folder)
  if (issue) return { where: issue.ref ? `${issue.ref} · ${issue.title}` : issue.title, whereKind: 'issue' }
  return {}
}

/**
 * The Activity list for one object: where else it was mentioned (CON-7,
 * RIC-12), and nothing else.
 *
 * **Sub-file conversations are not Activity (PEE-26).** CON-9 rolled a
 * project's issue threads up into this list as a second relation. It was an
 * experiment and was undone: a comment on an issue is that issue's
 * conversation, read on the issue. It shows on neither the project's
 * Activity nor its stream (`subFileThreads` keeps it out of the stream).
 *
 * Ordered by last activity, which is the order `foldConversations` already
 * leaves them in.
 *
 * **The anchor body is deliberately not passed to `threadFor`.** A block anchor
 * resolves against *the object the comment is about*, and these comments are
 * about other objects — resolving them against this page's description would
 * report a block that has nothing to do with them. Passing nothing reports
 * every anchor as unaddressable, which is honest rather than wrong.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/activity-lists-only-mentions-from-elsewhere.md
 */
export function activityFor(
  addr: string,
  state: WorkspaceState,
  directory: DirectoryView,
  archives?: Archives,
): { items: ActivityItem[]; truncated: number } {
  // A thread on an archived file takes no reply or reaction here either (Decided 2026-10-17: none, in every app).
  const closedOn = (file: string | undefined) => {
    if (!file || !archives) return undefined
    return archivedLine(file.startsWith(`${KIND.PROJECT}:`) ? archives.ofProject(file) : archives.ofIssue({ addr: file }))
  }
  const mentions: ActivityItem[] = mentionsOf(state.conversations, addr, state.anchors).map((conversation) => {
    const closed = closedOn(conversation.root.anchor ?? conversation.about[0])
    return {
      thread: threadFor(conversation, directory, undefined, addr, state.edits, state.attachments, state.urgent, state.parts, state.embeds),
      relation: 'mention' as const,
      ...placeOf(conversation.root.folder, state),
      ...(closed ? { closed } : {}),
    }
  })
  return { items: mentions.slice(0, ACTIVITY_HORIZON), truncated: Math.max(0, mentions.length - ACTIVITY_HORIZON) }
}

/**
 * The ids of the threads rooted at one of these files: a project's issue
 * comments, which sit in the project's Folder but are not its conversation
 * (CON-9). Every one of them, not only the most recent `ACTIVITY_HORIZON`:
 * when this set came from the capped Activity list, threads past the cap
 * leaked back into the project's stream.
 */
export function subFileThreads(state: WorkspaceState, subFiles: ReadonlySet<string>): Set<string> {
  return new Set(commentsOnAny(state.conversations, subFiles, state.anchors).map(({ conversation }) => conversation.id))
}

/**
 * How much Activity shows — the horizon, decided rather than inherited (CON-9,
 * on CON-1's precedent). It was chosen when Activity still held a project's
 * issue threads (the measurement below); since PEE-26 it caps mentions only.
 *
 * A project with 200 issues had an unbounded roll-up, and an unbounded list is
 * not a list a person reads. CON-1 is the precedent for what to do about that:
 * choose N deliberately, name the constant after the decision, and **say it
 * where a reader can see it** — because *"an undocumented cap is
 * indistinguishable from nobody reacted"*, and here it would be
 * indistinguishable from "nothing else happened".
 *
 * 50, cut off the **most recent** end. Not a time window: a quiet project would
 * show nothing under one, and "nothing in 30 days" is exactly the reading a cap
 * must not produce. Not a per-issue quota either, which would let one busy issue
 * be silently rationed while the list had room.
 *
 * **Measured before it was chosen, not after.** On production (2026-09-06, 18
 * projects, 229 issues, 496 conversations) the largest roll-up is 60 threads
 * over 12 issues, and 50 is the only value in the region that is exercised
 * without being obtrusive: it cuts exactly one project of eighteen, by ten. A
 * cap nothing ever reaches is a cap nobody has reviewed, and the line that
 * reports it would never have been seen before the demo.
 *
 * Computing it for all eighteen costs 2 ms once the fold is in hand, so the
 * horizon is about what a person can read rather than about what it costs.
 *
 * The surface says how many it left out; the rest are on the issues themselves,
 * one click away.
 */
export const ACTIVITY_HORIZON = 50

/** Everyone in the workspace as a picker option, ordered by name — by key would be ordered by nothing a person can see. */
export function railPeople(state: FolderState, directory: DirectoryView): RailPerson[] {
  return peopleIn(state, me)
    .map((pubkey) => ({ value: pubkey, name: directory.nameOf(pubkey), picture: directory.personOf(pubkey).picture }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Put text on the clipboard, or show it when the clipboard is not available — the old app's fallback. */
export async function copyText(text: string, done: string, prompt: string, say: Say) {
  try {
    await navigator.clipboard.writeText(text)
    say(done)
  } catch {
    window.prompt(prompt, text)
  }
}

/**
 * One project from the fold, as the old app's projectView: its issues as a
 * table (Updated = the last change to that issue, or when it was opened)
 * or a board, the conversation in its Folder, its issues' conversations under
 * Activity, and the rail. Every control writes one change
 * to one object and then re-reads the relay (`act`). Delete is offered
 * only to the author (NIP-09 honours nobody else) and asks first. A
 * project the fold does not have gets the old app's words, not a blank
 * page.
 */
export function ProjectPage({
  state,
  directory,
  teams,
  archives,
  d,
  view,
  tab,
  say,
  refresh,
}: {
  state: WorkspaceState
  directory: DirectoryView
  /** What is archived, and what with — FOL-46. */
  archives: Archives
  /**
   * The top-level Folders, so a project filed into one is not given that
   * Folder's chat (`recordChannel`), and so the rail can name the one it is in
   * (`placedIn`). `undefined` while they are read.
   */
  teams: readonly { id: string; name?: string; hasState: boolean; addresses?: readonly string[] }[] | undefined
  /** The object's `d`, which is all a §7.2 URL carries. */
  d: string
  view: ProjectViewName
  /** The open tab — Overview, Activity, Issues. */
  tab: ProjectTab
  say: Say
  /** Folders given: only they are re-read (PER-17). Omitted: everything, for a write outside them. */
  refresh: (folders?: string[]) => Promise<void>
}) {
  const project = state.projects.find((candidate) => candidate.id === d)
  const [dialog, setDialog] = useState<'issue' | 'delete' | 'move' | 'archive' | null>(null)
  const newIssueHold = project && `new-issue:${project.addr}`
  useReopenHeld(newIssueHold, () => setDialog('issue'))

  const issues = useMemo<IssuesTableRow[]>(() => {
    if (!project) return []
    // An issue archived on its own is out of the list (FOL-46); one archived
    // only with this project is the project's, and on its page.
    return state.issues
      .filter((issue) => {
        const archive = archives.ofIssue(issue)
        return issue.projectAddr === project.addr && (!archive || !!archive.with)
      })
      .map((issue) => {
        // Who follows an issue is not an update to it (SHI-31): a Join or an Add does not move it up the table.
        const touched = state.activity.filter((change) => change.target === issue.addr && !change.field.startsWith(MEMBER_FIELD_PREFIX)).at(-1)
        return { ...rowFor(issue, state, directory), openedBy: directory.personOf(issue.author), at: touched?.createdAt ?? issue.createdAt }
      })
  }, [project, state, directory, archives])

  const activity = useMemo(
    () => (project ? activityFor(project.addr, state, directory, archives) : { items: [], truncated: 0 }),
    [project, state, directory, archives],
  )

  /*
    The project's OWN conversation — CON-9, and this line changed with it.

    It used to be every thread in the content Folder, *deliberately including the
    ones about an issue*. Those are the issues' own conversations, read on each
    issue's page, so they are not here and, since PEE-26, not in Activity either.

    **Since FOL-1 the filter is the anchor, not the Folder.** A project's
    content Folder may be its team's, shared with every other project in the
    team and with the team's own chat, so "every thread in the Folder" is no
    longer the project's. `ownConversations` keeps the threads whose root is a
    comment on the project, across every Folder it has pointed at, and keeps the
    Folder rule ("names nothing is the project's") only for the record channel,
    the one Folder that was the project's alone. A thread rooted at another file
    — a bare-file topic, an issue — is that file's (RFC 0.5 §10.7).
  */
  const rolledUp = useMemo(
    () => (project ? subFileThreads(state, new Set(state.issues.filter((issue) => issue.projectAddr === project.addr).map((issue) => issue.addr))) : new Set<string>()),
    [project, state],
  )
  const record = recordChannel(project?.contentFolder, teams)
  const conversations = useMemo(
    () =>
      project
        ? ownConversations(state.conversations, { addr: project.addr, recordFolder: record ?? '' }, state.anchors).filter((c) => !rolledUp.has(c.id))
        : [],
    [project, state, rolledUp, record],
  )
  /* This feed is two streams drawn as one — SPEC §11.1 (FOL-16): the record
     channel's chat, which answers to its bare channel uuid, and the project's
     own comments, which answer to the project's address. Looking at the
     Activity tab advances both, because both are on it — §11.2, "exactly the
     streams you are showing" — and Overview and Issues draw neither. Its
     issues' comments are other files' streams and are untouched;
     before FOL-16 their roots answered to the channel marker, so this line
     silently read every issue in the project.

     The channel is the **record** channel (FOL-1): the only Folder whose chat
     this page draws. A project filed into a team (FOL-2) has no record
     channel, only a team, and marking the team would advance the team's chat,
     which is not on this page.

     A thread in the feed whose replies are drawn, on the Activity tab,
     advances its `thread:` context too (CON-34, Miky 2026-10-05): under
     §11.3's thread rule reading the streams no longer reads their replies. The
     issues' threads rolled up above are not drawn here and are not marked. */
  const [shownThreads, onThreadShown] = useShownThreads()
  const drawn = useMemo(() => newestDrawn(conversations, shownThreads), [conversations, shownThreads])
  // Only on Activity, where the feed is drawn: Overview and Issues read nothing (66b31c4b, Miky 2026-10-06).
  const streams = useMemo(() => (tab === 'activity' ? [channelContext(record), fileContext(project?.addr)] : []), [record, project, tab])
  useMarkRead(streams, drawn.rootsAt)
  useMarkRead(tab === 'activity' ? shownThreads.map(threadContext) : [], drawn.repliesAt)
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, project ? { value: project.description, format: project.descriptionFormat } : undefined, project?.addr, state.edits, state.attachments, state.urgent, state.parts, state.embeds)),
    [conversations, directory, project],
  )
  /* The divider in the feed (CRO-13). A root about the project — its own `a`
     tag names it — answers to the project's marker; a root with no `a` is the
     record channel's chat and answers to that channel's. `ownConversations`
     already dropped roots about any other file, so those are the only two
     cases. */
  const merged = useMergedReadState()
  const judges = useFeedJudges(project ? { addr: project.addr, createdAt: project.createdAt } : undefined, channelContext(record))
  const verdictAt = useMemo(() => {
    if (!judges.file) return () => undefined
    const aboutProject = new Set(conversations.filter((c) => project && (state.anchors[c.root.id] ?? []).includes(project.addr)).map((c) => c.id))
    return (frontier: Readonly<Record<string, number>>) => unreadByThread(conversations, frontier, (conversation) => (aboutProject.has(conversation.id) ? judges.file : judges.channel))
  }, [judges, project, conversations, state.anchors])
  // Judged against the frontier this visit opened on, so the divider outlives the page's own marks (99557309).
  const { unread, stillUnread } = useNewSince(project?.addr, merged, verdictAt)
  const people = useMemo(() => railPeople(state, directory), [state, directory])
  /*
    What somebody placed under this project from another app — RFC 0.5 §10.7.

    Read from the project's content Folder, which is where a file placed
    "under" it lives: Peek starts a topic under a project inside the Folder the
    person is looking at, and that Folder lists the project. Not the fold — the
    fold is Ship's kinds, and these are by definition not.
  */
  // The Folder that lists the project, which is not its record's for a project
  // a retired `folder` change once pointed at a team (MAN-5) or one moved since
  // (FOL-7). The record's own Folder until the listings are read.
  const listedIn = project && teams ? placedIn({ addr: project.addr, folder: project.contentFolder }, teams)[0]?.id : undefined
  const related = useRelated(listedIn ?? project?.contentFolder, project?.addr)
  /* What `[` offers here (PEE-21): this project's messages; the Folder that
     lists it, then the files you read recently. The project is never offered. */
  useReferencePage({ address: project?.addr, folder: typeof related === 'object' ? related.all : undefined, readState: merged })

  if (!project) {
    return <EmptyState icon={<IconLinkOff size={16} stroke={1.5} />} message="That project is not in this workspace, or is in a Folder you cannot read." />
  }

  /*
    Number the issues Ship has not numbered yet.

    An issue created through the manifest by another app arrives with no display
    key, because only Ship can compute one — it is the project title plus a count
    of the siblings, which a consumer cannot see. Ship is the only participant
    that can, so Ship does it, here, where the siblings are known. The issues
    list spans projects and has no answer.

    Signed in only: a change event has to be signed by somebody, and the
    anonymous reader key would be publishing under an identity that is not a
    person. A reader without an account sees the dash, which is honest.

    `attempted` stops the five-second poll from re-firing while the writes are in
    flight — the state it reads has not refreshed yet, so without it every tick
    would queue the same batch again.
  */
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!project || !signedIn()) return
    const missing = issues.filter((row) => !row.ref && !attempted.current.has(row.addr))
    if (missing.length === 0) return
    for (const row of missing) attempted.current.add(row.addr)
    void assignMissingRefs(project, state).then(() => refresh())
  }, [project, issues, state, refresh])

  const done = issues.filter((issue) => issue.status === 'done').length
  const set = (field: 'title' | 'description' | 'status' | 'lead', value: string, note: string, contentFormat?: string) => act(note, () => setProjectField(project, field, value, note, contentFormat), say, refresh)
  // Its own archive, which the rail toggles; and the one the page shows, which may be its team's (FOL-46).
  const own = ownArchive(project, state.activity)
  const archive = archives.ofProject(project.addr)
  const unarchive = () =>
    void act('Unarchive', () => archiveProject(project, false), say, refresh).then((ok) => {
      if (ok) say('Project restored')
    })

  return (
    <>
      <ProjectView
        archivedNotice={
          archive && (
            <ArchivedNotice
              archive={archive}
              nameOf={directory.nameOf}
              onUnarchive={unarchive}
              {...(archive.with?.id ? { onOpenParent: () => go({ name: 'folder', id: archive.with!.id! }) } : {})}
            />
          )
        }
        // Archived, its own fields stay shut until it is unarchived (SHI-36), and it takes no comment or reaction (Decided 2026-10-17).
        lockedReason={lockedReason(archive)}
        commentsClosed={archivedLine(archive)}
        members={
          <Members
            key={project.addr}
            members={judges.members}
            me={me}
            people={people}
            nameOf={directory.nameOf}
            pictureOf={(pubkey) => directory.personOf(pubkey).picture}
            roles={[{ pubkey: project.author, role: 'Author' }, ...(project.lead ? [{ pubkey: project.lead, role: 'Lead' }] : [])]}
            // Membership is per file: leaving the project leaves its issues as they are (Miky, 2026-10-06).
            note="Your issues here still notify you."
            {...membershipActions({ kind: 'project', project }, project.title, directory.nameOf, say, async () => {
              await Promise.all([judges.reload(), refresh([project.contentFolder])])
            })}
          />
        }
        crumbs={{ projectsHref: href({ name: 'projects', archived: false }), title: project.title }}
        header={{
          title: project.title,
          description: project.description,
          descriptionFormat: project.descriptionFormat,
          nameOf: directory.nameOf,
          archived: !!archive,
          onRename: (value) => set('title', value, 'Rename'),
          summary: project.summary,
          // A refusal is said under the field, with your text still in it — not in a toast (SUM-4).
          onSummarize: (value) => actInField('Summary', () => setProjectField(project, 'summary', value, 'Summary'), refresh),
          onDescribe: (value, contentFormat, left) =>
            act('Description', () => setProjectField(project, 'description', value, 'Description', contentFormat), sayOnceLeft(say, project.title || 'Untitled project', left), refresh),
          descriptionBy: project.fields.description && project.fields.description.by !== me ? directory.nameOf(project.fields.description.by) : null,
        }}
        onAddIssue={() => setDialog('issue')}
        tab={tab}
        onTab={(next) => go({ name: 'project', d: project.id, slug: project.title, view, tab: next })}
        view={view}
        onView={(next) => go({ name: 'project', d: project.id, slug: project.title, view: next, tab })}
        issues={issues}
        issueStatuses={ISSUE_STATUSES}
        hrefFor={hrefForIssue}
        related={related}
        threads={threads}
        unread={unread}
        stillUnread={stillUnread}
        onThreadShown={onThreadShown}
        // A project conversation is already in the topic it belongs to, so a
        // reference would be noise (withReference: false), as the old app has it.
        onStartConversation={async (body, files, picks, blockId) => {
          // The project's own Folder (workFolder), written into and then re-read.
          let folder: string
          try {
            folder = workFolder(project)
          } catch (error) {
            return error instanceof Error ? error.message : String(error)
          }
          return actInField('Message', () => startConversation({ folder, about: project.addr, withReference: false, body, blockId, files, urgent: picks?.urgent, embeds: picks?.embeds }), () => refresh([folder]))
        }}
        onCopyBlockLink={(link) => void copyText(link, 'Link copied', 'Copy this link:', say)}
        onReply={(threadId, body, files, picks) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return Promise.resolve('That conversation is no longer on this page.')
          // The reply goes to the thread's own Folder, which need not be the project's.
          return actInField('Reply', () => reply(conversation, project.contentFolder, body, files, picks?.urgent, picks?.embeds), () => refresh([conversation.root.folder || project.contentFolder]))
        }}
        activity={activity.items}
        activityTruncated={activity.truncated}
        /* A reply in Activity goes to the thread's own Folder, never this
           project's — CON-9. Refused when the thread's root carries no `h`,
           because filing somebody else's reply here is the wrong guess. */
        about={project.addr}
        /*
          A reaction, published then re-read — CON-2.

          `mine` is the id of the viewer's own reaction when they have one, so
          the same gesture adds or retracts. The retraction targets the
          reaction's own event, never the message: a kind:5 naming the message
          would be asking the relay to delete somebody's comment.
        */
        /*
          No `refresh`: a reaction is a kind:7 and is not in the fold, so a
          workspace re-read would spend 38 bridge requests to learn nothing.
          The reaction surface re-reads its own query instead — one request.
        */
        onReact={(messageId, emoji, mine) =>
          actInField('Reaction', () => (mine ? unreact(mine) : react(messageId, emoji)))
        }
        /*
          Deleting a comment — CON-3.

          `refresh` here, unlike `onReact`: a comment IS in the fold, so the
          workspace has to be re-read for it to leave the page. The relay stops
          returning a deleted event, so the next read simply does not contain
          it and nothing folds a tombstone.

          No author check. The relay accepts a kind:5 from the target's author
          or from the NIP-OA owner of an authoring agent, and no client can
          evaluate the second half — so the control is offered and the refusal
          is reported (SPEC §6.5, corrected 2026-09-06). `act` returns false on
          a refusal, which keeps the confirm dialog open behind the banner.
        */
        onDeleteMessage={(messageId) => {
          const folder = folderOfMessage(state, messageId)
          return act('Delete', () => deleteMessage(messageId), say, () => refresh(folder ? [folder] : undefined))
        }}
        /*
          Editing a comment — CON-4.

          **The message's OWN Folder, never this page's.** An edit is
          channel-scoped (40003 is in `requires_h_channel_scope`), and a message
          reached through Activity belongs to a different file — publishing it
          under this surface's Folder would be refused, or worse, accepted into
          the wrong channel. So the Folder is looked up from the message, the
          same rule `onReplyInActivity` keeps for replies.

          `refresh` because an edit IS in the read: `edits.ts` folds it beside
          the fold, so the new text arrives on the next workspace read rather
          than being patched in locally.

          No author check. The relay takes an edit from the target's effective
          author or the NIP-OA owner of an authoring agent, and no client can
          evaluate the second half — same reasoning as the deletion above.
        */
        onEditMessage={(messageId, body, removeCard) => {
          const folder = folderOfMessage(state, messageId)
          if (!folder) {
            return Promise.resolve('That message has no Folder to publish an edit into.')
          }
          return actInField(removeCard ? 'Remove card' : 'Edit', () => editMessage(folder, messageId, body, cardEditOf(state, messageId, removeCard)), () => refresh([folder]))
        }}
        onReplyInActivity={(threadId, body, files, picks) => {
          const conversation = state.conversations.find((c) => c.id === threadId)
          if (!conversation?.root.folder) return Promise.resolve('That conversation has no Folder to reply into.')
          return actInField('Reply', () => reply(conversation, conversation.root.folder, body, files, picks?.urgent, picks?.embeds), () => refresh([conversation.root.folder]))
        }}
        rail={{
          status: project.status,
          statuses: PROJECT_STATUSES.map(({ value, label }) => ({ value, label })),
          onStatusChange: (value) => void set('status', value, `Status → ${value}`),
          lead: project.lead ?? '',
          people,
          // PEEK-22 calls this "assignee"; the spec's tag is `lead`. Same field.
          onLeadChange: (value) => void set('lead', value, value ? 'Assign project' : 'Unassign project'),
          done,
          total: issues.length,
          // The top-level Folder it is in, by the sidebar's rule: the state that lists it, then its own Folder (FOL-3).
          // No top-level Folders at all is a refused or empty read, not "in none" — the rail says so (`null`).
          folders:
            teams &&
            (teams.length === 0
              ? null
              : placedIn({ addr: project.addr, folder: project.contentFolder }, teams).map((folder) => ({ name: folder.name ?? 'Untitled Folder', href: href({ name: 'folder', id: folder.id }) }))),
          // Only once there are Folders to move between (FOL-7).
          ...(teams?.length ? { onMove: () => setDialog('move') } : {}),
          // Archiving asks first — it hides the issues too; restoring does not need to (FOL-46).
          // The rail says the project's own state: archived with its team, there is nothing here to unarchive.
          archived: !!own,
          onArchive: () => (own ? unarchive() : setDialog('archive')),
          onDelete: () => setDialog('delete'),
        }}
      />

      {dialog === 'issue' && (
        <NewIssueDialog
          projects={[{ value: project.addr, label: project.title }]}
          project={{ addr: project.addr, title: project.title }}
          holdKey={newIssueHold}
          onClose={() => setDialog(null)}
          onCreate={async (draft) => {
            const result = await createIssue(project, state, draft)
            if (!result.ok) {
              say(`Issue rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh([result.folder ?? project.contentFolder])
            say('Issue created')
            return true
          }}
        />
      )}

      {dialog === 'move' && teams && <MoveProject project={project} teams={teams} say={say} onClose={() => setDialog(null)} />}

      {dialog === 'archive' && (
        <ArchiveDialog
          title={project.title}
          what="project"
          hides={issues.length ? [`its ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`] : []}
          onClose={() => setDialog(null)}
          onArchive={async (resolution) => {
            const ok = await act('Archive', () => archiveProject(project, true, resolution || undefined), say, refresh)
            if (ok) say('Project archived')
            return ok
          }}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete “${project.title}”?`}
          confirmLabel="Delete project"
          destructive
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await deleteProject(project, teams)
            if (!result.ok) {
              say(`Delete rejected — ${result.reason}`, 'error')
              return false
            }
            if (result.stillListed) say(`Project deleted, but its Folder refused to unlist it: ${result.stillListed}. Peek may keep showing a row for it.`, 'error')
            else say('Project deleted')
            // Nothing left to render here.
            go({ name: 'projects', archived: false })
            await refresh()
            return true
          }}
        >
          <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
          {issues.length > 0 && (
            <p>
              Its {issues.length} {issues.length === 1 ? 'issue is a separate event and is' : 'issues are separate events and are'} not deleted — they stay in the Folder and stop being
              reachable from here.
            </p>
          )}
          <p className="text-text-secondary">Archiving is reversible and usually what you want.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
