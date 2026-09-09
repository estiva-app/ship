import { IconLinkOff } from '@tabler/icons-react'
import { useMarkRead } from '@/lib/useMarkRead'
import { useMemo, useState } from 'react'
import { ISSUE_STATUSES, commentsOn, deleteIssue, deleteMessage, editMessage, react, referenceFor, reply, setIssueField, unreact, startConversation, type DirectoryView, type FolderState, type WorkspaceState, threadContext, useMergedReadState, firstUnreadByThread, projectContext, me } from '@/api'
import type { HistoryEntry } from '@/components/History'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { IssueView } from '@/views/IssueView'
import { go, href } from '../router'
import { act, type Say } from './act'
import { activityFor, copyText, folderOfMessage, railPeople, threadFor } from './ProjectPage'

/**
 * This issue's slice of the change stream, in words, newest first — the old
 * app's `activity`: "<who> set <field> to <value>", a pubkey in the value
 * shown as the person's name, an empty value as "(none)". Read off the
 * fold's list in the fold's order, then reversed for reading.
 */
export function historyFor(issueAddr: string, state: FolderState, directory: DirectoryView): HistoryEntry[] {
  return state.activity
    .filter((change) => change.target === issueAddr)
    .map((change) => ({
      id: change.id,
      by: directory.personOf(change.author),
      at: change.createdAt,
      text: `set ${change.field} to ${change.value === '' ? '(none)' : /^[0-9a-f]{64}$/.test(change.value) ? directory.nameOf(change.value) : change.value}`,
    }))
    .reverse()
}

/**
 * One issue from the fold, as the old app's issueView: the trail (its
 * project, or none), title and description, every conversation that
 * mentions it — including ones started in Peek before it came up — its
 * history, and the rail with who opened it and a working "Copy reference
 * for Peek". History and conversation stay two sections (REW-4). Every
 * field edit is one change event to the issue's own Folder, followed by a
 * re-read; a refused one leaves the field as the relay has it.
 */
export function IssuePage({ state, directory, d, say, refresh }: { state: WorkspaceState; directory: DirectoryView; /** The object's `d`, which is all a §7.2 URL carries. */ d: string; say: Say; refresh: () => Promise<void> }) {
  const issue = state.issues.find((candidate) => candidate.id === d)
  const project = issue?.projectAddr ? state.projects.find((candidate) => candidate.addr === issue.projectAddr) : undefined

  /*
    The object's own discussion — CON-7. `conversationsAbout` returned the union
    of comments and mentions, so a Peek thread that named this issue on its last
    message sat in here indistinguishably from something written about it. §5.1
    calls that indefensible; the mentions are in Activity below.
  */
  const conversations = useMemo(() => (issue ? commentsOn(state.conversations, issue.addr, state.tagged) : []), [issue, state])
  /* An issue has no sub-files until files nest (FOL-2), so its Activity is the
     mentions half alone. The roll-up argument is left empty rather than absent
     so the day nesting lands, this line is where it goes. */
  const activity = useMemo(
    () => (issue ? activityFor(issue.addr, state, directory) : { items: [], truncated: 0 }),
    [issue, state, directory],
  )
  /* An issue is an object *inside* a Folder, not a container of its own, so it
     advances one `thread:` context per discussion and never the project's
     container — SPEC §11.2. Doing it the other way would make reading one issue
     mark the whole project read. */
  useMarkRead(useMemo(() => conversations.map((c) => threadContext(c.id)), [conversations]))
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, issue ? { value: issue.description, format: issue.descriptionFormat } : undefined, issue?.addr, state.edits, state.attachments)),
    [conversations, directory, issue],
  )
  /* The divider in the feed (CRO-13). `issue.folder` is the container these
     conversations live in, so §11.3's hierarchy can apply — marking the project
     read clears replies that predate it. */
  const merged = useMergedReadState()
  const unread = useMemo(
    () => firstUnreadByThread(threads, merged, projectContext(issue?.folder), me),
    [threads, merged, issue],
  )
  const history = useMemo(() => (issue ? historyFor(issue.addr, state, directory) : []), [issue, state, directory])
  const people = useMemo(() => railPeople(state, directory), [state, directory])
  const projects = useMemo(
    () => [{ value: '', label: 'No project' }, ...state.projects.map((p) => ({ value: p.addr, label: p.title }))],
    [state],
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!issue) {
    return (
      <EmptyState
        icon={<IconLinkOff size={16} stroke={1.5} />}
        className="py-12"
        message="That issue is not in this workspace, or is in a Folder you cannot read."
      />
    )
  }

  const set = (field: 'title' | 'description' | 'status' | 'assignee' | 'project', value: string, note: string, contentFormat?: string) =>
    act(note, () => setIssueField(issue, field, value, note, contentFormat), say, refresh)

  return (
    <>
      <IssueView
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
        onDescribe={(value, contentFormat) => set('description', value, 'Description', contentFormat)}
        threads={threads}
        unread={unread}
        // Threads about an issue carry a reference in the body so Peek renders
        // the issue's widget above them (withReference: true), as the old app has it.
        onStartConversation={(body, blockId) => act('Message', () => startConversation({ folder: issue.folder, about: issue.addr, withReference: true, body, blockId }), say, refresh)}
        onReply={(threadId, body) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return false
          return act('Reply', () => reply(conversation, issue.folder, body), say, refresh)
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
        onReplyInActivity={(threadId, body) => {
          const conversation = state.conversations.find((c) => c.id === threadId)
          if (!conversation?.root.folder) return false
          return act('Reply', () => reply(conversation, conversation.root.folder, body), say, refresh)
        }}
        history={history}
        rail={{
          status: issue.status,
          statuses: ISSUE_STATUSES.map(({ value, label }) => ({ value, label })),
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
          openedBy: directory.personOf(issue.author),
          openedAt: issue.createdAt,
          onCopyReference: () => void copyText(referenceFor(issue.addr), 'Reference copied', 'Copy this reference:', say),
          onDelete: () => setConfirmingDelete(true),
        }}
      />
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
            await refresh()
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
