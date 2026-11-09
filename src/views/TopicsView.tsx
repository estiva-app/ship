import { useState } from 'react'
import { IconTarget } from '@tabler/icons-react'
import { SearchInput } from '@estiva-app/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { TopicRow } from '@/components/TopicRow'
import type { TopicRowData, TopicsTab } from '@/lib/topics'

/**
 * Ship's Topics, which the sidebar's Explore topics opens (TOPI-9, the
 * approved stories on `concept/topics-level-up`): a search beside tabs All,
 * Your topics, Other topics and Archived, each with its count, over every
 * topic you can open, and Join on one you are not in. The lists' order is the
 * caller's: Your topics newest first, the rest A to Z. A Folder's Topics is
 * the same view with its name before the title.
 */
export interface TopicsViewProps {
  /** "Topics", or "<Folder> · Topics". */
  title: string
  /** `loading` before the topics read lands, `failed` when it did not. */
  lists: Record<TopicsTab, TopicRowData[]> | 'loading' | 'failed'
  tab: TopicsTab
  onTab: (tab: TopicsTab) => void
  onRetry: () => void
  /** Join a topic you are not in. */
  onJoin: (address: string) => void
  /** The topics whose Join is on its way. */
  joining?: ReadonlySet<string>
  /** What the search starts with, for a story. */
  query?: string
}

const TABS: Record<TopicsTab, string> = { all: 'All', yours: 'Your topics', others: 'Other topics', archived: 'Archived' }

/** What an empty tab says; with no topic shown at all, every open tab says the first. */
const EMPTY: Record<TopicsTab, string> = {
  all: 'No topics yet.',
  yours: 'You are in no topic yet.',
  others: 'No other topics.',
  archived: 'No archived topics.',
}

/** A topic is found by the start of a word of its title, as search is everywhere (Miky, 19 Oct). */
export function findsTopic(title: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const titleWords = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.every((word) => titleWords.some((titleWord) => titleWord.startsWith(word)))
}

export function TopicsView({ title, lists, tab, onTab, onRetry, onJoin, joining, query: firstQuery = '' }: TopicsViewProps) {
  const [query, setQuery] = useState(firstQuery)
  const asked = query.trim()
  const shown = typeof lists === 'string' ? [] : lists[tab].filter((topic) => !asked || findsTopic(topic.title, asked))
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView.
    <div data-surface="topics" className="flex flex-1 flex-col gap-4 px-6 py-5">
      <h1 className="text-h3 text-text-primary">{title}</h1>
      {lists === 'loading' ? (
        <SkeletonList rows={8} />
      ) : lists === 'failed' ? (
        <EmptyState icon={<IconTarget size={16} stroke={1.5} />} scope="page" message="Topics didn’t load." action={{ label: 'Try again', onClick: onRetry }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs<TopicsTab> aria-label="Topics" tabs={(Object.keys(TABS) as TopicsTab[]).map((id) => ({ id, label: TABS[id], count: lists[id].length }))} active={tab} onChange={onTab} />
            <div className="w-64">
              <SearchInput placeholder="Find a topic" aria-label="Find a topic" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState scope="section" message={asked ? `No topic matches “${asked}”.` : lists.all.length === 0 && tab !== 'archived' ? EMPTY.all : EMPTY[tab]} />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="hidden items-center gap-3 px-3 text-caption text-text-muted sm:flex">
                <span className="flex-1 pl-7">Name</span>
                <span className="w-28">Team</span>
                <span className="w-20">Members</span>
                <span className="w-24">Active</span>
                <span className="w-16" />
              </div>
              {/* Rows as Ship's issue list draws them: the story's bordered box is no package part. */}
              <div className="flex flex-col gap-px">
                {shown.map((topic) => (
                  <TopicRow
                    key={topic.address}
                    topic={topic}
                    joining={joining?.has(topic.address)}
                    {...(!topic.yours && !topic.archived ? { onJoin: () => onJoin(topic.address) } : {})}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
