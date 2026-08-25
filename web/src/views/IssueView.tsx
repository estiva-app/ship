import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import { EditableText } from '@/components/ui/EditableText'
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
}

export function IssueView({ crumbs, title, description, onRename, onDescribe, threads, onStartConversation, onReply, activity, rail }: IssueViewProps) {
  const items: Crumb[] = [{ label: 'Issues', href: crumbs.issuesHref }]
  if (crumbs.project) items.push({ label: crumbs.project.title, href: crumbs.project.href })
  if (crumbs.ref) items.push({ label: crumbs.ref, mono: true })

  return (
    <div className="flex h-full min-h-0">
      {/* Only this column scrolls; the rail beside it stays where it is. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <Breadcrumb items={items} />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <EditableText label="Title" value={title} placeholder="Untitled issue" onCommit={onRename} className="-mx-2 text-h2" />
            <EditableText label="Description" value={description} placeholder="Add a description…" onCommit={onDescribe} multiline className="-mx-2 text-body-2" />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-h4 text-text-primary">Conversations</h2>
            <Conversations threads={threads} onStart={onStartConversation} onReply={onReply} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-h4 text-text-primary">Activity</h2>
            <ActivityFeed entries={activity} />
          </section>
        </div>
      </div>
      <div className="shrink-0 overflow-y-auto py-5 pr-6">
        <IssueRail {...rail} />
      </div>
    </div>
  )
}
