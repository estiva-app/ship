import { useMarkRead } from '@/lib/useMarkRead'
import { useMemo, useState } from 'react'
import { ISSUE_STATUSES, conversationsAbout, deleteIssue, referenceFor, reply, setIssueField, startConversation, type DirectoryView, type FolderState, threadContext, useMergedReadState, firstUnreadByThread, projectContext, me } from '@/api'
import type { ActivityEntry } from '@/components/ActivityFeed'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { IssueView } from '@/views/IssueView'
import { go, href } from '../router'
import { act, type Say } from './act'
import { copyText, railPeople, threadFor } from './ProjectPage'

/**
 * This issue's slice of the change stream, in words, newest first — the old
 * app's `activity`: "<who> set <field> to <value>", a pubkey in the value
 * shown as the person's name, an empty value as "(none)". Read off the
 * fold's list in the fold's order, then reversed for reading.
 */
export function activityFor(issueAddr: string, state: FolderState, directory: DirectoryView): ActivityEntry[] {
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
export function IssuePage({ state, directory, addr, say, refresh }: { state: FolderState; directory: DirectoryView; addr: string; say: Say; refresh: () => Promise<void> }) {
  const issue = state.issues.find((candidate) => candidate.addr === addr)
  const project = issue?.projectAddr ? state.projects.find((candidate) => candidate.addr === issue.projectAddr) : undefined

  const conversations = useMemo(() => (issue ? conversationsAbout(state.conversations, issue.addr) : []), [issue, state])
  /* An issue is an object *inside* a Folder, not a container of its own, so it
     advances one `thread:` context per discussion and never the project's
     container — SPEC §11.2. Doing it the other way would make reading one issue
     mark the whole project read. */
  useMarkRead(useMemo(() => conversations.map((c) => threadContext(c.id)), [conversations]))
  const threads = useMemo(
    () => conversations.map((c) => threadFor(c, directory, issue ? { value: issue.description, format: issue.descriptionFormat } : undefined)),
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
  const activity = useMemo(() => (issue ? activityFor(issue.addr, state, directory) : []), [issue, state, directory])
  const people = useMemo(() => railPeople(state, directory), [state, directory])
  const projects = useMemo(
    () => [{ value: '', label: 'No project' }, ...state.projects.map((p) => ({ value: p.addr, label: p.title }))],
    [state],
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!issue) {
    return (
      <EmptyState
        className="py-12"
        message="That issue is not in this workspace. It may live in a Folder you cannot read, or the link may point at a different workspace."
      />
    )
  }

  const set = (field: 'title' | 'description' | 'status' | 'assignee' | 'project', value: string, note: string) =>
    act(note, () => setIssueField(issue, field, value, note), say, refresh)

  return (
    <>
      <IssueView
        crumbs={{
          issuesHref: href({ name: 'issues' }),
          project: project ? { title: project.title, href: href({ name: 'project', addr: project.addr, view: 'table' }) } : undefined,
          ref: issue.ref,
        }}
        title={issue.title}
        description={issue.description}
        descriptionFormat={issue.descriptionFormat}
        onRename={(value) => set('title', value, 'Rename')}
        onDescribe={(value) => set('description', value, 'Description')}
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
        activity={activity}
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
          onCopyReference: () => void copyText(referenceFor(issue.addr), 'Reference copied — paste it into a Peek message.', 'Copy this reference:', say),
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
            say('Deletion requested.')
            // Nothing left to render here.
            go(project ? { name: 'project', addr: project.addr, view: 'table' } : { name: 'issues' })
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
