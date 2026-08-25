import { IconLayoutKanban, IconTable } from '@tabler/icons-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
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
  header: { title: string; description: string; archived: boolean; onRename: (v: string) => Promise<boolean> | boolean; onDescribe: (v: string) => Promise<boolean> | boolean }
  view: 'table' | 'board'
  onView: (view: 'table' | 'board') => void
  issues: IssuesTableRow[]
  issueStatuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  threads: ThreadData[]
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
}

export function ProjectView({ crumbs, header, view, onView, issues, issueStatuses, hrefFor, threads, onStartConversation, onReply, rail }: ProjectViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-6 pt-5">
      <Breadcrumb items={[{ label: 'Projects', href: crumbs.projectsHref }, { label: crumbs.title }]} />
      <div className="flex min-h-0 flex-1 gap-8">
        {/* Only this column scrolls — with Peek's thin scrollbar — and the rail
            beside it starts level with the title and never moves. */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-5">
          <ProjectHeader {...header} />
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
            <Conversations threads={threads} onStart={onStartConversation} onReply={onReply} />
          </section>
        </div>
        <div className="shrink-0 overflow-y-auto pb-5">
          <ProjectRail {...rail} archived={header.archived} />
        </div>
      </div>
    </div>
  )
}
