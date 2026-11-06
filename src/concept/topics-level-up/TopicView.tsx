import { useState, type ReactNode } from 'react'
import { IconArchive, IconChevronDown, IconChevronRight, IconExternalLink, IconTarget } from '@tabler/icons-react'
import { KindIcon, Link, NoAccessNotice, PageHeader, SectionLabel } from '@estiva-app/ui'
import type { Imeta } from '@estiva-app/protocol'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { ProjectRow } from '@/components/ProjectRow'
import type { ThreadData } from '@/components/ConversationThread'
import type { Answer } from '@/components/conversations/shared'
import { ThreadList } from '@/components/conversations/ThreadList'
import { cn } from '@/lib/cn'
import type { ProjectRowData } from '@/lib/projects'
import { linkTo } from '@/router'
import type { TopicDocumentData, TopicPageFixture } from './fixtures'
import { PageActions } from './PageActions'
import { TopicWorkRow } from './TopicWorkRow'

/**
 * PROTOTYPE (Topics level-up, concept branch only): a copy of `src/views/TopicView.tsx`. What changed (Miky, 4 and
 * 6 Nov):
 * - the kit's `PageHeader` over the page, as a project's and an issue's: "Topics › <topic>", its members, and the
 *   page's buttons — the conversation's, then the ⋯ (Copy link, Open in Peek);
 * - **Projects** as the Projects page draws them (`ProjectRow`: status, lead, progress) under All, Planned, Active
 *   and Completed; then **Issues**; then **Documents**, each with who edited it last and when; a document folds open
 *   to its pages; each kind keeps the topic's order;
 * - the topic's conversation in the column beside the page, where a project's or an issue's comments sit
 *   (`ThreadList`, its comment box included), in place of the "Conversation in Peek" link.
 *
 * The original's comment: a topic's page in Ship (SHIPS-4), as the approved story `TopicPage` draws it (estiva-ui
 * `concept/cross-app-navigation`, `ShipTopics.tsx`): its title with its Folder under it, its summary, its projects
 * then its issues, the Leaf documents it lists, and the archived ones behind a link. A topic the reader cannot read
 * is the card any file they cannot open gets.
 */
export interface TopicViewProps {
  topic: TopicPageFixture | 'loading' | 'failed' | 'unavailable'
  /** `loading` while their titles are read, `failed` when that read did not land. */
  documents: TopicDocumentData[] | 'loading' | 'failed'
  onRetry: () => void
  onRetryDocuments: () => void
  /** Where "Topics" in the path goes: the Topics page. */
  topicsHref: string
  /** The members pill (Ship's `Members`), at the end of the header's path. */
  members?: ReactNode
  /** The topic's conversation, the same as in Peek: its threads, and the column shown or hidden from the header. */
  conversation: {
    threads: ThreadData[]
    loading?: boolean
    shown: boolean
    onShownChange: (shown: boolean) => void
    onStart: (text: string, files: readonly Imeta[]) => Promise<Answer>
    onReply: (threadId: string, text: string, files: readonly Imeta[]) => Promise<Answer>
    /** The line in the comment box's place: an archived topic takes no message. */
    closed?: string
  }
  onCopyLink: () => void
  onOpenInPeek: () => void
  /** The upload behind attach. Injected so a story needs no relay. */
  upload?: (file: File) => Promise<Imeta>
}

type ProjectsTab = 'all' | 'planned' | 'active' | 'completed'
const TABS: Record<ProjectsTab, string> = { all: 'All', planned: 'Planned', active: 'Active', completed: 'Completed' }
const EMPTY: Record<ProjectsTab, string> = { all: 'No projects here.', planned: 'No planned projects.', active: 'No active projects.', completed: 'No completed projects.' }
const TAB_OF: Record<string, ProjectsTab> = { planned: 'planned', in_progress: 'active', completed: 'completed' }
const inTab = (tab: ProjectsTab, project: ProjectRowData) => tab === 'all' || TAB_OF[project.status.value] === tab

export function TopicView({ topic, documents, onRetry, onRetryDocuments, topicsHref, members, conversation, onCopyLink, onOpenInPeek, upload }: TopicViewProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [tab, setTab] = useState<ProjectsTab>('all')
  if (topic === 'unavailable') return <NoAccessNotice what="topic" />
  const loaded = typeof topic === 'object' ? topic : undefined
  const shownProjects = loaded ? loaded.projects.filter((project) => inTab(tab, project)) : []
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView. A page that scrolls inside itself, as an issue's.
    <div data-surface="topic" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={<Breadcrumb items={[{ label: 'Topics', ...linkTo(topicsHref) }, ...(loaded ? [{ label: loaded.title, icon: <KindIcon kind="topic" /> }] : [])]} />}
          members={loaded && members}
          actions={loaded && <PageActions what="topic" comments={conversation} archive="none" onArchive={() => {}} onDelete={() => {}} onCopyLink={onCopyLink} onOpenInPeek={onOpenInPeek} />}
        />
        {topic === 'failed' ? (
          <EmptyState icon={<IconTarget size={16} stroke={1.5} />} scope="page" message="Topics didn’t load." action={{ label: 'Try again', onClick: onRetry }} />
        ) : (
        <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-5 px-6 py-5">
          {topic === 'loading' ? (
            <SkeletonList rows={8} />
          ) : (
            <div data-topic-loaded className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="flex h-8 items-center">
                  <KindIcon kind="topic" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h1 className="text-h3 text-text-primary">{topic.title}</h1>
                  <span className="text-caption text-text-muted">{[topic.team, topic.archived ? 'Archived' : undefined].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
              {topic.summary && <p className="text-body-2 text-text-secondary">{topic.summary}</p>}
              {topic.projects.length + topic.issues.length === 0 && documents !== 'loading' && documents !== 'failed' && documents.length === 0 ? (
                <EmptyState scope="section" message={topic.archivedWork.length > 0 ? 'All of its projects and issues are archived.' : 'No projects, issues or documents yet.'} />
              ) : (
                <>
                  {topic.projects.length > 0 && (
                    // Drawn as the Projects page draws them: the same tabs, header and rows; no Folder column, status on All only.
                    <section className="flex flex-col gap-2">
                      <SectionLabel tone="muted">Projects</SectionLabel>
                      <Tabs<ProjectsTab> aria-label="Projects by status" tabs={(Object.keys(TABS) as ProjectsTab[]).map((id) => ({ id, label: TABS[id], count: topic.projects.filter((project) => inTab(id, project)).length }))} active={tab} onChange={setTab} />
                      {shownProjects.length === 0 ? (
                        <EmptyState scope="section" message={EMPTY[tab]} />
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="hidden items-center gap-3 px-3 text-caption text-text-muted sm:flex">
                            <span className="flex-1 pl-7">Name</span>
                            {tab === 'all' && <span className="w-20">Status</span>}
                            <span className="w-10">Lead</span>
                            <span className="w-36">Progress</span>
                          </div>
                          <div className="flex flex-col gap-px">
                            {shownProjects.map((project) => (
                              <ProjectRow key={project.addr} project={project} showFolder={false} showStatus={tab === 'all'} />
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                  {topic.issues.length > 0 && (
                    <Section label="Issues">
                      {topic.issues.map((row) => (
                        <TopicWorkRow key={row.address} row={row} />
                      ))}
                    </Section>
                  )}
                  {documents === 'loading' ? (
                    <SkeletonList rows={3} />
                  ) : documents === 'failed' ? (
                    <Section label="Documents">
                      <EmptyState scope="section" message="Documents didn’t load." action={{ label: 'Try again', onClick: onRetryDocuments }} />
                    </Section>
                  ) : (
                    documents.length > 0 && (
                      <Section label="Documents">
                        {documents.map((document) => (
                          <DocumentRow key={document.address} document={document} />
                        ))}
                      </Section>
                    )
                  )}
                </>
              )}
              {topic.archivedWork.length > 0 &&
                (showArchived || topic.projects.length + topic.issues.length === 0 ? (
                  <Section label="Archived">
                    {topic.archivedWork.map((row) => (
                      <TopicWorkRow key={row.address} row={row} archived />
                    ))}
                  </Section>
                ) : (
                  // A button, not the story's link: it opens nothing, it shows the rows below.
                  <Button size="small" variant="muted" leadingIcon={<IconArchive size={14} stroke={1.5} />} className="self-start" onClick={() => setShowArchived(true)}>
                    Archived · {topic.archivedWork.length}
                  </Button>
                ))}
            </div>
          )}
        </ScrollArea>
        )}
      </div>
      {/* The topic's conversation, in the column a project's or an issue's comments take: the kit's one column, 384px, the page's full height. */}
      {conversation.shown && topic !== 'failed' && (
        <div className="flex shrink-0 flex-col border-l border-border-default" data-comments-column>
          <ThreadList threads={conversation.threads} loading={topic === 'loading' || conversation.loading} onStart={conversation.onStart} onReply={conversation.onReply} disabledReason={conversation.closed} upload={upload} className="min-h-0 flex-1" />
        </div>
      )}
    </div>
  )
}

/**
 * A Leaf document on a topic's page: who edited it last and when, and where it opens. One with pages folds open to
 * them, its arrow in the icon's place (the sidebar's fold, in a page row: new here).
 */
function DocumentRow({ document, depth = 0 }: { document: TopicDocumentData; depth?: number }) {
  const [open, setOpen] = useState(false)
  const pages = document.children ?? []
  return (
    <>
      <div className={cn('relative flex h-9 min-w-0 items-center gap-3 rounded-md pr-3 transition-colors hover:bg-bg-hover', depth > 0 ? 'pl-10' : 'pl-3')}>
        <span className="flex size-4 shrink-0">{pages.length === 0 && <KindIcon kind="file" />}</span>
        {document.href ? (
          <Link href={document.href} external variant="plain" cover className="flex min-w-0 flex-1">
            <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
          </Link>
        ) : (
          // Nowhere to open it: no "Leaf ↗" that would look like a link.
          <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
        )}
        <span className="hidden w-32 shrink-0 truncate text-right text-caption text-text-muted sm:inline">{document.edited}</span>
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

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel tone="muted">{label}</SectionLabel>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  )
}
