import { IconLinkOff } from '@tabler/icons-react'
import { newestDrawn, useMarkRead, useShownThreads } from '@/lib/useMarkRead'
import { useNewSince } from '@/lib/useNewSince'
import { useCallback, useMemo, useState } from 'react'
import { ArchiveDialog, ArchivedNotice } from '@estiva-app/ui'
import { ARCHIVE_WORDS, archivedLine, archivedNoticeOf, lockedReason, ownArchive, type Archives } from '@/lib/archive'
import { ISSUE_STATUSES, addMentioned, archiveIssue, commentsOn, deleteIssue, deleteMessage, editMessage, react, reply, setIssueField, unreact, startConversation, type DirectoryView, type FolderState, type WorkspaceState, threadContext, fileContext, useMergedReadState, useFeedJudges, unreadByThread } from '@/api'
import { me, useMentionsElsewhere } from '@/api'
import { useRelated } from '@/api/useRelated'
import { useThreads } from '@/api/useThreads'
import { Members } from '@/components/Members'
import { membershipActions } from './membership'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { IssueView } from '@/views/IssueView'
import { go, href, type IssueTab } from '../router'
import { act, actInField, sayOnceLeft, type Say } from './act'
import { editedFor, historyFor } from './history'
import { activityFor, cardEditOf, copyText, folderOfMessage, pickerPeople, refreshAfter, threadFor, useMentionLinks, withElsewhere } from './ProjectPage'
import { useReferencePage } from '@/api/references'

/**
 * One issue from the fold, as the old app's issueView: the trail (its
 * project, or none), title and description, every conversation that
 * mentions it — including ones started in Peek before it came up — its
 * history, and its fields. History and conversation stay two sections (REW-4). Every
 * field edit is one change event to the issue's own Folder, followed by a
 * re-read; a refused one leaves the field as the relay has it.
 */
export function IssuePage({ state, directory, archives, d, tab, say, refresh }: { state: WorkspaceState; directory: DirectoryView; /** What is archived, and what with — FOL-46. */ archives: Archives; /** The object's `d`, which is all a §7.2 URL carries. */ d: string; /** The open tab — Overview or Activity. */ tab: IssueTab; say: Say; refresh: (folders?: string[]) => Promise<void> }) {
  const issue = state.issues.find((candidate) => candidate.id === d)
  const project = issue?.projectAddr ? state.projects.find((candidate) => candidate.addr === issue.projectAddr) : undefined
  /*
    The conversations this page draws, read for it (APP-5): its own Folder's,
    its project's for what `[` offers, and every Folder holding a comment on it
    or a mention of it, for its conversation and Activity.
  */
  const held = useThreads(state, issue ? [issue.folder, ...(project ? [project.contentFolder] : [])] : [], issue ? [issue.addr] : [])

  /*
    The object's own discussion — CON-7. `conversationsAbout` returned the union
    of comments and mentions, so a Peek thread that named this issue on its last
    message sat in here indistinguishably from something written about it. §5.1
    calls that indefensible; the mentions are in Activity below.
  */
  const conversations = useMemo(() => (issue ? commentsOn(state.conversations, issue.addr, state.anchors) : []), [issue, state])
  /* Activity is where else this issue was mentioned (PEE-26). */
  const { events: elsewhere, reread: rereadElsewhere } = useMentionsElsewhere(issue?.addr, state)
  const linksAnswered = useMentionLinks(issue?.addr, state, elsewhere)
  const activity = useMemo(
    () => (issue ? activityFor(issue.addr, state, directory, archives, undefined, undefined, elsewhere) : { items: [], truncated: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a link's answer coming back reads the list again
    [issue, state, directory, archives, linksAnswered, elsewhere],
  )
  // A row Activity read from elsewhere is edited, deleted and replied to in its own Folder, as any other.
  const acting = withElsewhere(state, elsewhere)
  /* An issue's comments are its own stream, keyed on its address — SPEC §11.1
     (FOL-16) — so reading it advances that address and one `thread:` context
     per discussion, and never the project's channel: §11.2, and doing it the
     other way would make reading one issue mark the whole project read. Before
     FOL-16 only the threads moved, and the roots answered to the project's
     marker, so a new top-level comment stayed new until the project page was
     opened and opening the project page read every issue's roots.

     Both advance only while the comments are drawn: a `thread:` context
     while its replies are shown (CON-34, under §11.3's thread rule), the
     issue's own stream whenever the comments column is shown (66b31c4b, Miky
     2026-10-06: what is not on screen is not read). The column is beside the
     page on every tab since ONE-6, step 4c, and the header hides it; until
     then the comments were the Activity tab's. */
  // The comments column, shown until the person hides it (Katerina, 2 November).
  const [commentsShown, setCommentsShown] = useState(true)
  const [shownThreads, onThreadShown] = useShownThreads()
  const drawn = useMemo(() => newestDrawn(conversations, shownThreads), [conversations, shownThreads])
  // Nor while its conversations are on the way (APP-5): with none drawn, the mark would be the clock's.
  const fileContexts = useMemo(() => (commentsShown && held.all ? [fileContext(issue?.addr)] : []), [issue, commentsShown, held.all])
  useMarkRead(fileContexts, drawn.rootsAt)
  useMarkRead(commentsShown ? shownThreads.map(threadContext) : [], drawn.repliesAt)
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, issue ? { value: issue.description, format: issue.descriptionFormat } : undefined, issue?.addr, state.edits, state.attachments, state.urgent, state.parts, state.embeds)),
    [conversations, directory, issue],
  )
  /* The divider in the feed (CRO-13, CON-19). Every root here is about the
     issue, so they all answer to the issue's marker, which §11.3 propagates
     down to their replies — and the project's marker is deliberately not in the
     picture. Whether a message is new to you is §11.8's call, made by the
     package: you must be a member of the issue, and a muted issue lights only
     for a message that names you. */
  const merged = useMergedReadState()
  const judges = useFeedJudges(issue ? { addr: issue.addr, createdAt: issue.createdAt } : undefined, undefined)
  const verdictAt = useCallback(
    (frontier: Readonly<Record<string, number>>) => (judges.file ? unreadByThread(conversations, frontier, () => judges.file) : undefined),
    [conversations, judges],
  )
  // Judged against the frontier this visit opened on, so the divider outlives the page's own marks (99557309).
  const { unread, stillUnread } = useNewSince(issue?.addr, merged, verdictAt)
  const history = useMemo(() => (issue ? historyFor(issue.addr, state, directory) : []), [issue, state, directory])
  const people = useMemo(() => pickerPeople(state, directory), [state, directory])
  const projects = useMemo(
    // No move into an archived project, a new child under it (SPEC §6.5); its own stays listed, and moving out stays offered.
    () => [{ value: '', label: 'No project' }, ...state.projects.filter((p) => p.addr === issue?.projectAddr || !archives.ofProject(p.addr)).map((p) => ({ value: p.addr, label: p.title }))],
    [state, archives, issue?.projectAddr],
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [archiving, setArchiving] = useState(false)
  /* What somebody placed under this issue from another app — RFC 0.5 §10.7.
     Read from the issue's own Folder, the one a file placed under it is
     written into; see the same line on ProjectPage. */
  const related = useRelated(issue?.folder, issue?.addr)
  /* What `[` offers here (PEE-21): this issue's messages, then its project's
     (Miky, 2026-10-03); this Folder's files from the Related read, then the
     ones you read recently. This issue is never offered under Files. */
  const projectThreads = useMemo(
    () => (project ? commentsOn(state.conversations, project.addr, state.anchors).map((c) => threadFor(c, directory, undefined, project.addr, state.edits, state.attachments, state.urgent, state.parts, state.embeds)) : []),
    [project, state, directory],
  )
  useReferencePage({ address: issue?.addr, parent: projectThreads, folder: typeof related === 'object' ? related.all : undefined, readState: merged })

  if (!issue) {
    return (
      <EmptyState
        icon={<IconLinkOff size={16} stroke={1.5} />}
        message="That issue is not in this workspace, or is in a Folder you cannot read."
      />
    )
  }

  const set = (field: 'title' | 'description' | 'status' | 'assignee' | 'project', value: string, note: string, contentFormat?: string) =>
    act(note, () => setIssueField(issue, field, value, note, contentFormat), say, () => refresh([issue.folder]))
  // Its own archive, which the ⋯ toggles; and the one shown first, which may be its project's (FOL-46).
  const own = ownArchive(issue, state.activity)
  const archive = archives.ofIssue(issue)
  // The notice's Unarchive waits for the answer.
  const unarchive = () =>
    act('Unarchive', () => archiveIssue(issue, false), say, () => refresh([issue.folder])).then((ok) => {
      if (ok) say('Issue restored')
    })

  return (
    <>
      <IssueView
        // When it last changed, over the page (ONE-6, step 4a).
        edited={editedFor(issue.addr, state, directory, { at: issue.createdAt, by: issue.author })}
        tab={tab}
        onTab={(next) => go({ name: 'issue', d: issue.id, slug: issue.title, tab: next })}
        comments={{ shown: commentsShown, onShownChange: setCommentsShown }}
        archivedNotice={
          archive && (
            <ArchivedNotice
              {...archivedNoticeOf(archive, directory.nameOf)}
              onUnarchive={unarchive}
              // Opens what is archived: the project, or the team it is archived with.
              {...(archive.with?.kind === 'folder' && archive.with.id
                ? { onOpenParent: () => go({ name: 'folder', id: archive.with!.id! }) }
                : archive.with && project
                  ? { onOpenParent: () => go({ name: 'project', d: project.id, slug: project.title, view: 'table' }) }
                  : {})}
            />
          )
        }
        // Archived, its own fields stay shut until it is unarchived (SHI-36), and it takes no comment or reaction (Decided 2026-10-17).
        lockedReason={lockedReason(archive)}
        commentsClosed={archivedLine(archive)}
        members={
          <Members
            // A new issue is a new dialog: an open one must not carry over to the next page.
            key={issue.addr}
            members={judges.members}
            me={me}
            people={people}
            nameOf={directory.nameOf}
            personOf={directory.personOf}
            roles={[{ pubkey: issue.author, role: 'Author' }, ...(issue.assignee ? [{ pubkey: issue.assignee, role: 'Assignee' }] : [])]}
            {...membershipActions({ kind: 'issue', issue }, issue.title, directory.nameOf, say, async () => {
              await Promise.all([judges.reload(), refresh([issue.folder])])
            })}
          />
        }
        crumbs={{
          issuesHref: href({ name: 'issues' }),
          project: project ? { title: project.title, href: href({ name: 'project', d: project.id, slug: project.title, view: 'table' }) } : undefined,
          ref: issue.ref,
        }}
        title={issue.title}
        description={issue.description}
        descriptionFormat={issue.descriptionFormat}
        nameOf={directory.nameOf}
        onRename={(value) => set('title', value, 'Rename')}
        summary={issue.summary}
        // A refusal is said under the field, with your text still in it — not in a toast (SUM-4).
        onSummarize={(value) => actInField('Summary', () => setIssueField(issue, 'summary', value, 'Summary'), () => refresh([issue.folder]))}
        onCopyBlockLink={(link) => void copyText(link, 'Link copied', 'Copy this link:', say)}
        onDescribe={(value, contentFormat, left) =>
          act('Description', () => setIssueField(issue, 'description', value, 'Description', contentFormat), sayOnceLeft(say, issue.title || 'Untitled issue', left), () => refresh([issue.folder]))
        }
        // Whoever a save names anew is added to the issue, as the Add button does (WBD-7).
        onMention={(people) => addMentioned({ kind: 'issue', issue }, people, me)}
        // The profile's name only: with none the line says "Someone", as Leaf's does, never a shortened key.
        descriptionBy={issue.fields.description && issue.fields.description.by !== me ? (directory.profileOf(issue.fields.description.by)?.name ?? null) : null}
        related={related}
        threads={threads}
        conversationsLoading={!held.folders}
        mentionsLoading={!held.all}
        unread={unread}
        stillUnread={stillUnread}
        onThreadShown={onThreadShown}
        // Threads about an issue carry a reference in the body so Peek renders
        // the issue's widget above them (withReference: true), as the old app has it.
        onStartConversation={(body, files, picks, blockId) => actInField('Message', () => startConversation({ folder: issue.folder, about: issue.addr, withReference: true, body, blockId, files, urgent: picks?.urgent, embeds: picks?.embeds }), () => refresh([issue.folder]))}
        onReply={(threadId, body, files, picks) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return Promise.resolve('That conversation is no longer on this page.')
          return actInField('Reply', () => reply(conversation, issue.folder, body, files, picks?.urgent, picks?.embeds), () => refresh([issue.folder]))
        }}
        activity={activity.items}
        activityTruncated={activity.truncated}
        /*
          A reply in Activity goes to the thread's OWN Folder, never this
          issue's — CON-9. `reply()` already publishes into
          `conversation.root.folder`, so the fallback here is only reached for a
          thread whose root carries no `h` at all, and this issue's Folder is
          the wrong guess for that case: it would file somebody else's reply
          under this issue. Refusing is the honest answer.
        */
        about={issue.addr}
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
          const folder = folderOfMessage(acting, messageId)
          return act('Delete', () => deleteMessage(messageId), say, () => refreshAfter(state, folder, refresh, rereadElsewhere))
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
        onEditMessage={(messageId, body, removeCard, files, dropped) => {
          const folder = folderOfMessage(acting, messageId)
          if (!folder) {
            return Promise.resolve('That message has no Folder to publish an edit into.')
          }
          return actInField(removeCard ? 'Remove card' : 'Edit', () => editMessage(folder, messageId, body, cardEditOf(acting, messageId, removeCard, dropped), files), () => refreshAfter(state, folder, refresh, rereadElsewhere))
        }}
        onReplyInActivity={(threadId, body, files, picks) => {
          const conversation = acting.conversations.find((c) => c.id === threadId)
          if (!conversation?.root.folder) return Promise.resolve('That conversation has no Folder to reply into.')
          return actInField('Reply', () => reply(conversation, conversation.root.folder, body, files, picks?.urgent, picks?.embeds), () => refreshAfter(state, conversation.root.folder, refresh, rereadElsewhere))
        }}
        history={history}
        fields={{
          status: issue.status,
          // Each with its colour, so the picker draws the status's shape (ONE-6, step 4b).
          statuses: ISSUE_STATUSES.map(({ value, label, colour }) => ({ value, label, colour })),
          onStatusChange: (value) => void set('status', value, `Status → ${value}`),
          assignee: issue.assignee ?? '',
          people,
          onAssigneeChange: (value) => void set('assignee', value, value ? 'Assign' : 'Unassign'),
          project: issue.projectAddr ?? '',
          projects,
          onProjectChange: (value) => {
            const target = state.projects.find((p) => p.addr === value)
            void set('project', value, `Move to ${target?.title ?? 'No project'}`)
          },
          archived: !!own,
        }}
        menu={{
          // Its own archive, which the ⋯ toggles; archived only with its project, its own Archive stays offered (SPEC §6.5).
          archive: own ? 'own' : archive ? 'with' : 'none',
          onArchive: () => (own ? unarchive() : setArchiving(true)),
          onDelete: () => setConfirmingDelete(true),
          // The page's own address, without the open tab: the short link (`href` leaves the defaults out).
          onCopyLink: () => void copyText(new URL(href({ name: 'issue', d: issue.id, slug: issue.title }), window.location.origin).href, 'Link copied', 'Copy this link:', say),
        }}
      />
      {archiving && (
        <ArchiveDialog
          {...ARCHIVE_WORDS}
          title={issue.title}
          what="issue"
          hides={conversations.length ? [`its ${conversations.length} ${conversations.length === 1 ? 'conversation' : 'conversations'}`] : []}
          onClose={() => setArchiving(false)}
          onArchive={async (resolution) => {
            const ok = await act('Archive', () => archiveIssue(issue, true, resolution || undefined), say, () => refresh([issue.folder]))
            if (ok) say('Issue archived')
            return ok
          }}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${issue.title}”?`}
          confirmLabel="Delete issue"
          destructive
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            const result = await deleteIssue(issue)
            if (!result.ok) {
              say(`Delete rejected — ${result.reason}`, 'error')
              return false
            }
            say('Issue deleted')
            // Nothing left to render here.
            go(project ? { name: 'project', d: project.id, slug: project.title, view: 'table' } : { name: 'issues' })
            // Its own Folder only: re-reading the whole workspace per delete is PER-17.
            await refresh([issue.folder])
            return true
          }}
        >
          <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
          {conversations.length > 0 && (
            <p>
              Its {conversations.length} {conversations.length === 1 ? 'conversation is a separate event and is' : 'conversations are separate events and are'} not deleted — they stay
              in the Folder and stop being reachable from here.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}
