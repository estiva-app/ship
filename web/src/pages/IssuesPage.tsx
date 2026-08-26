import { useMemo, useState } from 'react'
import { ISSUE_STATUSES, conversationsAbout, me, type DirectoryView, type FolderState } from '@/api'
import type { IssueRowData } from '@/components/IssueRow'
import { IssuesView, type IssuesScope } from '@/views/IssuesView'
import { href } from '../router'
import { WRITES_LATER } from './ProjectsPage'

/** One issue as the list draws it — status and assignee read off the fold, never recomputed. */
export function rowFor(issue: FolderState['issues'][number], state: FolderState, directory: DirectoryView): IssueRowData {
  return {
    addr: issue.addr,
    ref: issue.ref,
    title: issue.title,
    status: issue.status,
    assignee: issue.assignee ? directory.personOf(issue.assignee) : undefined,
    openedBy: directory.personOf(issue.author),
    at: issue.createdAt,
    conversations: conversationsAbout(state.conversations, issue.addr).length,
  }
}

export const hrefForIssue = (issue: { addr: string }) => href({ name: 'issue', addr: issue.addr })

/**
 * Every issue the reader can see, as the old app's issuesView: the All /
 * Open / Assigned to me filters (a screen choice, not a route — as today)
 * over the grouped list. "Assigned to me" is by the viewer's key. The
 * list is what `loadAll` could read, and nothing here calls it complete.
 */
export function IssuesPage({ state, directory }: { state: FolderState; directory: DirectoryView }) {
  const [scope, setScope] = useState<IssuesScope>('all')
  const rows = useMemo(() => state.issues.map((issue) => rowFor(issue, state, directory)), [state, directory])
  const mine = useMemo(() => new Set(state.issues.filter((issue) => issue.assignee === me).map((issue) => issue.addr)), [state])

  return (
    <IssuesView
      issues={rows}
      statuses={ISSUE_STATUSES}
      mine={mine}
      scope={scope}
      onScope={setScope}
      hrefFor={hrefForIssue}
      addDisabledReason={WRITES_LATER}
    />
  )
}
