import { useState } from 'react'
import { IconTarget } from '@tabler/icons-react'
import { SearchInput } from '@estiva-app/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import type { TopicRowData, TopicsTab } from '@/lib/topics'
import { TopicRow } from './TopicRow'

/**
 * PROTOTYPE (Topics level-up, concept branch only): a copy of `src/views/TopicsView.tsx`, which is now where the
 * sidebar's "Explore topics" goes. What changed: a search beside the tabs, and Join on a topic you are not in. The
 * lists' order is the caller's: All, Other topics and Archived A to Z, Your topics in the sidebar's order (newest
 * activity first).
 *
 * Ship's Topics, as the approved story draws it (estiva-ui
 * `concept/cross-app-navigation`, `ShipTopics.tsx`; Miky, 2 Nov): tabs All,
 * Your topics, Other topics and Archived, each with its count, over one row per
 * topic. A Folder's Topics is the same view with its name before the title.
 */
export interface TopicsViewProps {
  /** "Topics", or "<Folder> · Topics". */
  title: string
  /** `loading` before the topics read lands, `failed` when it did not. `yours`: no Join on it. */
  lists: Record<TopicsTab, (TopicRowData & { yours: boolean })[]> | 'loading' | 'failed'
  tab: TopicsTab
  onTab: (tab: TopicsTab) => void
  onRetry: () => void
  /** Join a topic you are not in. */
  onJoin: (address: string) => void
  /** What the search starts with, for a story. */
  query?: string
}

const TABS: Record<TopicsTab, string> = { all: 'All', yours: 'Your topics', others: 'Other topics', archived: 'Archived' }

/** What an empty tab says; with no topic shown at all, every open tab says the first. */
const EMPTY: Record<TopicsTab, string> = {
  // Every topic you can open is here now, not only those listing a project or issue.
  all: 'No topics yet.',
  yours: 'You are in no topic yet.',
  others: 'No other topics.',
  archived: 'No archived topics.',
}

export function TopicsView({ title, lists, tab, onTab, onRetry, onJoin, query: firstQuery = '' }: TopicsViewProps) {
  const [query, setQuery] = useState(firstQuery)
  const words = query.trim().toLowerCase()
  const shown = typeof lists === 'string' ? [] : lists[tab].filter((topic) => !words || topic.title.toLowerCase().includes(words))
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
            <EmptyState scope="section" message={words ? `No topic matches “${query.trim()}”.` : lists.all.length === 0 && tab !== 'archived' ? EMPTY.all : EMPTY[tab]} />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="hidden items-center gap-3 px-3 text-caption text-text-muted sm:flex">
                <span className="flex-1 pl-7">Name</span>
                <span className="w-16">Projects</span>
                <span className="w-28">Conversations</span>
                <span className="w-16" />
              </div>
              {/* Rows as Ship's issue list draws them: the story's bordered box is no package part. */}
              <div className="flex flex-col gap-px">
                {shown.map((topic) => (
                  <TopicRow key={topic.address} topic={topic} {...(!topic.yours && tab !== 'archived' ? { onJoin: () => onJoin(topic.address) } : {})} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
