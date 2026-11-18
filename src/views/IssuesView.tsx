import { PageHeader, Panel } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
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

/** Open work, by what its status means (EAC-3): a status Ship does not list is open unless its change says done or dropped. */
const isOpen = (issue: IssueRowData) => {
  const stage = issue.stage ?? issueStage(issue.status)
  return stage !== 'done' && stage !== 'dropped'
}

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
        ]}
        active={scope}
        onChange={onScope}
      />
      <IssueList issues={shown} statuses={statuses} hrefFor={hrefFor} emptyMessage={EMPTY[scope]} />
      </Panel>
      </div>
    </div>
  )
}
