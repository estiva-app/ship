import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import { Divider } from '@/components/ui/Divider'
import { EditableText } from '@/components/ui/EditableText'
import { stripNaddrs } from '@estiva-app/protocol'
import { ForeignReferences } from '@/components/ForeignReferences'
import { ActivityFeed, type ActivityEntry } from '@/components/ActivityFeed'
import { Conversations, type ThreadData } from '@/components/ConversationThread'
import { IssueRail, type IssueRailProps } from '@/components/IssueRail'

/**
 * One issue, as production: the trail (Issues / project / ref — no project
 * crumb when it has none), the editable title and description,
 * "Conversations", "Activity" — and the rail on the right. History and
 * conversation are different things and stay apart (REW-4).
 */
export interface IssueViewProps {
  crumbs: { issuesHref: string; project?: { title: string; href: string }; ref?: string }
  title: string
  description: string
  onRename: (v: string) => Promise<boolean> | boolean
  onDescribe: (v: string) => Promise<boolean> | boolean
  threads: ThreadData[]
  onStartConversation: (text: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  activity: ActivityEntry[]
  rail: Omit<IssueRailProps, 'className'>
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
}

export function IssueView({ crumbs, title, description, onRename, onDescribe, threads, onStartConversation, onReply, activity, rail, readOnlyReason }: IssueViewProps) {
  const items: Crumb[] = [{ label: 'Issues', href: crumbs.issuesHref }]
  if (crumbs.project) items.push({ label: crumbs.project.title, href: crumbs.project.href })
  if (crumbs.ref) items.push({ label: crumbs.ref, mono: true })

  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView.
    <div data-surface="issue" className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_1px_auto] grid-rows-[auto_minmax(0,1fr)] gap-y-4">
      <div className="col-start-1 row-start-1 pl-6 pt-5">
        <Breadcrumb items={items} />
      </div>
      {/* Only the content column scrolls — with Peek's thin scrollbar right
          beside the hairline, which runs from the top bar to the bottom. The
          content keeps 24px inside the column (pl/pr-6), the rail 24px either
          side, and the rail starts level with the title and never moves. */}
      <div className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto px-6 pb-5">
        <div className="flex flex-col gap-2">
          <EditableText label="Title" value={title} placeholder="Untitled issue" onCommit={onRename} readOnly={!!readOnlyReason} className="-mx-2 text-h2" />
          <EditableText label="Description" value={description} display={stripNaddrs(description).trim()} placeholder="Add a description…" onCommit={onDescribe} multiline readOnly={!!readOnlyReason} className="-mx-2 text-body-2" />
          {/* Any object referenced in the description, live — PRO-7. */}
          <ForeignReferences text={description} className="flex flex-col gap-2" />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Conversations</h2>
          <Conversations threads={threads} onStart={onStartConversation} onReply={onReply} disabledReason={readOnlyReason} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Activity</h2>
          <ActivityFeed entries={activity} />
        </section>
      </div>
      <Divider orientation="vertical" className="col-start-2 row-span-2 row-start-1" />
      <div className="col-start-3 row-start-2 min-h-0 overflow-y-auto px-6 pb-5">
        <IssueRail {...rail} readOnlyReason={readOnlyReason} />
      </div>
    </div>
  )
}
