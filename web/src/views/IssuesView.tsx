import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { WithTooltip } from '@/components/ui/Tooltip'
import type { StatusEntry } from '@/lib/issues'
import { IssueList } from '@/components/IssueList'
import type { IssueRowData } from '@/components/IssueRow'

/**
 * Every issue in the workspace, as production: the heading with "Add issue",
 * the All / Open / Assigned to me filters with their counts, and the grouped
 * list. Parentless issues are simply in it (ruling B10) — there is no
 * separate place for them.
 */
export type IssuesScope = 'all' | 'open' | 'mine'

export interface IssuesViewProps {
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

export function IssuesView({ issues, statuses, mine, scope, onScope, hrefFor, onAddIssue, addDisabledReason }: IssuesViewProps) {
  const open = issues.filter(isOpen)
  const assigned = issues.filter((issue) => mine.has(issue.addr))
  const shown = scope === 'open' ? open : scope === 'mine' ? assigned : issues
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-h3 text-text-primary">Issues</h1>
        {addDisabledReason ? (
          <WithTooltip label={addDisabledReason}>
            <Button variant="primary" disabled>
              Add issue
            </Button>
          </WithTooltip>
        ) : (
          <Button variant="primary" onClick={onAddIssue}>
            Add issue
          </Button>
        )}
      </div>
      <Tabs<IssuesScope>
        tabs={[
          { id: 'all', label: 'All', count: issues.length },
          { id: 'open', label: 'Open', count: open.length },
          { id: 'mine', label: 'Assigned to me', count: assigned.length },
        ]}
        active={scope}
        onChange={onScope}
      />
      <IssueList issues={shown} statuses={statuses} hrefFor={hrefFor} />
    </div>
  )
}
