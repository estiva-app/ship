import { useMemo, useState } from 'react'
import { ISSUE_STATUSES, conversationsAbout, createIssue, me, type DirectoryView, type FolderState } from '@/api'
import type { IssueRowData } from '@/components/IssueRow'
import { NewIssueDialog } from '@/components/NewIssueDialog'
import { IssuesView, type IssuesScope } from '@/views/IssuesView'
import type { Archives } from '@/lib/archive'
import { href } from '../router'
import { type Say } from './act'

/** One issue as the list draws it — status and assignee read off the fold, never recomputed. */
export function rowFor(issue: FolderState['issues'][number], state: FolderState, directory: DirectoryView): IssueRowData {
  const parent = issue.projectAddr ? state.projects.find((p) => p.addr === issue.projectAddr) : undefined
  return {
    addr: issue.addr,
    id: issue.id,
    ref: issue.ref,
    title: issue.title,
    status: issue.status,
    // The chip names the parent and links to it; a parentless issue (B10),
    // or one whose project is not in this read, shows none.
    project: parent ? { title: parent.title, href: href({ name: 'project', d: parent.id, slug: parent.title, view: 'table' }) } : undefined,
    assignee: issue.assignee ? directory.personOf(issue.assignee) : undefined,
    openedBy: directory.personOf(issue.author),
    at: issue.createdAt,
    conversations: conversationsAbout(state.conversations, issue.addr).length,
  }
}

export const hrefForIssue = (issue: { id: string; title?: string }) =>
  href({ name: 'issue', d: issue.id, slug: issue.title })

/**
 * Every issue the reader can see, as the old app's issuesView: the All /
 * Open / Assigned to me filters (a screen choice, not a route — as today)
 * over the grouped list. "Assigned to me" is by the viewer's key. The
 * list is what `loadAll` could read, and nothing here calls it complete.
 * "Add issue" asks which project, since none is selected here.
 *
 * An archived issue is not listed, nor one archived with its project or its
 * team (FOL-46); a link still opens it. An archived project is not offered for
 * a new issue.
 */
export function IssuesPage({ state, directory, archives, say, refresh }: { state: FolderState; directory: DirectoryView; archives: Archives; say: Say; refresh: () => Promise<void> }) {
  const [scope, setScope] = useState<IssuesScope>('all')
  const [adding, setAdding] = useState(false)
  const live = useMemo(() => state.issues.filter((issue) => !archives.ofIssue(issue)), [state, archives])
  const rows = useMemo(() => live.map((issue) => rowFor(issue, state, directory)), [live, state, directory])
  const mine = useMemo(() => new Set(live.filter((issue) => issue.assignee === me).map((issue) => issue.addr)), [live])
  const projectOptions = useMemo(
    () => state.projects.filter((p) => !archives.ofProject(p.addr)).map((p) => ({ value: p.addr, label: p.title })),
    [state, archives],
  )

  return (
    <>
      <IssuesView issues={rows} statuses={ISSUE_STATUSES} mine={mine} scope={scope} onScope={setScope} hrefFor={hrefForIssue} onAddIssue={() => setAdding(true)} />
      {adding && (
        <NewIssueDialog
          projects={projectOptions}
          onClose={() => setAdding(false)}
          onCreate={async (draft) => {
            const project = state.projects.find((p) => p.addr === draft.projectAddr)
            if (!project) {
              say('Pick a project for this issue.', 'error')
              return false
            }
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
    </>
  )
}
