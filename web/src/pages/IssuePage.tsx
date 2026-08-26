import { useMemo } from 'react'
import { ISSUE_STATUSES, conversationsAbout, referenceFor, type DirectoryView, type FolderState } from '@/api'
import type { ActivityEntry } from '@/components/ActivityFeed'
import { EmptyState } from '@/components/ui/EmptyState'
import { IssueView } from '@/views/IssueView'
import { href } from '../router'
import { copyText, railPeople, threadFor, type Say } from './ProjectPage'
import { WRITES_LATER } from './ProjectsPage'

/** The write controls exist but cannot succeed yet (REW-5); they say so rather than fail. */
const inert = () => false

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
 * for Peek". History and conversation stay two sections (REW-4).
 */
export function IssuePage({ state, directory, addr, say }: { state: FolderState; directory: DirectoryView; addr: string; say: Say }) {
  const issue = state.issues.find((candidate) => candidate.addr === addr)
  const project = issue?.projectAddr ? state.projects.find((candidate) => candidate.addr === issue.projectAddr) : undefined

  const threads = useMemo(
    () => (issue ? conversationsAbout(state.conversations, issue.addr).map((c) => threadFor(c, directory)) : []),
    [issue, state, directory],
  )
  const activity = useMemo(() => (issue ? activityFor(issue.addr, state, directory) : []), [issue, state, directory])
  const people = useMemo(() => railPeople(state, directory), [state, directory])
  const projects = useMemo(
    () => [{ value: '', label: 'No project' }, ...state.projects.map((p) => ({ value: p.addr, label: p.title }))],
    [state],
  )

  if (!issue) {
    return (
      <EmptyState
        className="py-12"
        message="That issue is not in this workspace. It may live in a Folder you cannot read, or the link may point at a different workspace."
      />
    )
  }

  return (
    <IssueView
      crumbs={{
        issuesHref: href({ name: 'issues' }),
        project: project ? { title: project.title, href: href({ name: 'project', addr: project.addr, view: 'table' }) } : undefined,
        ref: issue.ref,
      }}
      title={issue.title}
      description={issue.description}
      onRename={inert}
      onDescribe={inert}
      threads={threads}
      onStartConversation={inert}
      onReply={inert}
      activity={activity}
      rail={{
        status: issue.status,
        statuses: ISSUE_STATUSES.map(({ value, label }) => ({ value, label })),
        onStatusChange: () => {},
        assignee: issue.assignee ?? '',
        people,
        onAssigneeChange: () => {},
        project: issue.projectAddr ?? '',
        projects,
        onProjectChange: () => {},
        openedBy: directory.personOf(issue.author),
        openedAt: issue.createdAt,
        onCopyReference: () => void copyText(referenceFor(issue.addr), 'Reference copied — paste it into a Peek message.', 'Copy this reference:', say),
      }}
      readOnlyReason={WRITES_LATER}
    />
  )
}
