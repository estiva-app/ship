import type { ReactNode } from 'react'
import { IconExternalLink, IconTarget } from '@tabler/icons-react'
import { ArchivedNotice, CollapsibleSection, KindIcon, NoAccessNotice, PageHeader, SectionHeader, WithTooltip, type ArchivedNoticeProps } from '@estiva-app/ui'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SkeletonList } from '@/components/ui/Skeleton'
import { PageActions } from '@/components/PageActions'
import { TeamChip } from '@/components/TeamChip'
import { WorkList, type WorkListRow } from '@/components/WorkList'
import type { Person } from '@/api/useDirectory'
import type { ProjectRowData } from '@/lib/projects'
import type { TopicWorkRow as WorkRow } from '@/lib/topics'
import { linkTo } from '@/router'
import { useReportFailure } from '@/lib/failureReports'

/**
 * A Leaf document on a topic's page, or another app's file (A10): its title, where it opens, who edited it last and
 * when, and a document's pages.
 */
export interface TopicDocument {
  address: string
  title: string
  /** Another app's file: what it is, in its app's words ("Board"), on the line under its name. */
  type?: string
  href?: string
  /** "Katerina, 2h ago". */
  edited?: string
  /** Who edited it last, as a face in the People column, when Ship knows them. */
  editor?: Person
  /** The pages directly under it; absent or empty: no fold. */
  children?: TopicDocument[]
}

/** A project's or an issue's row on the page, with an issue's assignee as a face. */
export type TopicWork = WorkRow & { assigneePerson?: Person; /** "Ana, 1h ago": who edited it last and when. */ editedLabel?: string }

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
 *   **Files**, any other app's, each opening its app, its type under its name, as Leaf's initiative page lists them;
 * - **Archived** last, a fold, shut while anything is not archived;
 * - the topic's conversation in the column beside the page, where a project's or an issue's comments sit.
 * A topic the reader cannot read is the card any file they cannot open gets.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/each-file-on-a-topic-keeps-its-own-place-and-look.md
 */
export interface TopicViewProps {
  topic: TopicPageView | 'loading' | 'failed' | 'unavailable'
  /** `loading` while they are read, `failed` when that read did not land. */
  documents: TopicDocument[] | 'loading' | 'failed'
  /** Every other app's file it lists, read with the documents (A10): under Files, after them. */
  files?: TopicDocument[]
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
const projectRow = (project: ProjectRowData & { changedAt?: number; changedLabel?: string }): WorkListRow => ({
  address: project.addr,
  title: project.title,
  href: project.href,
  status: project.status,
  ...(project.lead ? { person: project.lead } : {}),
  progress: project.progress,
  ...(project.changedAt ? { at: project.changedAt } : {}),
  ...(project.changedLabel ? { edited: project.changedLabel } : {}),
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
  ...(row.editedLabel ? { edited: row.editedLabel } : {}),
})

/**
 * A Leaf document as `WorkList` draws it: who edited it last as a face and "Katerina, 2h ago" in When, opening Leaf in a
 * new tab, its pages folding under it (Katerina, 23 November: the kit's row now does both).
 */
const documentRow = (document: TopicDocument): WorkListRow => ({
  address: document.address,
  title: document.title,
  ...(document.href ? { href: document.href, external: true } : {}),
  ...(document.editor ? { person: document.editor } : {}),
  ...(document.edited ? { edited: document.edited } : {}),
  ...(document.children?.length ? { rows: document.children.map(documentRow) } : {}),
})

/** Another app's file as `WorkList` draws it: a document's row, its type on the line under its name (A10). */
const fileRow = (file: TopicDocument): WorkListRow => ({ ...documentRow(file), ...(file.type ? { description: file.type } : {}) })

export function TopicView({ topic, documents, files = [], onRetry, onRetryDocuments, topicsHref, members, comments, conversation, onCopyLink, peekUrl }: TopicViewProps) {
  useReportFailure(topic === 'failed' || documents === 'failed' ? 'not-loaded' : undefined)
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
                {live === 0 && listed?.length === 0 && files.length === 0 ? (
                  // Peek's own line when it lists nothing (peek `TopicFiles`), and Leaf's when all of it is archived: the same page
                  // says the same in every app (review of 23 November, B2).
                  <EmptyState scope="rows" message={topic.archivedWork.length > 0 ? 'Everything it lists is archived.' : 'None yet. An initiative can be only a conversation.'} />
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
                    {/* Its documents and other apps' files are one read: while it reads, and when it failed, no heading names
                        one kind of them. */}
                    {documents === 'loading' ? (
                      <SkeletonList rows={3} />
                    ) : documents === 'failed' ? (
                      // The section-level line (the row-level one draws no button), in a box 8px in, where the headings start: the
                      // gate puts the room on the box, not on the part. Leaf's words (review of 23 November, B2).
                      <div className="px-2">
                        <EmptyState scope="section" message="What it lists didn’t load." action={{ label: 'Try again', onClick: onRetryDocuments }} />
                      </div>
                    ) : (
                      documents.length > 0 && (
                        // The shared list, its columns lined up with Projects and Issues: Leaf opens in a new tab, pages fold under
                        // their document (the kit's row, Katerina 23 November).
                        <Section title="Documents" count={documents.length}>
                          <WorkList label={`${topic.title}’s documents`} kind="document" rows={documents.map(documentRow)} />
                        </Section>
                      )
                    )}
                    {files.length > 0 && (
                      // Another app's files, last, in the same columns: each opens its app in a new tab, its type under its
                      // name, as Leaf's initiative page lists them (review of 23 November, A10).
                      <Section title="Files" count={files.length}>
                        <WorkList label={`${topic.title}’s files`} kind="file" rows={files.map(fileRow)} />
                      </Section>
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

