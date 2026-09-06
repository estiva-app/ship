import { useMarkRead } from '@/lib/useMarkRead'
import { pointerToAddress, referenceToPointer, resolveBlockAnchor, type ContentFormat } from '@estiva-app/protocol'
import { signedIn } from '@/auth/estivaId'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ISSUE_STATUSES,
  PROJECT_STATUSES,
  archiveProject,
  createIssue,
  deleteProject,
  folderLink,
  me,
  pairProjectFolder,
  peopleIn,
  reply,
  assignMissingRefs,
  setProjectField,
  startConversation,
  projectContext,
  useMergedReadState,
  firstUnreadByThread,
  commentsOn,
  mentionsOf,
  commentsOnAny,
  type DirectoryView,
  type FolderState,
  type WorkspaceState,
} from '@/api'
import type { ThreadData } from '@/components/ConversationThread'
import type { ActivityItem } from '@/components/Activity'
import type { IssuesTableRow } from '@/components/IssuesTable'
import { NewIssueDialog } from '@/components/NewIssueDialog'
import { PairFolderDialog } from '@/components/PairFolderDialog'
import type { RailPerson } from '@/components/ProjectRail'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectView } from '@/views/ProjectView'
import { go, href, type ProjectView as ProjectViewName } from '../router'
import { act, type Say } from './act'
import { hrefForIssue, rowFor } from './IssuesPage'

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
): ThreadData {
  const message = (m: FolderState['conversations'][number]['root']) => ({
    id: m.id,
    author: directory.personOf(m.author),
    at: m.createdAt,
    body: omitOwnReference(m.body, self),
    anchor: resolveBlockAnchor(m.blockId, body?.value ?? '', body?.format ?? 'marker'),
    // Carried for the unread rule only: your own writing is never new to you.
    by: m.author,
  })
  return { id: conversation.id, root: message(conversation.root), replies: conversation.replies.map(message) }
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
 * **`undefined` is a real answer and is drawn as nothing.** A Peek topic paired
 * with no project is a Folder and nothing else — Ship has no name for it, and
 * inventing one ("Folder 4f3a…") would be a worse row than a quiet one. The
 * same goes for a Folder this reader cannot see into: the thread reached them
 * some other way and its home did not.
 */
export function whereThreadLives(folder: string, state: FolderState): string | undefined {
  if (!folder) return undefined
  const project = state.projects.find((candidate) => candidate.contentFolder === folder)
  if (project) return project.title
  const issue = state.issues.find((candidate) => candidate.folder === folder)
  if (issue) return issue.ref ? `${issue.ref} · ${issue.title}` : issue.title
  return undefined
}

/**
 * The Activity list for one object — the mentions half (CON-7, RIC-12).
 *
 * Ordered by last activity, which is the order `foldConversations` already
 * leaves them in: CON-9 asks for one time-ordered list rather than a section
 * per relation, so the sort is the list's own and the relation rides along as
 * metadata.
 *
 * The sub-file half arrives next and slots in here as a second `relation`.
 *
 * **The anchor body is deliberately not passed to `threadFor`.** A block anchor
 * resolves against *the object the comment is about*, and these comments are
 * about other objects — resolving them against this page's description would
 * report a block that has nothing to do with them. Passing nothing reports
 * every anchor as unaddressable, which is honest rather than wrong.
 */
export function activityFor(
  addr: string,
  state: WorkspaceState,
  directory: DirectoryView,
  /**
   * The files nested under this one, whose conversations roll up. A project
   * passes its issues; an issue passes nothing, because nothing nests under one
   * until FOL-2.
   */
  subFiles: readonly { addr: string; label: string }[] = [],
): { items: ActivityItem[]; truncated: number } {
  const mentions: ActivityItem[] = mentionsOf(state.conversations, addr, state.tagged).map((conversation) => ({
    thread: threadFor(conversation, directory, undefined, addr),
    relation: 'mention' as const,
    where: whereThreadLives(conversation.root.folder, state),
  }))

  const labels = new Map(subFiles.map((file) => [file.addr, file.label]))
  const rolled: ActivityItem[] = commentsOnAny(state.conversations, new Set(labels.keys()), state.tagged).map(
    ({ conversation, about }) => ({
      thread: threadFor(conversation, directory, undefined, about),
      relation: 'sub-file' as const,
      where: labels.get(about),
    }),
  )

  /*
    One time-ordered list — CON-9 — so the two relations are merged and sorted
    rather than concatenated. `foldConversations` already orders conversations
    most-recently-active first, and re-deriving that here from `lastAt` would be
    a second opinion about ordering; taking the fold's order and merging on the
    root's time keeps one.
  */
  const all = [...mentions, ...rolled].sort((a, b) => lastActivity(b.thread) - lastActivity(a.thread))
  return { items: all.slice(0, ACTIVITY_HORIZON), truncated: Math.max(0, all.length - ACTIVITY_HORIZON) }
}

const lastActivity = (thread: ThreadData) => Math.max(thread.root.at, ...thread.replies.map((r) => r.at))

/**
 * How much of a roll-up Activity shows — the horizon, decided rather than
 * inherited (CON-9, on CON-1's precedent).
 *
 * A project with 200 issues has an unbounded roll-up, and an unbounded list is
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
  d,
  view,
  say,
  refresh,
}: {
  state: WorkspaceState
  directory: DirectoryView
  /** The object's `d`, which is all a §7.2 URL carries. */
  d: string
  view: ProjectViewName
  say: Say
  refresh: () => Promise<void>
}) {
  const project = state.projects.find((candidate) => candidate.id === d)
  const [dialog, setDialog] = useState<'issue' | 'pair' | 'delete' | null>(null)

  const issues = useMemo<IssuesTableRow[]>(() => {
    if (!project) return []
    return state.issues
      .filter((issue) => issue.projectAddr === project.addr)
      .map((issue) => {
        const touched = state.activity.filter((change) => change.target === issue.addr).at(-1)
        return { ...rowFor(issue, state, directory), openedBy: directory.personOf(issue.author), at: touched?.createdAt ?? issue.createdAt }
      })
  }, [project, state, directory])

  const activity = useMemo(() => {
    if (!project) return { items: [], truncated: 0 }
    /* The sub-files are this project's issues — data that exists today, which is
       why the roll-up needs no folder nesting. Labelled by ref where there is
       one, because that is how a person says which issue they mean. */
    const subFiles = state.issues
      .filter((issue) => issue.projectAddr === project.addr)
      .map((issue) => ({ addr: issue.addr, label: issue.ref ? `${issue.ref} · ${issue.title}` : issue.title }))
    return activityFor(project.addr, state, directory, subFiles)
  }, [project, state, directory])

  /*
    The project's OWN conversation — CON-9, and this line changed with it.

    It used to be every thread in the content Folder, *deliberately including the
    ones about an issue*, because there was nowhere else for those to go. There
    is now: they are the sub-file half of Activity. Leaving them here as well
    would put the same thread twice on one page, in two lists that are supposed
    to mean different things.

    **The filter stays the Folder, not the `a` tag.** A project *is* a Folder, so
    a message written in the paired Peek topic is the project's conversation even
    though nobody tagged anything — that is identity, and identity merges. Asking
    for `commentsOn(project.addr)` instead would have been tidier and would have
    silently emptied every project paired with a topic people actually talk in.
  */
  const rolledUp = useMemo(() => new Set(activity.items.filter((i) => i.relation === 'sub-file').map((i) => i.thread.id)), [activity])
  const conversations = useMemo(
    () => (project ? state.conversations.filter((c) => c.root.folder === project.contentFolder && !rolledUp.has(c.id)) : []),
    [project, state, rolledUp],
  )
  /* A project *is* a container, so it takes the container context: its Folder's
     bare channel uuid (SPEC §11.1). Looking at the project marks the container
     read; its issues' discussions are separate contexts and are untouched. */
  useMarkRead([projectContext(project?.contentFolder)])
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, project ? { value: project.description, format: project.descriptionFormat } : undefined, project?.addr)),
    [conversations, directory, project],
  )
  /* The divider in the feed (CRO-13). A project IS the container, so its own
     marker governs the roots and propagates down to their replies. */
  const merged = useMergedReadState()
  const unread = useMemo(
    () => firstUnreadByThread(threads, merged, projectContext(project?.contentFolder), me),
    [threads, merged, project],
  )
  const people = useMemo(() => railPeople(state, directory), [state, directory])

  if (!project) {
    return <EmptyState className="py-12" message="That project is not in this workspace, or lives in a Folder you cannot read." />
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
    const mine = state.issues.filter((issue) => issue.projectAddr === project.addr)
    void assignMissingRefs(project, mine).then(() => refresh())
  }, [project, issues, state.issues, refresh])

  const done = issues.filter((issue) => issue.status === 'done').length
  const set = (field: 'title' | 'description' | 'status' | 'lead', value: string, note: string, contentFormat?: string) => act(note, () => setProjectField(project, field, value, note, contentFormat), say, refresh)

  return (
    <>
      <ProjectView
        crumbs={{ projectsHref: href({ name: 'projects', archived: false }), title: project.title }}
        header={{
          title: project.title,
          description: project.description,
          descriptionFormat: project.descriptionFormat,
          nameOf: directory.nameOf,
          archived: project.archived,
          onRename: (value) => set('title', value, 'Rename'),
          onDescribe: (value, contentFormat) => set('description', value, 'Description', contentFormat),
        }}
        onAddIssue={() => setDialog('issue')}
        view={view}
        onView={(next) => go({ name: 'project', d: project.id, slug: project.title, view: next })}
        issues={issues}
        issueStatuses={ISSUE_STATUSES}
        hrefFor={hrefForIssue}
        threads={threads}
        unread={unread}
        // A project conversation is already in the topic it belongs to, so a
        // reference would be noise (withReference: false), as the old app has it.
        onStartConversation={(body) => act('Message', () => startConversation({ folder: project.contentFolder, about: project.addr, withReference: false, body }), say, refresh)}
        onReply={(threadId, body) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return false
          return act('Reply', () => reply(conversation, project.contentFolder, body), say, refresh)
        }}
        activity={activity.items}
        activityTruncated={activity.truncated}
        /* A reply in Activity goes to the thread's own Folder, never this
           project's — CON-9. Refused when the thread's root carries no `h`,
           because filing somebody else's reply here is the wrong guess. */
        onReplyInActivity={(threadId, body) => {
          const conversation = state.conversations.find((c) => c.id === threadId)
          if (!conversation?.root.folder) return false
          return act('Reply', () => reply(conversation, conversation.root.folder, body), say, refresh)
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
          folder: project.contentFolder,
          onCopyFolderLink: () =>
            void copyText(folderLink(project.contentFolder), 'Folder link copied — paste it into Peek to pair a topic.', 'Copy this Folder link:', say),
          onPairFolder: () => setDialog('pair'),
          onArchive: () =>
            void act(project.archived ? 'Unarchive' : 'Archive', () => archiveProject(project, !project.archived), say, refresh).then((ok) => {
              if (ok) say(project.archived ? 'Project restored.' : 'Project archived.')
            }),
          onDelete: () => setDialog('delete'),
        }}
      />

      {dialog === 'issue' && (
        <NewIssueDialog
          projects={[{ value: project.addr, label: project.title }]}
          project={{ addr: project.addr, title: project.title }}
          onClose={() => setDialog(null)}
          onCreate={async (draft) => {
            const result = await createIssue(project, state.issues, draft)
            if (!result.ok) {
              say(`Issue rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            return true
          }}
        />
      )}

      {dialog === 'pair' && (
        <PairFolderDialog
          currentFolder={project.contentFolder}
          onClose={() => setDialog(null)}
          onPair={async (folder) => {
            const result = await pairProjectFolder(project, folder)
            if (!result.ok) {
              say(`Folder link rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            if (result.announced === false) {
              say(
                `Paired, and new issues will land in that Folder — but the Folder itself refused the note that says so${result.announceReason ? `: ${result.announceReason}` : '.'} Apps reading that Folder may not find this project until an issue is filed in it.`,
                'error',
              )
            } else {
              say('Paired. New issues will land in that Folder.')
            }
            return true
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
            const result = await deleteProject(project)
            if (!result.ok) {
              say(`Delete rejected — ${result.reason}`, 'error')
              return false
            }
            say('Deletion requested.')
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
