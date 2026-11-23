import { useState } from 'react'
import { PageHeader, Panel } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { DeletedProjectRow, type DeletedProjectRowProps } from '@/components/DeletedProjectRow'
import type { StatusEntry } from '@/lib/issues'
import { issueStage } from '@/api'
import { IssueList } from '@/components/IssueList'
import type { IssueRowData } from '@/components/IssueRow'

/**
 * Every issue in the workspace, as production: the heading with "Add issue",
 * the All and Assigned to me tabs with their counts, and the grouped list.
 * All keeps done issues, grouped by status; Assigned to me lists your open
 * ones (Miky, 2 November; SHIPS-5 dropped the Open tab). Parentless issues
 * are simply in it (ruling B10) — there is no separate place for them.
 * Archived lists the archived issues and, under its Deleted filter, the
 * deleted ones with Restore, as the Projects page's Archived tab (Miky, 19 Nov).
 */
export type IssuesScope = 'all' | 'mine' | 'archived'

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
  /** Archived issues, their own or with their project or team, for the Archived tab. */
  archived?: IssueRowData[]
  /** Deleted issues, for the Archived tab's Deleted filter (SPEC §6.5); read when the tab opens. */
  deleted?: DeletedProjectRowProps[]
  /** The deleted ones are still on their way. */
  deletedLoading?: boolean
}

/** Open work, by what its status means (EAC-3): a status Ship does not list is open unless its change says done or dropped. */
const isOpen = (issue: IssueRowData) => {
  const stage = issue.stage ?? issueStage(issue.status)
  return stage !== 'done' && stage !== 'dropped'
}

/** What an empty tab says: each tab's own emptiness, not the workspace's (UIG-14). */
const EMPTY: Record<IssuesScope, string> = {
  all: 'No issues yet.',
  mine: 'No open issue is assigned to you.',
  archived: 'No archived issues.',
}

export function IssuesView({ title = 'Issues', issues, statuses, mine, scope, onScope, hrefFor, onAddIssue, addDisabledReason, archived = [], deleted = [], deletedLoading = false }: IssuesViewProps) {
  const [filter, setFilter] = useState<'archived' | 'deleted'>('archived')
  const assigned = issues.filter((issue) => mine.has(issue.addr) && isOpen(issue))
  const shown = scope === 'mine' ? assigned : scope === 'archived' ? archived : issues
  // With nothing archived, the Archived tab opens on the deleted ones, as the Projects page's does.
  const showDeleted = scope === 'archived' && deleted.length > 0 && (archived.length === 0 || filter === 'deleted')
  return (
    // `data-surface` is the smoke test's waypoint (REW-7). One attribute per
    // surface, on the element that *is* the surface, so a browser test can wait
    // for "the issue list is on screen" without coupling to a Tailwind class —
    // which is a styling decision and free to change.
    // The list's name in the page's bar, as Peek's and Leaf's Explore (Katerina, 18 November: "the title of the page sits
    // in a header … We should unify that"), "Add issue" in the bar's button place. A page that scrolls inside itself, as
    // an issue's: `flex-1 min-h-0 [contain:size]` takes exactly the frame's height, so the panel's body scrolls and its
    // bar stays.
    <div data-surface="issues" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col">
      <Panel
        title={title}
        header={
          <PageHeader
            title={title}
            button={
              <Button variant="primary" size="small" onClick={onAddIssue} disabledReason={addDisabledReason}>
                Add issue
              </Button>
            }
          />
        }
        bodyClassName="flex flex-col gap-4 px-6 py-5"
      >
      {/* The bar's title is words, not a heading: the page's heading, for assistive technology. */}
      <h1 className="sr-only">{title}</h1>
      <Tabs<IssuesScope>
        tabs={[
          { id: 'all', label: 'All', count: issues.length },
          { id: 'mine', label: 'Assigned to me', count: assigned.length },
          // The archived ones alone: the deleted are read only when the tab opens, so counting them here would make the number jump.
          { id: 'archived', label: 'Archived', count: archived.length },
        ]}
        active={scope}
        onChange={onScope}
      />
      {/* Archived, and Deleted: every deleted issue, with who deleted it and Restore (SPEC §6.5; Miky, 19 Nov). */}
      {scope === 'archived' && deleted.length > 0 && (
        <Tabs
          size="small"
          aria-label="Show"
          tabs={[
            { id: 'archived', label: 'Archived', count: archived.length },
            { id: 'deleted', label: 'Deleted', count: deleted.length },
          ]}
          active={showDeleted ? 'deleted' : 'archived'}
          onChange={(id) => setFilter(id === 'deleted' ? 'deleted' : 'archived')}
        />
      )}
      {showDeleted ? (
        <div className="flex flex-col divide-y divide-border-subtle">
          {deleted.map((issue) => (
            <DeletedProjectRow key={issue.href} {...issue} />
          ))}
        </div>
      ) : scope === 'archived' && deletedLoading && archived.length === 0 ? (
        <SkeletonList rows={3} />
      ) : (
        <IssueList issues={shown} statuses={statuses} hrefFor={hrefFor} emptyMessage={EMPTY[scope]} />
      )}
      </Panel>
      </div>
    </div>
  )
}
