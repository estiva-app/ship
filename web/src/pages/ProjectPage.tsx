import { IconLinkOff } from '@tabler/icons-react'
import { useMarkRead } from '@/lib/useMarkRead'
import { ownConversations } from '@/lib/ownConversation'
import { pointerToAddress, referenceToPointer, resolveBlockAnchor, type ContentFormat } from '@estiva-app/protocol'
import type { AttachmentIndex, EditIndex } from '@/api'
import { signedIn } from '@/auth/estivaId'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ISSUE_STATUSES,
  PROJECT_STATUSES,
  archiveProject,
  createIssue,
  deleteMessage,
  editMessage,
  deleteProject,
  folderLink,
  me,
  pairProjectFolder,
  peopleIn,
  react,

  reply,

  unreact,
  assignMissingRefs,
  setProjectField,
  startConversation,
  projectContext,
  fileContext,
  useMergedReadState,
  firstUnreadByThread,
  commentsOn,
  mentionsOf,
  commentsOnAny,
  projectFolders,
  type DirectoryView,
  type FolderState,
  type WorkspaceState,
} from '@/api'
import { useRelated } from '@/api/useRelated'
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
  /*
    Edits, applied here rather than in the fold — CON-4.

    `foldFolder` is a two-repo contract whose conformance test walks the union
    of keys, so the edit cannot be a field on `Message`; `edits.ts` folds it
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
): ThreadData {
  const message = (m: FolderState['conversations'][number]['root']) => {
    const edit = edits?.[m.id]
    return {
      id: m.id,
      author: directory.personOf(m.author),
      at: m.createdAt,
      // The edited text, if there is one — an edit changes the body and its
      // attachments (RFC 0.4 §7.2.1, amended 2026-09-23). The reference still
      // comes out of it, so an edit that keeps the pointer keeps the widget.
      body: omitOwnReference(edit?.body ?? m.body, self),
      // Milliseconds from the fold, seconds everywhere else on this shape.
      // Only a body change marks it: an edit that re-attaches files under the
      // same text is not "edited" (§7.2.1, CON-5).
      editedAt: edit?.edited ? Math.floor(edit.at / 1000) : undefined,
      anchor: resolveBlockAnchor(m.blockId, body?.value ?? '', body?.format ?? 'marker'),
      // Carried for the unread rule only: your own writing is never new to you.
      by: m.author,
      // Files, read off `imeta` beside the fold — CON-12. Undefined for the
      // messages that carry none, which is nearly all of them.
      files: attachments?.[m.id],
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
 */
export function activityFor(
  addr: string,
  state: WorkspaceState,
  directory: DirectoryView,
): { items: ActivityItem[]; truncated: number } {
  const mentions: ActivityItem[] = mentionsOf(state.conversations, addr, state.anchors).map((conversation) => ({
    thread: threadFor(conversation, directory, undefined, addr, state.edits, state.attachments),
    relation: 'mention' as const,
    where: whereThreadLives(conversation.root.folder, state),
  }))
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

  const activity = useMemo(
    () => (project ? activityFor(project.addr, state, directory) : { items: [], truncated: 0 }),
    [project, state, directory],
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
  const conversations = useMemo(
    () =>
      project
        ? ownConversations(state.conversations, { addr: project.addr, originFolder: project.originFolder, folders: projectFolders(project, state.activity) }, state.anchors).filter((c) => !rolledUp.has(c.id))
        : [],
    [project, state, rolledUp],
  )
  /* This feed is two streams drawn as one — SPEC §11.1 (FOL-16): the record
     channel's chat, which answers to its bare channel uuid, and the project's
     own comments, which answer to the project's address. Looking at the page
     advances both, because both are on it — §11.2, "exactly the streams you are
     showing". Its issues' comments are other files' streams and are untouched;
     before FOL-16 their roots answered to the channel marker, so this line
     silently read every issue in the project.

     The channel is the **record** channel, not the content Folder (FOL-1): that
     is the only Folder whose chat this page draws. For a project pointing at a
     team, marking the content Folder would advance the team's chat, which is
     not on this page. For a project never relinked the two are the same. */
  useMarkRead([projectContext(project?.originFolder), fileContext(project?.addr)])
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, project ? { value: project.description, format: project.descriptionFormat } : undefined, project?.addr, state.edits, state.attachments)),
    [conversations, directory, project],
  )
  /* The divider in the feed (CRO-13). A root about the project — its own `a`
     tag names it — answers to the project's marker; a root with no `a` is the
     record channel's chat and answers to that channel's. `ownConversations`
     already dropped roots about any other file, so those are the only two
     cases. */
  const merged = useMergedReadState()
  const unread = useMemo(() => {
    const channel = projectContext(project?.originFolder)
    const file = fileContext(project?.addr)
    const aboutProject = new Set(conversations.filter((c) => project && (state.anchors[c.root.id] ?? []).includes(project.addr)).map((c) => c.id))
    return firstUnreadByThread(threads, merged, (thread) => (aboutProject.has(thread.id) ? file : channel), me)
  }, [threads, merged, project, conversations, state.anchors])
  const people = useMemo(() => railPeople(state, directory), [state, directory])
  /*
    What somebody placed under this project from another app — RFC 0.5 §10.7.

    Read from the project's content Folder, which is where a file placed
    "under" it lives: Peek starts a topic under a project inside the Folder the
    person is looking at, and that Folder lists the project. Not the fold — the
    fold is Ship's kinds, and these are by definition not.
  */
  const related = useRelated(project?.contentFolder, project?.addr)

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
        related={related}
        threads={threads}
        unread={unread}
        // A project conversation is already in the topic it belongs to, so a
        // reference would be noise (withReference: false), as the old app has it.
        onStartConversation={(body, files) => act('Message', () => startConversation({ folder: project.contentFolder, about: project.addr, withReference: false, body, files }), say, refresh)}
        onReply={(threadId, body, files) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return false
          return act('Reply', () => reply(conversation, project.contentFolder, body, files), say, refresh)
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
          mine ? act('Reaction', () => unreact(mine), say) : act('Reaction', () => react(messageId, emoji), say)
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
        onDeleteMessage={(messageId) => act('Delete', () => deleteMessage(messageId), say, refresh)}
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
        onEditMessage={(messageId, body) => {
          const folder = folderOfMessage(state, messageId)
          if (!folder) {
            say('That message has no Folder to publish an edit into.', 'error')
            return false
          }
          return act('Edit', () => editMessage(folder, messageId, body), say, refresh)
        }}
        onReplyInActivity={(threadId, body, files) => {
          const conversation = state.conversations.find((c) => c.id === threadId)
          if (!conversation?.root.folder) return false
          return act('Reply', () => reply(conversation, conversation.root.folder, body, files), say, refresh)
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
            void copyText(folderLink(project.contentFolder), 'Folder link copied', 'Copy this Folder link:', say),
          onPairFolder: () => setDialog('pair'),
          onArchive: () =>
            void act(project.archived ? 'Unarchive' : 'Archive', () => archiveProject(project, !project.archived), say, refresh).then((ok) => {
              if (ok) say(project.archived ? 'Project restored' : 'Project archived')
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
            say('Issue created')
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
              say('Folder paired')
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
            say('Project deleted')
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
