import { IconBox, IconLayoutKanban, IconTable } from '@tabler/icons-react'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import type { Answer, Picks } from '@/components/conversations/shared'
import type { ReactNode } from 'react'
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
import { ProjectRail, type RailFolder, type RailPerson } from '@/components/ProjectRail'
import { Related, hasRelated } from '@/components/Related'
import { LiveHeader, type LiveHeaderProps } from '@/components/editing/LiveHeader'
import { MentionList, ThreadList } from '@/components/conversations/ThreadList'
import { useBlockComment } from '@/components/conversations/useBlockComment'
import { AppSection, Centred } from '@/components/layout/ReadingColumn'
import type { RelatedState } from '@/api/useRelated'

/**
 * One project, in tabs (Katerina, 29 September, shaped like Linear's):
 *
 * - **Overview** — the title and the description, always editable, and what is
 *   placed under the project ("Related").
 * - **Activity** — "Conversations" (what declared itself about this project)
 *   and "Mentioned in" (conversations elsewhere that name it; CON-9's two lists).
 * - **Issues** — the issues, full width, with Table / Board at the right end of
 *   the tab row.
 *
 * Overview and Activity sit in one centred 768px column; Issues takes the full
 * width, because the board has a column per status. "Add issue" is on every
 * tab. The rail is on every tab and never moves: the tab row is a grid row of
 * its own, level with the rail's top. The open tab and the Table / Board toggle
 * are in the URL (`?tab=activity`, `?view=board`), so the caller owns them.
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
  rail: {
    status: string
    statuses: StatusEntry[]
    onStatusChange: (v: string) => void
    lead: string
    people: RailPerson[]
    onLeadChange: (v: string) => void
    done: number
    total: number
    folders: RailFolder[] | null | undefined
    onMove?: () => void
    /** The project's own archive, when it differs from the header's (archived with its team, FOL-46). */
    archived?: boolean
    onArchive: () => void
    onDelete: () => void
  }
  /** This object's address, so an unsent message is kept against it — CON-10. */
  about?: string
  /** Add or take back a reaction on a message — CON-2. */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<Answer>
  /** Publish a deletion for one message — CON-3. Omitted where nobody may write. */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /** Publish an edit of one message — CON-4. Omitted where nobody may write. */
  onEditMessage?: (messageId: string, body: string, removeCard?: string, files?: readonly Imeta[]) => Promise<Answer>
  /** Why writes are unavailable — every write control on the page is disabled with it. */
  readOnlyReason?: string
  /** Why this project's own title, description, rail and Add issue are shut while it can still be discussed, archived or deleted — an archived project (SHI-36). */
  lockedReason?: string
  /** The line in the comment box's place when this file takes no comment or reaction — archived (Decided 2026-10-17). */
  commentsClosed?: string
  /** The upload behind attach. Injected so a story needs no relay; the app's by default. */
  upload?: (file: File) => Promise<Imeta>
  /** The `ArchivedNotice` of an archived project: the first thing on every tab (FOL-46). */
  archivedNotice?: ReactNode
  /** The members pill, at the end of the breadcrumb row (SHI-31). */
  members?: ReactNode
}

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'issues', label: 'Issues' },
]

/** One project's page, in tabs: Overview, Activity and Issues, with the rail on every tab. */
export function ProjectView({ crumbs, header, onAddIssue, tab, onTab, view, onView, issues, issueStatuses, hrefFor, related, threads, unread, stillUnread, onThreadShown, onStartConversation, onReply, onCopyBlockLink, activity, activityTruncated, onReplyInActivity, rail, about, onReact, onDeleteMessage, onEditMessage, readOnlyReason, lockedReason, commentsClosed, upload, archivedNotice, members }: ProjectViewProps) {
  const comment = useBlockComment(header.description, header.descriptionFormat, onTab, onStartConversation)
  return (
    // `data-surface`, `data-view` and `data-tab` are the smoke test's waypoints — see IssuesView. The Table/Board
    // toggle and the tabs swap content in place on the same route, so without them a test cannot tell "it
    // rendered" from "the click did nothing". A page that scrolls inside itself — see IssueView.
    <div data-surface="project" data-view={view} data-tab={tab} className="grid min-h-0 flex-1 [contain:size] grid-cols-[minmax(0,1fr)_1px_auto] grid-rows-[auto_auto_minmax(0,1fr)] gap-y-4">
      {/* `mt-5`, not `pt-5`, so the members pill arriving does not move the page — see IssueView. */}
      <div className="col-start-1 row-start-1 mt-5 flex min-h-8 items-center justify-between gap-4 px-6">
        {/* The box before the name says it is a project — the sidebar's icon for one (Katerina, 2026-09-09). */}
        <Breadcrumb items={[{ label: 'Projects', ...linkTo(crumbs.projectsHref) }, { label: crumbs.title, icon: <IconBox size={16} stroke={1.5} /> }]} />
        {members}
      </div>
      {/* The tab row is its own grid row, level with the rail's top, so the rail starts where it always has. */}
      <div className="col-start-1 row-start-2 flex min-h-8 items-center gap-3 px-6">
        {/* Overview and Issues do not read the conversation (66b31c4b), so Activity says when something there is new. */}
        <Tabs tabs={TABS.map((t) => (t.id === 'activity' ? { ...t, unread: Object.keys(stillUnread ?? {}).length > 0 } : t))} active={tab} onChange={onTab} />
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
      <ScrollArea className="col-start-1 row-start-3 min-h-0 min-w-0" contentClassName="flex flex-col gap-6 px-6 pb-5">
        {tab === 'overview' && (
          <Centred>
            {archivedNotice}
            <LiveHeader title={header.title} titlePlaceholder="Untitled project" onRename={header.onRename} summary={header.summary} onSummarize={header.onSummarize} description={header.description} format={header.descriptionFormat} onDescribe={header.onDescribe} onMention={header.onMention} descriptionBy={header.descriptionBy} nameOf={header.nameOf} readOnly={!!(readOnlyReason ?? lockedReason)} upload={upload} onCommentOnBlock={readOnlyReason ?? commentsClosed ? undefined : comment.start} onCopyBlockLink={onCopyBlockLink} holdKey={about && `description:${about}`} />
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
            <AppSection title="Conversations">
              <ThreadList threads={threads} unread={unread} stillUnread={stillUnread} onThreadShown={onThreadShown} onStart={comment.post} anchor={comment.anchor} onDropAnchor={comment.drop} onReply={onReply} disabledReason={readOnlyReason ?? commentsClosed} nameOf={header.nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} />
            </AppSection>
            <AppSection title="Mentioned in">
              <MentionList items={activity} truncated={activityTruncated} onReply={onReplyInActivity} disabledReason={readOnlyReason} nameOf={header.nameOf} onReact={onReact} onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} about={about} upload={upload} />
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

      <Divider orientation="vertical" className="col-start-2 row-span-3 row-start-1" />
      {/* The rail on every tab, starting level with the tab row and never moving (Katerina, 29 September). */}
      <ScrollArea className="col-start-3 row-span-2 row-start-2 min-h-0" contentClassName="px-6 pb-5">
        <ProjectRail {...rail} archived={rail.archived ?? header.archived} readOnlyReason={readOnlyReason} lockedReason={lockedReason} />
      </ScrollArea>
    </div>
  )
}
