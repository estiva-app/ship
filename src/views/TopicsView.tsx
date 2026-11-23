import { useState } from 'react'
import { ExploreList, exploreWords, KindIcon, type AvatarGroupMember, type ExploreLists, type ExploreRow } from '@estiva-app/ui'
import { formatActive } from '@/lib/time'
import type { TopicRowData, TopicsTab } from '@/lib/topics'
import { useReportFailure } from '@/lib/failureReports'

/**
 * Ship's Explore initiatives, which the sidebar's Explore initiatives opens (TOPI-9, the
 * approved stories on `concept/topics-level-up`): a search beside tabs All,
 * Your initiatives, Other initiatives and Archived, each with its count, over every
 * initiative you can open, and Join on one you are not in. The lists' order is the
 * caller's: Your initiatives newest first, the rest A to Z. A team's is the
 * same view with its name before the title. It is the kit's `ExploreList`, Peek's
 * Explore initiatives in the kit (Katerina, 18 November: "just like in Peek"; 23
 * November, Q8); the code still says topics.
 */
export interface TopicsViewProps {
  /** "Explore initiatives", or "<Team> · Initiatives". */
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
  /** A person's face by their key, for each row's members pill. Default a dash: the number alone tells. */
  faceOf?: (pubkey: string) => AvatarGroupMember
  /** What Active counts back from, in ms: when the page opened. Default the first draw. */
  now?: number
  /** What the search starts with, for a story. */
  query?: string
}

/** Peek's words for its Explore initiatives, word for word (Katerina, 18 November), from the kit. */
const WORDS = exploreWords({ one: 'initiative', many: 'initiatives', a: 'an' })

/** Nobody Ship can name: a dash, as Peek draws them. */
const NO_FACE = (): AvatarGroupMember => ({ name: '—' })

export function TopicsView({ title, lists, tab, onTab, onRetry, onJoin, joining, faceOf = NO_FACE, now: givenNow, query }: TopicsViewProps) {
  // Drawn afresh each time it opens, so "now" is when it opened, as Peek's and Leaf's.
  const [opened] = useState(() => Date.now())
  const now = givenNow ?? opened
  useReportFailure(lists === 'failed' ? 'not-loaded' : undefined)
  /**
   * One initiative, as Peek's Explore draws it: its name and summary, its team, who is in it (up to three faces and the
   * number), when anything last happened in it, and Join on a live one you are not in. It opens its page here (SHIPS-4),
   * an archived one read-only.
   */
  const row = (topic: TopicRowData): ExploreRow => ({
    id: topic.address,
    label: topic.title,
    href: topic.href,
    ...(topic.summary ? { description: topic.summary } : {}),
    ...(topic.team ? { team: topic.team } : {}),
    ...(topic.members !== undefined ? { members: { faces: (topic.people ?? []).slice(0, 3).map(faceOf), count: topic.members } } : {}),
    ...(topic.active ? { active: formatActive(topic.active * 1000, now) } : {}),
    yours: topic.yours,
    archived: topic.archived,
  })
  const explore: ExploreLists = typeof lists === 'string' ? lists : { all: lists.all.map(row), yours: lists.yours.map(row), others: lists.others.map(row), archived: lists.archived.map(row) }
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView. A page that scrolls inside itself, as an issue's:
    // `flex-1 min-h-0 [contain:size]` takes exactly the frame's height, so the panel's body scrolls and its bar stays.
    <div data-surface="topics" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The bar's title is words, not a heading: the page's heading, for assistive technology. */}
        <h1 className="sr-only">{title}</h1>
        <ExploreList
          lists={explore}
          tab={tab}
          onTab={onTab}
          onRetry={onRetry}
          onJoin={(found) => onJoin(found.id)}
          {...(joining ? { joining } : {})}
          words={WORDS}
          title={title}
          // `inherit`: in a row the row's grey, as every list row's icon; on the page that did not load, the empty state's.
          icon={<KindIcon kind="topic" tone="inherit" />}
          {...(query ? { query } : {})}
        />
      </div>
    </div>
  )
}
