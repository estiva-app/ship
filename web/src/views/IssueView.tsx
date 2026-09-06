import { useState } from 'react'
import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import type { ContentFormat } from '@estiva-app/protocol'
import { Divider } from '@/components/ui/Divider'
import { EditableText } from '@/components/ui/EditableText'
import { Description } from '@/components/Description'
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
  /** Which content model the description is in — from the fold, never sniffed. */
  descriptionFormat: ContentFormat
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  onRename: (v: string) => Promise<boolean> | boolean
  /** The body, and the format tag the editor built it in — RIC-14. */
  onDescribe: (v: string, contentFormat?: string) => Promise<boolean> | boolean
  threads: ThreadData[]
  /** Thread id → first unread message id. Drives the feed divider (CRO-13). */
  unread?: Record<string, string>
  /** `blockId` is set when the reader clicked a specific block — SPEC §13.6. */
  onStartConversation: (text: string, blockId?: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  activity: ActivityEntry[]
  rail: Omit<IssueRailProps, 'className'>
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
}

export function IssueView({ crumbs, title, description, descriptionFormat,
  nameOf, onRename, onDescribe, threads, unread, onStartConversation, onReply, activity, rail, readOnlyReason }: IssueViewProps) {
  /* Which block the next comment is about — SPEC §13.6. Held here rather than
     in the composer because the choice is made by clicking the description,
     which is a different part of the page. */
  const [anchorTo, setAnchorTo] = useState<string | undefined>(undefined)

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
          <Description
            value={description}
            format={descriptionFormat}
            onCommit={onDescribe}
            readOnly={!!readOnlyReason}
            onCommentOn={readOnlyReason ? undefined : setAnchorTo}
            nameOf={nameOf}
          />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Conversations</h2>
          <Conversations
            threads={threads}
            unread={unread}
            onStart={(text) => onStartConversation(text, anchorTo)}
            onReply={onReply}
            disabledReason={readOnlyReason}
            anchoredTo={anchorTo}
            onClearAnchor={() => setAnchorTo(undefined)}
            nameOf={nameOf}
          />
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
