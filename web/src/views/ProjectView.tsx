import { IconLayoutKanban, IconTable } from '@tabler/icons-react'
import type { ContentFormat } from '@estiva-app/protocol'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { WithTooltip } from '@/components/ui/Tooltip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import type { StatusEntry } from '@/lib/issues'
import { Board } from '@/components/Board'
import { Conversations, type ThreadData } from '@/components/ConversationThread'
import type { IssueRowData } from '@/components/IssueRow'
import { IssuesTable, type IssuesTableRow } from '@/components/IssuesTable'
import { ProjectHeader } from '@/components/ProjectHeader'
import { ProjectRail, type RailPerson } from '@/components/ProjectRail'

/**
 * One project, as production lays it out (ruling C11): the trail, the
 * editable title and description, "Issues" with the Table / Board toggle,
 * "Conversations" — and the rail on the right. The toggle lives in the URL
 * (`?view=board`), so the caller owns it.
 */
export interface ProjectViewProps {
  crumbs: { projectsHref: string; title: string }
  header: { title: string; description: string; descriptionFormat: ContentFormat; archived: boolean; onRename: (v: string) => Promise<boolean> | boolean; onDescribe: (v: string) => Promise<boolean> | boolean }
  /** Production's "Add issue" beside the title. */
  onAddIssue?: () => void
  view: 'table' | 'board'
  onView: (view: 'table' | 'board') => void
  issues: IssuesTableRow[]
  issueStatuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  threads: ThreadData[]
  /** Thread id → first unread message id. Drives the feed divider (CRO-13). */
  unread?: Record<string, string>
  onStartConversation: (text: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  rail: {
    status: string
    statuses: StatusEntry[]
    onStatusChange: (v: string) => void
    lead: string
    people: RailPerson[]
    onLeadChange: (v: string) => void
    done: number
    total: number
    folder: string
    onCopyFolderLink: () => void
    onPairFolder: () => void
    onArchive: () => void
    onDelete: () => void
  }
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
}

export function ProjectView({ crumbs, header, onAddIssue, view, onView, issues, issueStatuses, hrefFor, threads, unread, onStartConversation, onReply, rail, readOnlyReason }: ProjectViewProps) {
  const addIssue = readOnlyReason ? (
    <WithTooltip label={readOnlyReason}>
      <Button variant="primary" disabled>
        Add issue
      </Button>
    </WithTooltip>
  ) : (
    <Button variant="primary" onClick={onAddIssue}>
      Add issue
    </Button>
  )
  return (
    // `data-surface` and `data-view` are the smoke test's waypoints — see
    // IssuesView. `data-view` matters more than it looks: the Table/Board toggle
    // swaps the list *in place* on the same route, so without it a test cannot
    // tell "the board rendered" from "the toggle did nothing".
    <div data-surface="project" data-view={view} className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_1px_auto] grid-rows-[auto_minmax(0,1fr)] gap-y-4">
      <div className="col-start-1 row-start-1 pl-6 pt-5">
        <Breadcrumb items={[{ label: 'Projects', href: crumbs.projectsHref }, { label: crumbs.title }]} />
      </div>
      {/* Only the content column scrolls — with Peek's thin scrollbar right
          beside the hairline, which runs from the top bar to the bottom. The
          content keeps 24px inside the column (pl/pr-6), the rail 24px either
          side, and the rail starts level with the title and never moves. */}
      <div className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto px-6 pb-5">
        <ProjectHeader {...header} readOnly={!!readOnlyReason} action={addIssue} />
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-h4 text-text-primary">Issues</h2>
            <Tabs
              tabs={[
                { id: 'table', label: 'Table', icon: <IconTable size={16} stroke={1.5} /> },
                { id: 'board', label: 'Board', icon: <IconLayoutKanban size={16} stroke={1.5} /> },
              ]}
              active={view}
              onChange={onView}
            />
          </div>
          {!issues.length ? (
            <EmptyState className="py-10" message="No issues yet." />
          ) : view === 'board' ? (
            <Board issues={issues} statuses={issueStatuses} hrefFor={hrefFor} />
          ) : (
            <IssuesTable issues={issues} statuses={issueStatuses} hrefFor={hrefFor} />
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Conversations</h2>
          <Conversations threads={threads} unread={unread} onStart={onStartConversation} onReply={onReply} disabledReason={readOnlyReason} />
        </section>
      </div>
      <Divider orientation="vertical" className="col-start-2 row-span-2 row-start-1" />
      <div className="col-start-3 row-start-2 min-h-0 overflow-y-auto px-6 pb-5">
        <ProjectRail {...rail} archived={header.archived} readOnlyReason={readOnlyReason} />
      </div>
    </div>
  )
}
