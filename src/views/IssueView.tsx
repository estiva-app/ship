import type { ReactNode } from 'react'
import { IconBox } from '@tabler/icons-react'
import { PageHeader } from '@estiva-app/ui'
import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { linkTo } from '@/router'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import type { Answer, Picks } from '@/components/conversations/shared'
import type { HistoryEntry } from '@/components/History'
import type { ActivityItem } from '@/components/Activity'
import type { ThreadData, UnreadByThread } from '@/components/ConversationThread'
import { IssueFields, type IssueFieldsProps } from '@/components/PageFields'
import { PageActions, type PageActionsProps } from '@/components/PageActions'
import { OverviewPanel } from '@/components/OverviewPanel'
import { LiveHeader, type LiveHeaderProps } from '@/components/editing/LiveHeader'
import { ThreadList } from '@/components/conversations/ThreadList'
import { useBlockComment } from '@/components/conversations/useBlockComment'
import type { RelatedState } from '@/api/useRelated'
import { Centred } from '@/components/layout/ReadingColumn'

/**
 * One issue's page (ONE-6, step 4): its header, then the title, its fields, the description, in a centred column. No
 * details column (step 4b): the fields are a row under the summary, the actions the header's ⋯. No tabs (step 4d,
 * Katerina, 2 November): an issue has one page. Beside it, one at a time, its comments (step 4c) or its Overview
 * (step 4d), each shown or hidden from the header.
 *
 * **The three lists are three different questions, and CON-9 renamed one.**
 *
 * | | what it holds | where |
 * | --- | --- | --- |
 * | **Comments** | threads that declared themselves to be about this issue | the comments column |
 * | **Activity** | threads elsewhere that mention it — never its sub-files' (PEE-26) | the Overview |
 * | **History** | this issue's own change events, newest first | the Overview |
 *
 * Activity is Peek's word for the list ("Mentioned in", SPEC §6.4's phrase, is each row's chip).
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
  /** The one-line summary under the title (SPEC §6.12); absent when it has none. */
  summary?: string
  /** Save the summary: `true`, or the words for why it was refused. Empty clears it. */
  onSummarize?: (v: string) => Promise<true | string>
  /** The block menu's Copy link (RIC-18): copies and says so. */
  onCopyBlockLink?: (link: string) => void
  /** The body, and the format tag the editor built it in — RIC-14. */
  onDescribe: LiveHeaderProps['onDescribe']
  onMention?: LiveHeaderProps['onMention']
  /** Who saved the description last, by name, when it was not you (LTX-3). */
  descriptionBy?: string | null
  /** Foreign files placed under this issue — RFC 0.5 §10.7. Drawn only when there is something to say. */
  related?: RelatedState
  /** The topics that list it, with Add to topic (TOP-5): the Overview's "Topics", where the rail had them. */
  topics?: ReactNode
  /** Threads that are *about* this issue — a tag at the root, never a passing mention (§6.4). */
  threads: ThreadData[]
  /** Threads elsewhere that mention it, time-ordered, each carrying how it is related: the Overview's Activity. */
  activity: ActivityItem[]
  /** How many the horizon left out — `ACTIVITY_HORIZON`. Said on screen, never implied. */
  activityTruncated?: number
  /** The comments, and the Overview's Activity, are still on the way (APP-5): drawn as loading, never as none. */
  conversationsLoading?: boolean
  mentionsLoading?: boolean
  /** Thread id → its message ids new when the page opened. Drives the "new since" line (CRO-13), held for the visit (99557309). */
  unread?: UnreadByThread
  /** Thread id → its message ids still unread now. Drives "N new" (SHI-38). */
  stillUnread?: UnreadByThread
  /** A thread's replies drawn or hidden — the page marks the drawn ones read (CON-34). */
  onThreadShown?: (threadId: string, open: boolean) => void
  /**
   * `files` are attachments already on the relay — SHI-2. `picks` are the
   * composer's urgent mentions (CON-25). `blockId` is set when a comment is
   * about one block of the description — SPEC §13.6; supplied by whoever built
   * that affordance.
   */
  onStartConversation: (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<Answer>
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** Its own changes, in words: the Overview's History. */
  history: HistoryEntry[]
  /** Status, assignee and project, as a row between the summary and the description (ONE-6, step 4b). */
  fields: Omit<IssueFieldsProps, 'readOnlyReason' | 'lockedReason'>
  /** The header's ⋯: Copy link, Archive or Unarchive, Delete. */
  menu: Omit<PageActionsProps, 'what' | 'comments' | 'overview' | 'readOnlyReason' | 'lockedReason'>
  /** Its comments, in the column beside the page, and whether they are shown: the header's button shows or hides them, and the page reads them only while they are. */
  comments: { shown: boolean; onShownChange: (shown: boolean) => void }
  /** Its Overview, in the same column in the comments' place: the header's side-panel button (ONE-6, step 4d). */
  overview: { shown: boolean; onShownChange: (shown: boolean) => void }
  /** This object's address, so an unsent message is kept against it — CON-10. */
  about?: string
  /** Add or take back a reaction on a message — CON-2. */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<Answer>
  /** Publish a deletion for one message — CON-3. Omitted where nobody may write. */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /** Publish an edit of one message — CON-4. Omitted where nobody may write. */
  onEditMessage?: (messageId: string, body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string) => Promise<Answer>
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
  /** Why this issue's own title, description and fields are shut while it can still be discussed, archived or deleted — an archived issue (SHI-36). */
  lockedReason?: string
  /** The line in the comment box's place when this file takes no comment or reaction — archived (Decided 2026-10-17). */
  commentsClosed?: string
  /** The upload behind attach. Injected so a story needs no relay; the app's by default. */
  upload?: (file: File) => Promise<Imeta>
  /** The `ArchivedNotice` of an archived issue, or one archived with its project: the first thing on the page (FOL-46). */
  archivedNotice?: ReactNode
  /** The members pill, at the end of the breadcrumb row — the old Peek header's place for it (SHI-31). */
  members?: ReactNode
  /** When it last changed, in the header: "Edited 5m ago", who and exactly when under the pointer. */
  edited?: { label: string; exact: string }
}

/** One issue's page, its comments or its Overview beside it. */
export function IssueView({ crumbs, title, summary, onSummarize, description, descriptionFormat, nameOf, onRename, onCopyBlockLink, onDescribe, onMention, descriptionBy, related, topics, threads, conversationsLoading, mentionsLoading, unread, stillUnread, onThreadShown, onStartConversation, onReply, activity, activityTruncated, history, fields, menu, comments, overview, about, onReact, onDeleteMessage, onEditMessage, readOnlyReason, lockedReason, commentsClosed, upload, archivedNotice, members, edited }: IssueViewProps) {
  // `linkTo` on each crumb (S15, 0.10.0): the breadcrumbs were the last links in Ship that reloaded the app (SHI-20).
  const items: Crumb[] = [{ label: 'Issues', ...linkTo(crumbs.issuesHref) }]
  // The box before the project's name says it is a project, as the sidebar's entry does (Katerina, 2026-09-09).
  if (crumbs.project) items.push({ label: crumbs.project.title, icon: <IconBox size={16} stroke={1.5} />, ...linkTo(crumbs.project.href) })
  if (crumbs.ref) items.push({ label: crumbs.ref, mono: true })
  // A block menu's Comment shows the column, with that block above its box (RIC-18).
  const comment = useBlockComment(description, descriptionFormat, () => comments.onShownChange(true), onStartConversation)

  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView. A page that scrolls inside itself: `flex-1 min-h-0
    // [contain:size]` takes exactly the frame's height, so its columns scroll and the frame does not.
    <div data-surface="issue" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* The kit's PageHeader (ONE-6, step 4a): the path, when it last changed, who is in it, and the page's own buttons (4b–4d). 48px whatever it holds, so the members pill arriving moves nothing. */}
      <PageHeader title={<Breadcrumb items={items} />} {...(edited ? { time: edited } : {})} members={members} actions={<PageActions what="issue" comments={{ ...comments, unread: Object.values(stillUnread ?? {}).some((ids) => ids.length > 0) }} overview={overview} {...menu} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />} />

      {/* No tab row: with Activity in the Overview, an issue has one page (Katerina, 2 November). */}
      <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
        {/* Blocks 16px apart (Katerina, 1 November). */}
        <Centred>
          {archivedNotice}
          <LiveHeader fields={<IssueFields {...fields} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />} title={title} titlePlaceholder="Untitled issue" onRename={onRename} summary={summary} onSummarize={onSummarize} description={description} format={descriptionFormat} onDescribe={onDescribe} onMention={onMention} descriptionBy={descriptionBy} nameOf={nameOf} readOnly={!!(readOnlyReason ?? lockedReason)} upload={upload} onCommentOnBlock={readOnlyReason ?? commentsClosed ? undefined : comment.start} onCopyBlockLink={onCopyBlockLink} holdKey={about && `description:${about}`} />
        </Centred>
      </ScrollArea>
      </div>

      {/* Its Overview, in the comments' place (ONE-6, step 4d): Activity, History, and what is placed under it ("Related"). */}
      {overview.shown && (
        <div className="flex shrink-0 flex-col border-l border-border-default" data-overview-column>
          <OverviewPanel activity={activity} activityTruncated={activityTruncated} loading={mentionsLoading} history={history} topics={topics} related={related} about={about} nameOf={nameOf} />
        </div>
      )}
      {/* Its comments, the kit's one column, 384px beside the page, the full height of the page (Katerina, 2 November). */}
      {comments.shown && (
        <div className="flex shrink-0 flex-col border-l border-border-default" data-comments-column>
          <ThreadList threads={threads} loading={conversationsLoading} unread={unread} stillUnread={stillUnread} onThreadShown={onThreadShown} onStart={comment.post} anchor={comment.anchor} onDropAnchor={comment.drop} onReply={onReply} disabledReason={readOnlyReason ?? commentsClosed} nameOf={nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} className="min-h-0 flex-1" />
        </div>
      )}
    </div>
  )
}
