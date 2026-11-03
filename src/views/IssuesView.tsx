import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import type { StatusEntry } from '@/lib/issues'
import { IssueList } from '@/components/IssueList'
import type { IssueRowData } from '@/components/IssueRow'

/**
 * Every issue in the workspace, as production: the heading with "Add issue",
 * the All and Assigned to me tabs with their counts, and the grouped list.
 * All keeps done issues, grouped by status; Assigned to me lists your open
 * ones (Miky, 2 November; SHIPS-5 dropped the Open tab). Parentless issues
 * are simply in it (ruling B10) — there is no separate place for them.
 */
export type IssuesScope = 'all' | 'mine'

export interface IssuesViewProps {
  /** "Issues", or a Folder's ("Estiva HQ · Issues", SHIPS-5). */
  title?: string
  issues: IssueRowData[]
  statuses: StatusEntry[]
  /** Which issues are the viewer's — by address. */
  mine: Set<string>
  scope: IssuesScope
  onScope: (scope: IssuesScope) => void
  hrefFor: (issue: IssueRowData) => string
  onAddIssue?: () => void
  /** Why "Add issue" cannot be used right now; disables the button. */
  addDisabledReason?: string
}

const isOpen = (issue: IssueRowData) => issue.status !== 'done' && issue.status !== 'cancelled'

/** What an empty tab says: each tab's own emptiness, not the workspace's (UIG-14). */
const EMPTY: Record<IssuesScope, string> = {
  all: 'No issues yet.',
  mine: 'No open issue is assigned to you.',
}

export function IssuesView({ title = 'Issues', issues, statuses, mine, scope, onScope, hrefFor, onAddIssue, addDisabledReason }: IssuesViewProps) {
  const assigned = issues.filter((issue) => mine.has(issue.addr) && isOpen(issue))
  const shown = scope === 'mine' ? assigned : issues
  return (
    // `data-surface` is the smoke test's waypoint (REW-7). One attribute per
    // surface, on the element that *is* the surface, so a browser test can wait
    // for "the issue list is on screen" without coupling to a Tailwind class —
    // which is a styling decision and free to change.
    <div data-surface="issues" className="flex flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-h3 text-text-primary">{title}</h1>
        <Button variant="primary" onClick={onAddIssue} disabledReason={addDisabledReason}>
          Add issue
        </Button>
      </div>
      <Tabs<IssuesScope>
        tabs={[
          { id: 'all', label: 'All', count: issues.length },
          { id: 'mine', label: 'Assigned to me', count: assigned.length },
        ]}
        active={scope}
        onChange={onScope}
      />
      <IssueList issues={shown} statuses={statuses} hrefFor={hrefFor} emptyMessage={EMPTY[scope]} />
    </div>
  )
}
