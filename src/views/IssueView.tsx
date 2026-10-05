import type { ReactNode } from 'react'
import { IconBox } from '@tabler/icons-react'
import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { linkTo, type IssueTab } from '@/router'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import type { Picks } from '@/components/conversations/MessageBox'
import { Divider } from '@/components/ui/Divider'
import { Tabs } from '@/components/ui/Tabs'
import { History, type HistoryEntry } from '@/components/History'
import type { ActivityItem } from '@/components/Activity'
import type { ThreadData } from '@/components/ConversationThread'
import { IssueRail, type IssueRailProps } from '@/components/IssueRail'
import { Related, hasRelated } from '@/components/Related'
import { LiveHeader } from '@/components/editing/LiveHeader'
import { MentionList, ThreadList } from '@/components/conversations/ThreadList'
import { useBlockComment } from '@/components/conversations/useBlockComment'
import type { RelatedState } from '@/api/useRelated'
import { AppSection, Centred } from '@/components/layout/ReadingColumn'

/**
 * One issue, in the project page's format (Katerina, 29 September): two tabs,
 * **Overview** (the title, the description, "Related") and **Activity** (the
 * three lists), in the same centred column, with the rail on every tab.
 *
 * **The three lists are three different questions, and CON-9 renamed one.**
 *
 * | | what it holds |
 * | --- | --- |
 * | **Conversations** | threads that declared themselves to be about this issue |
 * | **Mentioned in** | threads elsewhere that mention it — never its sub-files' (PEE-26) |
 * | **History** | this issue's own change events, newest first |
 *
 * "Mentioned in" was the "Activity" section until the tab took that word; it is
 * SPEC §6.4's own phrase for the list.
 */
export interface IssueViewProps {
  crumbs: { issuesHref: string; project?: { title: string; href: string }; ref?: string }
  /** The open tab — in the URL. */
  tab: IssueTab
  onTab: (tab: IssueTab) => void
  title: string
  description: string
  /** Which content model the description is in — from the fold, never sniffed. */
  descriptionFormat: ContentFormat
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  onRename: (v: string) => Promise<boolean> | boolean
  /** The block menu's Copy link (RIC-18): copies and says so. */
  onCopyBlockLink?: (link: string) => void
  /** The body, and the format tag the editor built it in — RIC-14. */
  onDescribe: (v: string, contentFormat?: string) => Promise<boolean> | boolean
  /** Foreign files placed under this issue — RFC 0.5 §10.7. Drawn only when there is something to say. */
  related?: RelatedState
  /** Threads that are *about* this issue — a tag at the root, never a passing mention (§6.4). */
  threads: ThreadData[]
  /** Threads elsewhere that mention it, time-ordered, each carrying how it is related. */
  activity: ActivityItem[]
  /** How many the horizon left out — `ACTIVITY_HORIZON`. Said on screen, never implied. */
  activityTruncated?: number
  /** Thread id → first unread message id. Drives the "new since" line (CRO-13). */
  unread?: Record<string, string>
  /** A thread's replies drawn or hidden — the page marks the drawn ones read (CON-34). */
  onThreadShown?: (threadId: string, open: boolean) => void
  /**
   * `files` are attachments already on the relay — SHI-2. `picks` are the
   * composer's urgent mentions (CON-25). `blockId` is set when a comment is
   * about one block of the description — SPEC §13.6; supplied by whoever built
   * that affordance.
   */
  onStartConversation: (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<boolean | void> | boolean | void
  /** Reply into a thread that belongs to another file — its own Folder, never this issue's (CON-9). */
  onReplyInActivity: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<boolean | void> | boolean | void
  history: HistoryEntry[]
  rail: Omit<IssueRailProps, 'className'>
  /** This object's address, so an unsent message is kept against it — CON-10. */
  about?: string
  /** Add or take back a reaction on a message — CON-2. */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<boolean | void> | boolean | void
  /** Publish a deletion for one message — CON-3. Omitted where nobody may write. */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /** Publish an edit of one message — CON-4. Omitted where nobody may write. */
  onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
  /** Why this issue's own title, description and rail are shut while it can still be discussed, archived or deleted — an archived issue (SHI-36). */
  lockedReason?: string
  /** The upload behind attach. Injected so a story needs no relay; the app's by default. */
  upload?: (file: File) => Promise<Imeta>
  /** The `ArchivedNotice` of an archived issue, or one archived with its project: the first thing on every tab (FOL-46). */
  archivedNotice?: ReactNode
}

const TABS: { id: IssueTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
]

/** One issue's page, in tabs: Overview and Activity, with the rail on every tab. */
export function IssueView({ crumbs, tab, onTab, title, description, descriptionFormat, nameOf, onRename, onCopyBlockLink, onDescribe, related, threads, unread, onThreadShown, onStartConversation, onReply, activity, activityTruncated, onReplyInActivity, history, rail, about, onReact, onDeleteMessage, onEditMessage, readOnlyReason, lockedReason, upload, archivedNotice }: IssueViewProps) {
  // `linkTo` on each crumb (S15, 0.10.0): the breadcrumbs were the last links in Ship that reloaded the app (SHI-20).
  const items: Crumb[] = [{ label: 'Issues', ...linkTo(crumbs.issuesHref) }]
  // The box before the project's name says it is a project, as the sidebar's entry does (Katerina, 2026-09-09).
  if (crumbs.project) items.push({ label: crumbs.project.title, icon: <IconBox size={16} stroke={1.5} />, ...linkTo(crumbs.project.href) })
  if (crumbs.ref) items.push({ label: crumbs.ref, mono: true })
  const comment = useBlockComment(description, descriptionFormat, onTab, onStartConversation)

  return (
    // `data-surface` and `data-tab` are the smoke test's waypoints — see IssuesView. A page that scrolls inside
    // itself: `flex-1 min-h-0 [contain:size]` takes exactly the frame's height, so its columns scroll and the frame does not.
    <div data-surface="issue" data-tab={tab} className="grid min-h-0 flex-1 [contain:size] grid-cols-[minmax(0,1fr)_1px_auto] grid-rows-[auto_auto_minmax(0,1fr)] gap-y-4">
      <div className="col-start-1 row-start-1 pl-6 pt-5">
        <Breadcrumb items={items} />
      </div>
      {/* The tab row is its own grid row, level with the rail's top, so the rail starts where it always has. */}
      <div className="col-start-1 row-start-2 flex min-h-8 items-center px-6">
        <Tabs tabs={TABS} active={tab} onChange={onTab} />
      </div>

      <ScrollArea className="col-start-1 row-start-3 min-h-0 min-w-0" contentClassName="flex flex-col gap-6 px-6 pb-5">
        {tab === 'overview' && (
          <Centred>
            {archivedNotice}
            <LiveHeader title={title} titlePlaceholder="Untitled issue" onRename={onRename} description={description} format={descriptionFormat} onDescribe={onDescribe} nameOf={nameOf} readOnly={!!(readOnlyReason ?? lockedReason)} upload={upload} onCommentOnBlock={comment.start} onCopyBlockLink={onCopyBlockLink} />
            {/* Nesting is by intent (RFC 0.5 §10.7): what somebody placed under this issue, from whichever app owns it. */}
            {hasRelated(related) && (
              <>
                <Divider className="mx-0" />
                <AppSection title="Related">
                  <Related related={related} />
                </AppSection>
              </>
            )}
          </Centred>
        )}

        {tab === 'activity' && (
          <Centred>
            {archivedNotice}
            <AppSection title="Conversations">
              <ThreadList threads={threads} unread={unread} onThreadShown={onThreadShown} onStart={comment.post} anchor={comment.anchor} onDropAnchor={comment.drop} onReply={onReply} disabledReason={readOnlyReason} nameOf={nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} />
            </AppSection>
            <AppSection title="Mentioned in">
              <MentionList items={activity} truncated={activityTruncated} onReply={onReplyInActivity} disabledReason={readOnlyReason} nameOf={nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} upload={upload} />
            </AppSection>
            <AppSection title="History">
              <History entries={history} />
            </AppSection>
          </Centred>
        )}
      </ScrollArea>

      <Divider orientation="vertical" className="col-start-2 row-span-3 row-start-1" />
      {/* The rail on every tab, starting level with the tab row and never moving (Katerina, 29 September). */}
      <ScrollArea className="col-start-3 row-span-2 row-start-2 min-h-0" contentClassName="px-6 pb-5">
        <IssueRail {...rail} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />
      </ScrollArea>
    </div>
  )
}
