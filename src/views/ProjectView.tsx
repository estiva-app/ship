import { IconBox, IconLayoutKanban, IconTable } from '@tabler/icons-react'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import type { Answer, Picks } from '@/components/conversations/shared'
import type { ReactNode } from 'react'
import { PageHeader } from '@estiva-app/ui'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { linkTo, type ProjectTab } from '@/router'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import type { StatusEntry } from '@/lib/issues'
import { Board } from '@/components/Board'
import type { ThreadData, UnreadByThread } from '@/components/ConversationThread'
import type { ActivityItem } from '@/components/Activity'
import type { IssueRowData } from '@/components/IssueRow'
import { IssuesTable, type IssuesTableRow } from '@/components/IssuesTable'
import { ProjectFields, type ProjectFieldsProps } from '@/components/PageFields'
import { PageActions, type PageActionsProps } from '@/components/PageActions'
import { Related, hasRelated } from '@/components/Related'
import { LiveHeader, type LiveHeaderProps } from '@/components/editing/LiveHeader'
import { MentionList, ThreadList } from '@/components/conversations/ThreadList'
import { useBlockComment } from '@/components/conversations/useBlockComment'
import { AppSection, Centred } from '@/components/layout/ReadingColumn'
import type { RelatedState } from '@/api/useRelated'

/**
 * One project, in tabs (Katerina, 29 September, shaped like Linear's):
 *
 * - **Overview** — the title, its fields and the description, always editable,
 *   and what is placed under the project ("Related").
 * - **Activity** — "Mentioned in" (conversations elsewhere that name it; CON-9).
 *   What declared itself about this project is its comments, the column beside
 *   the page on every tab, shown or hidden from the header (ONE-6, step 4c).
 * - **Issues** — the issues, full width, with Table / Board at the right end of
 *   the tab row.
 *
 * Overview and Activity sit in one centred 768px column; Issues takes the full
 * width, because the board has a column per status. "Add issue" is on every
 * tab. No details column (ONE-6, step 4b): the fields are a row under the
 * summary, the actions the header's ⋯. The open tab and the Table / Board
 * toggle are in the URL (`?tab=activity`, `?view=board`), so the caller owns
 * them.
 */
export interface ProjectViewProps {
  crumbs: { projectsHref: string; title: string }
  header: {
    title: string
    /** The one-line summary under the title (SPEC §6.12); absent when it has none. */
    summary?: string
    description: string
    descriptionFormat: ContentFormat
    nameOf?: (pubkey: string) => string
    archived: boolean
    onRename: (v: string) => Promise<boolean> | boolean
    /** Save the summary: `true`, or the words for why it was refused. Empty clears it. */
    onSummarize?: (v: string) => Promise<true | string>
    onDescribe: LiveHeaderProps['onDescribe']
    onMention?: LiveHeaderProps['onMention']
    /** Who saved the description last, by name, when it was not you (LTX-3). */
    descriptionBy?: string | null
  }
  /** "Add issue", at the right end of the tab row; none on an archived project, so no button. */
  onAddIssue?: () => void
  /** The open tab — in the URL. */
  tab: ProjectTab
  onTab: (tab: ProjectTab) => void
  view: 'table' | 'board'
  onView: (view: 'table' | 'board') => void
  issues: IssuesTableRow[]
  issueStatuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  /** Foreign files placed under this project — RFC 0.5 §10.7. Drawn only when there is something to say; see `hasRelated`. */
  related?: RelatedState
  threads: ThreadData[]
  /** The conversations, and Mentioned in, are still on the way (APP-5): drawn as loading, never as none. */
  conversationsLoading?: boolean
  mentionsLoading?: boolean
  /** Thread id → its message ids new when the page opened. Drives the "new since" line (CRO-13), held for the visit (99557309). */
  unread?: UnreadByThread
  /** Thread id → its message ids still unread now. Drives "N new" (SHI-38). */
  stillUnread?: UnreadByThread
  /** A thread's replies drawn or hidden — the page marks the drawn ones read (CON-34). */
  onThreadShown?: (threadId: string, open: boolean) => void
  /**
   * `files` are attachments already on the relay — SHI-2; `picks` the composer's urgent mentions (CON-25);
   * `blockId` when it starts from a block's menu, a comment anchored to that block — SPEC §13.6, RIC-18.
   */
  onStartConversation: (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<Answer>
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** The block menu's Copy link (RIC-18): copies and says so. */
  onCopyBlockLink?: (link: string) => void
  /** Threads elsewhere that mention this project — CON-9. */
  activity: ActivityItem[]
  /** How many the horizon left out — `ACTIVITY_HORIZON`. Said on screen, never implied. */
  activityTruncated?: number
  /** Reply into a thread belonging to another file: its own Folder, never this project's. */
  onReplyInActivity: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** Status, assignee and progress, as a row between the summary and the description (ONE-6, step 4b). */
  fields: Omit<ProjectFieldsProps, 'readOnlyReason' | 'lockedReason'>
  /** The header's ⋯: Move to Folder…, Copy link, Archive or Unarchive, Delete. */
  menu: Omit<PageActionsProps, 'what' | 'comments' | 'readOnlyReason' | 'lockedReason'>
  /** The comments column beside the page, on every tab (Katerina, 2 November), and whether it is shown: the header's button shows or hides it, and the page reads the comments only while it is. */
  comments: { shown: boolean; onShownChange: (shown: boolean) => void }
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
  /** Why this project's own title, description, fields and Add issue are shut while it can still be discussed, archived or deleted — an archived project (SHI-36). */
  lockedReason?: string
  /** The line in the comment box's place when this file takes no comment or reaction — archived (Decided 2026-10-17). */
  commentsClosed?: string
  /** The upload behind attach. Injected so a story needs no relay; the app's by default. */
  upload?: (file: File) => Promise<Imeta>
  /** The `ArchivedNotice` of an archived project: the first thing on every tab (FOL-46). */
  archivedNotice?: ReactNode
  /** The members pill, at the end of the breadcrumb row (SHI-31). */
  members?: ReactNode
  /** When it last changed, in the header: "Edited 5m ago", who and exactly when under the pointer. */
  edited?: { label: string; exact: string }
}

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'issues', label: 'Issues' },
]

/** One project's page, in tabs: Overview, Activity and Issues. */
export function ProjectView({ crumbs, header, onAddIssue, tab, onTab, view, onView, issues, issueStatuses, hrefFor, related, threads, conversationsLoading, mentionsLoading, unread, stillUnread, onThreadShown, onStartConversation, onReply, onCopyBlockLink, activity, activityTruncated, onReplyInActivity, fields, menu, comments, about, onReact, onDeleteMessage, onEditMessage, readOnlyReason, lockedReason, commentsClosed, upload, archivedNotice, members, edited }: ProjectViewProps) {
  // A block menu's Comment shows the column, with that block above its box (RIC-18).
  const comment = useBlockComment(header.description, header.descriptionFormat, () => comments.onShownChange(true), onStartConversation)
  return (
    // `data-surface`, `data-view` and `data-tab` are the smoke test's waypoints — see IssuesView. The Table/Board
    // toggle and the tabs swap content in place on the same route, so without them a test cannot tell "it
    // rendered" from "the click did nothing". A page that scrolls inside itself — see IssueView.
    <div data-surface="project" data-view={view} data-tab={tab} className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* The kit's PageHeader (ONE-6, steps 4a and 4b) — see IssueView. The box before the name says it is a project — the sidebar's icon for one (Katerina, 2026-09-09). */}
      <PageHeader
        title={<Breadcrumb items={[{ label: 'Projects', ...linkTo(crumbs.projectsHref) }, { label: crumbs.title, icon: <IconBox size={16} stroke={1.5} /> }]} />}
        {...(edited ? { time: edited } : {})}
        members={members}
        actions={<PageActions what="project" comments={{ ...comments, unread: Object.values(stillUnread ?? {}).some((ids) => ids.length > 0) }} {...menu} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />}
      />
      {/* The tabs directly under the header, 16px below it, as they were. */}
      <div className="flex min-h-8 items-center gap-3 px-6">
        {/* Changed on purpose (ONE-6, step 4c): the comments left Activity for the column, so the tab no longer says something there is new. */}
        <Tabs tabs={TABS} active={tab} onChange={onTab} />
        <div className="flex-1" />
        {tab === 'issues' && (
          <Tabs
            tabs={[
              { id: 'table', label: 'Table', icon: <IconTable size={16} stroke={1.5} /> },
              { id: 'board', label: 'Board', icon: <IconLayoutKanban size={16} stroke={1.5} /> },
            ]}
            active={view}
            onChange={onView}
            size="small"
          />
        )}
        {onAddIssue && (
          <Button variant="primary" onClick={onAddIssue} disabledReason={readOnlyReason}>
            Add issue
          </Button>
        )}
      </div>

      {/* Both columns scroll in a ScrollArea (D40): the bar takes no width, so the 24px of padding read the same with a bar as without. */}
      <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
        {tab === 'overview' && (
          // Blocks 16px apart (Katerina, 1 November).
          <Centred gap="block">
            {archivedNotice}
            <LiveHeader fields={<ProjectFields {...fields} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />} title={header.title} titlePlaceholder="Untitled project" onRename={header.onRename} summary={header.summary} onSummarize={header.onSummarize} description={header.description} format={header.descriptionFormat} onDescribe={header.onDescribe} onMention={header.onMention} descriptionBy={header.descriptionBy} nameOf={header.nameOf} readOnly={!!(readOnlyReason ?? lockedReason)} upload={upload} onCommentOnBlock={readOnlyReason ?? commentsClosed ? undefined : comment.start} onCopyBlockLink={onCopyBlockLink} holdKey={about && `description:${about}`} />
            {/* Nesting is by intent (RFC 0.5 §10.7): what somebody placed under this project, whatever app it belongs
                to. A line first, so the list the app adds never reads as part of the description someone typed. */}
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
            <AppSection title="Mentioned in">
              <MentionList items={activity} loading={mentionsLoading} truncated={activityTruncated} onReply={onReplyInActivity} disabledReason={readOnlyReason} nameOf={header.nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} />
            </AppSection>
          </Centred>
        )}

        {tab === 'issues' && archivedNotice}
        {tab === 'issues' &&
          (!issues.length ? (
            <EmptyState scope="section" message="No issues yet." />
          ) : view === 'board' ? (
            <Board issues={issues} statuses={issueStatuses} hrefFor={hrefFor} />
          ) : (
            <IssuesTable issues={issues} statuses={issueStatuses} hrefFor={hrefFor} />
          ))}
      </ScrollArea>
      </div>

      {/* Its comments, the kit's one column, 384px beside the page on every tab, Issues too (Katerina, 2 November: A). */}
      {comments.shown && (
        <div className="flex shrink-0 flex-col border-l border-border-default" data-comments-column>
          <ThreadList threads={threads} loading={conversationsLoading} unread={unread} stillUnread={stillUnread} onThreadShown={onThreadShown} onStart={comment.post} anchor={comment.anchor} onDropAnchor={comment.drop} onReply={onReply} disabledReason={readOnlyReason ?? commentsClosed} nameOf={header.nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} className="min-h-0 flex-1" />
        </div>
      )}
    </div>
  )
}
