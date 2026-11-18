import { useState, type ReactNode } from 'react'
import { IconChevronDown, IconChevronRight, IconExternalLink, IconTarget } from '@tabler/icons-react'
import { ArchivedNotice, CollapsibleSection, KindIcon, Link, NoAccessNotice, PageHeader, SectionHeader, WithTooltip, type ArchivedNoticeProps } from '@estiva-app/ui'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SkeletonList } from '@/components/ui/Skeleton'
import { EditedCaption } from '@/components/EditedCaption'
import { PageActions } from '@/components/PageActions'
import { TeamChip } from '@/components/TeamChip'
import { WorkList, type WorkListRow } from '@/components/WorkList'
import type { Person } from '@/api/useDirectory'
import { cn } from '@/lib/cn'
import type { ProjectRowData } from '@/lib/projects'
import type { TopicWorkRow as WorkRow } from '@/lib/topics'
import { linkTo } from '@/router'

/** A Leaf document on a topic's page: its title, where it opens, who edited it last and when, and its pages. */
export interface TopicDocument {
  address: string
  title: string
  href?: string
  /** "Katerina, 2h ago". */
  edited?: string
  /** The pages directly under it; absent or empty: no fold. */
  children?: TopicDocument[]
}

/** A project's or an issue's row on the page, with an issue's assignee as a face. */
export type TopicWork = WorkRow & { assigneePerson?: Person }

/** What the page draws of a topic: its projects as the Projects page draws them, its issues, and the archived ones. */
export interface TopicPageView {
  title: string
  summary?: string
  /** The team it is in, by name. */
  team?: string
  /** That team's id: its chip opens the team's page. */
  teamId?: string
  archived: boolean
  /** Who archived it and when, for the kit's notice at the top of the page; absent when it is not archived. */
  archive?: Pick<ArchivedNoticeProps, 'by' | 'when' | 'resolution' | 'withWhat' | 'withTitle'>
  /** Not archived, in the topic's order, each with when it last changed (unix seconds). */
  projects: (ProjectRowData & { changedAt?: number })[]
  /** Not archived, in the topic's order. */
  issues: TopicWork[]
  archivedWork: TopicWork[]
}

/**
 * An initiative's page in Ship (SHIPS-4; TOPI-8; Katerina, 18 November, A4: direction A on the brainstorm page, "one
 * page, Peek's team-page look"):
 * - the kit's `PageHeader`, as a project's and an issue's, the one place the name is said: "Initiatives › ◎ <name>",
 *   then its team as ONE chip and Open (into Peek), as Peek's initiative page has them (D4, D5); its members, then the
 *   conversation's button and the ⋯ (Copy link);
 * - an archived one: the kit's notice first, who archived it and when, as every archived file shows it;
 * - its summary, then one list per kind under a heading with its count, each kind in the topic's order: **Projects**
 *   (status, lead, progress) and **Issues** (status, assignee, who edited it last), the shared `WorkList`, as a team's
 *   page lists them; no tabs (the status is a column); **Documents** from Leaf, each opening Leaf, folding to its pages;
 * - **Archived** last, a fold, shut while anything is not archived;
 * - the topic's conversation in the column beside the page, where a project's or an issue's comments sit.
 * A topic the reader cannot read is the card any file they cannot open gets.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/each-file-on-a-topic-keeps-its-own-place-and-look.md
 */
export interface TopicViewProps {
  topic: TopicPageView | 'loading' | 'failed' | 'unavailable'
  /** `loading` while they are read, `failed` when that read did not land. */
  documents: TopicDocument[] | 'loading' | 'failed'
  onRetry: () => void
  onRetryDocuments: () => void
  /** Where "Initiatives" in the path goes: Explore initiatives. */
  topicsHref: string
  /** The members pill (Ship's `Members`), at the end of the header's path. */
  members?: ReactNode
  /** The column beside the page, shown or hidden from the header; `unread` puts the kit's dot on the button while hidden. */
  comments: { shown: boolean; onShownChange: (shown: boolean) => void; unread?: boolean }
  /** The topic's conversation (`ThreadList`), drawn in that column. */
  conversation: ReactNode
  onCopyLink: () => void
  /** Its page in Peek, for the Open button after its name. Absent when the link is not known: no button. */
  peekUrl?: string
}

/** A project as `WorkList` draws it: its status, lead, progress and last change. */
const projectRow = (project: ProjectRowData & { changedAt?: number }): WorkListRow => ({
  address: project.addr,
  title: project.title,
  href: project.href,
  status: project.status,
  ...(project.lead ? { person: project.lead } : {}),
  progress: project.progress,
  ...(project.changedAt ? { at: project.changedAt } : {}),
})

/** A project or an issue on the page as `WorkList` draws it: an issue with its project under its name, as its row here named it. */
const workRow = (row: TopicWork): WorkListRow => ({
  address: row.address,
  title: row.title,
  href: row.href,
  status: row.status,
  ...(row.project ? { description: row.project } : {}),
  ...(row.assigneePerson ? { person: row.assigneePerson } : {}),
  ...(row.progress ? { progress: row.progress } : {}),
  ...(row.edited ? { at: row.edited.at } : {}),
})

export function TopicView({ topic, documents, onRetry, onRetryDocuments, topicsHref, members, comments, conversation, onCopyLink, peekUrl }: TopicViewProps) {
  if (topic === 'unavailable') return <NoAccessNotice what="initiative" />
  const loaded = typeof topic === 'object' ? topic : undefined
  const listed = documents === 'loading' || documents === 'failed' ? undefined : documents
  const live = loaded ? loaded.projects.length + loaded.issues.length : 0
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView. A page that scrolls inside itself, as an issue's.
    <div data-surface="topic" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={<Breadcrumb items={[{ label: 'Initiatives', ...linkTo(topicsHref) }, ...(loaded ? [{ label: loaded.title, icon: <KindIcon kind="topic" /> }] : [])]} />}
          after={
            loaded && (
              <>
                {/* The team it belongs to, the one chip after its name, opening the team's page (Katerina, 17 November: one chip; 18 November, D4). */}
                {loaded.team && loaded.teamId && <TeamChip id={loaded.teamId} name={loaded.team} />}
                {/* Open into Peek, as Peek's and Leaf's Open into another app (Katerina, 30 October; 18 November, D5): in place of the ⋯'s Open in Peek. */}
                {peekUrl && (
                  <WithTooltip label="Open in Peek">
                    <Button href={peekUrl} external size="small" className="shrink-0" leadingIcon={<IconExternalLink size={14} stroke={1.5} />} aria-label="Open in Peek">
                      Open
                    </Button>
                  </WithTooltip>
                )}
              </>
            )
          }
          members={loaded && members}
          actions={loaded && <PageActions what="topic" comments={comments} archive="none" onArchive={() => {}} onDelete={() => {}} onCopyLink={onCopyLink} />}
        />
        {topic === 'failed' ? (
          <EmptyState icon={<IconTarget size={16} stroke={1.5} />} scope="page" message="This initiative didn’t load." action={{ label: 'Try again', onClick: onRetry }} />
        ) : (
          // The page's whole width, 24px in, its parts 24px apart, as Peek's team page and Ship's (A4: "Peek's team-page look").
          <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 py-5">
            {topic === 'loading' ? (
              <SkeletonList rows={8} />
            ) : (
              <div data-topic-loaded className="flex flex-col gap-6">
                {/* The page's heading for assistive technology: the name is said once on screen, in the header's trail, and the
                    kit's PageHeader draws its title as text, not a heading (a kit gap, as Ship's list-page prototype found). */}
                <h1 className="sr-only">{topic.title}</h1>
                {/* Archived, said once (the header says the name; nothing else repeats it). */}
                {topic.archive && <ArchivedNotice {...topic.archive} />}
                {topic.summary && <p className="px-2 text-body-2 text-text-secondary">{topic.summary}</p>}
                {live === 0 && listed?.length === 0 ? (
                  <EmptyState scope="rows" message={topic.archivedWork.length > 0 ? 'All of its projects and issues are archived.' : 'No projects, issues or documents yet.'} />
                ) : (
                  <>
                    {topic.projects.length > 0 && (
                      <Section title="Projects" count={topic.projects.length}>
                        <WorkList label={`${topic.title}’s projects`} kind="project" rows={topic.projects.map(projectRow)} />
                      </Section>
                    )}
                    {topic.issues.length > 0 && (
                      <Section title="Issues" count={topic.issues.length}>
                        <WorkList label={`${topic.title}’s issues`} kind="issue" rows={topic.issues.map(workRow)} />
                      </Section>
                    )}
                    {documents === 'loading' ? (
                      <Section title="Documents">
                        <SkeletonList rows={3} />
                      </Section>
                    ) : documents === 'failed' ? (
                      <Section title="Documents">
                        {/* The section-level line (the row-level one draws no button), in a box 8px in, where the headings start: the gate puts the room on the box, not on the part. */}
                        <div className="px-2">
                          <EmptyState scope="section" message="Documents didn’t load." action={{ label: 'Try again', onClick: onRetryDocuments }} />
                        </div>
                      </Section>
                    ) : (
                      documents.length > 0 && (
                        // Today's rows, not the kit's list: a document opens Leaf in a new tab and folds to its pages, and the kit's
                        // list row does neither yet (a kit gap, asked of Katerina, 18 November).
                        <Section title="Documents" count={documents.length}>
                          <div className="flex flex-col gap-px">
                            {documents.map((document) => (
                              <DocumentRow key={document.address} document={document} />
                            ))}
                          </div>
                        </Section>
                      )
                    )}
                  </>
                )}
                {topic.archivedWork.length > 0 && (
                  // A fold of its own at the end: shut while anything is not archived, open when everything is.
                  <CollapsibleSection title="Archived" count={topic.archivedWork.length} defaultOpen={live === 0} contentClassName="flex flex-col gap-2">
                    {topic.archivedWork.some((row) => row.kind === 'project') && (
                      <WorkList label={`${topic.title}’s archived projects`} kind="project" rows={topic.archivedWork.filter((row) => row.kind === 'project').map(workRow)} />
                    )}
                    {topic.archivedWork.some((row) => row.kind === 'issue') && (
                      <WorkList label={`${topic.title}’s archived issues`} kind="issue" rows={topic.archivedWork.filter((row) => row.kind === 'issue').map(workRow)} />
                    )}
                  </CollapsibleSection>
                )}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
      {/* The topic's conversation, in the column a project's or an issue's comments take: the kit's one column, the page's full height. */}
      {comments.shown && topic !== 'failed' && (
        <div className="flex shrink-0 flex-col border-l border-border-default" data-comments-column>
          {conversation}
        </div>
      )}
    </div>
  )
}

/** One kind under its heading with its count: the kit's `SectionHeader`, as a team's page heads its lists. */
function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader title={title} {...(count !== undefined ? { count } : {})} hover="none" />
      {children}
    </section>
  )
}

/**
 * A Leaf document on a topic's page: who edited it last and when, and where it opens. One with pages folds open to
 * them, its arrow in the icon's place (the sidebar's fold, in a page row: new here, approved on the prototype).
 */
function DocumentRow({ document, depth = 0 }: { document: TopicDocument; depth?: number }) {
  const [open, setOpen] = useState(false)
  const pages = document.children ?? []
  return (
    <>
      <div data-topic-document={document.address} className={cn('relative flex h-9 min-w-0 items-center gap-3 rounded-md pr-3 transition-colors hover:bg-bg-hover', depth > 0 ? 'pl-10' : 'pl-3')}>
        <span className="flex size-4 shrink-0">{pages.length === 0 && <KindIcon kind="file" />}</span>
        {document.href ? (
          <Link href={document.href} external variant="plain" cover className="flex min-w-0 flex-1">
            <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
          </Link>
        ) : (
          // Nowhere to open it: no "Leaf ↗" that would look like a link.
          <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
        )}
        {document.edited && <EditedCaption edited={document.edited} />}
        {document.href && (
          <span className="flex w-12 items-center justify-end gap-1 text-caption text-text-muted">
            Leaf
            <IconExternalLink size={14} stroke={1.5} aria-hidden />
          </span>
        )}
        {/* After the covering link, so it stays its own button; drawn in the icon's place. */}
        {pages.length > 0 && (
          <span className={cn('absolute top-1/2 flex -translate-y-1/2', depth > 0 ? 'left-9' : 'left-2')}>
            <IconButton aria-label={open ? `Fold ${document.title}` : `Show the pages in ${document.title}`} tooltip={open ? 'Fold' : 'Show its pages'} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <IconChevronDown size={16} stroke={1.5} /> : <IconChevronRight size={16} stroke={1.5} />}
            </IconButton>
          </span>
        )}
      </div>
      {open && pages.map((page) => <DocumentRow key={page.address} document={page} depth={depth + 1} />)}
    </>
  )
}
