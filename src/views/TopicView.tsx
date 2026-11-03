import { useState, type ReactNode } from 'react'
import { IconArchive, IconExternalLink, IconTarget } from '@tabler/icons-react'
import { KindIcon, Link, NoAccessNotice, SectionLabel } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { TopicWorkRow } from '@/components/TopicWorkRow'
import type { TopicPageData } from '@/lib/topics'

/** A Leaf document on a topic's page: its title and where it opens. */
export interface TopicDocument {
  address: string
  title: string
  href?: string
}

/**
 * A topic's page in Ship (SHIPS-4), as the approved story `TopicPage` draws it
 * (estiva-ui `concept/cross-app-navigation`, `ShipTopics.tsx`): its title with
 * its Folder under it and "Conversation in Peek" on the right, its summary, its
 * projects then its issues, the Leaf documents it lists, and the archived ones
 * behind a link. A topic the reader cannot read is the card any file they
 * cannot open gets.
 */
export interface TopicViewProps {
  topic: TopicPageData | 'loading' | 'failed' | 'unavailable'
  folderName?: string
  /** `loading` while their titles are read; a failed read draws none. */
  documents: TopicDocument[] | 'loading'
  onRetry: () => void
}

export function TopicView({ topic, folderName, documents, onRetry }: TopicViewProps) {
  const [showArchived, setShowArchived] = useState(false)
  if (topic === 'unavailable') return <NoAccessNotice what="topic" />
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView.
    <div data-surface="topic" className="flex flex-1 flex-col gap-5 px-6 py-5">
      {topic === 'loading' ? (
        <SkeletonList rows={8} />
      ) : topic === 'failed' ? (
        <EmptyState icon={<IconTarget size={16} stroke={1.5} />} scope="page" message="Topics didn’t load." action={{ label: 'Try again', onClick: onRetry }} />
      ) : (
        <div data-topic-loaded className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 items-center">
              <KindIcon kind="topic" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="text-h3 text-text-primary">{topic.title}</h1>
              {(folderName || topic.archived) && <span className="text-caption text-text-muted">{[folderName, topic.archived ? 'Archived' : undefined].filter(Boolean).join(' · ')}</span>}
            </div>
            {topic.peekUrl && (
              <span className="flex shrink-0 pt-1.5 text-body-2">
                <Link href={topic.peekUrl} external variant="quiet" className="flex items-center gap-1">
                  Conversation in Peek
                  <IconExternalLink size={14} stroke={1.5} aria-hidden />
                </Link>
              </span>
            )}
          </div>
          {topic.summary && <p className="text-body-2 text-text-secondary">{topic.summary}</p>}
          {topic.live.length > 0 ? (
            <div className="flex flex-col gap-px">
              {topic.live.map((row) => (
                <TopicWorkRow key={row.address} row={row} />
              ))}
            </div>
          ) : (
            <EmptyState scope="section" message={topic.archivedWork.length > 0 ? 'All of its projects and issues are archived.' : 'No projects or issues.'} />
          )}
          {documents === 'loading' ? (
            topic.documents.length > 0 && <SkeletonList rows={Math.min(topic.documents.length, 3)} />
          ) : (
            documents.length > 0 && (
              <Section label="Documents">
                {documents.map((document) => (
                  <div key={document.address} className="relative flex h-9 min-w-0 items-center gap-3 rounded-md px-3 transition-colors hover:bg-bg-hover">
                    <KindIcon kind="file" />
                    {document.href ? (
                      <Link href={document.href} external variant="plain" cover className="flex min-w-0 flex-1">
                        <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{document.title}</span>
                    )}
                    <span className="flex items-center gap-1 text-caption text-text-muted">
                      Leaf
                      <IconExternalLink size={14} stroke={1.5} aria-hidden />
                    </span>
                  </div>
                ))}
              </Section>
            )
          )}
          {topic.archivedWork.length > 0 &&
            (showArchived || topic.live.length === 0 ? (
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
    </div>
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
