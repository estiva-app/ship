import { useState } from 'react'
import { KindIcon, ListTable, ListTableRow, MembersPill, Panel, SearchInput, type AvatarGroupMember, type ListTableColumn } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { formatActive } from '@/lib/time'
import type { TopicRowData, TopicsTab } from '@/lib/topics'
import { useReportFailure } from '@/lib/failureReports'

/**
 * Ship's Explore initiatives, which the sidebar's Explore initiatives opens (TOPI-9, the
 * approved stories on `concept/topics-level-up`): a search beside tabs All,
 * Your initiatives, Other initiatives and Archived, each with its count, over every
 * initiative you can open, and Join on one you are not in. The lists' order is the
 * caller's: Your initiatives newest first, the rest A to Z. A team's is the
 * same view with its name before the title. The list is the kit's `ListTable`,
 * as Peek's Explore initiatives draws it (Katerina, 18 November: "just like in
 * Peek"); the code still says topics.
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

// Peek's words for its Explore initiatives, word for word (Katerina, 18 November); the code still says topics.
const TABS: Record<TopicsTab, string> = { all: 'All', yours: 'Your initiatives', others: 'Other initiatives', archived: 'Archived' }

/** What an empty tab says; with no topic shown at all, every open tab says the first. */
const EMPTY: Record<TopicsTab, string> = {
  all: 'No initiatives yet.',
  yours: 'You’re in no initiatives yet.',
  others: 'No other initiatives.',
  archived: 'No archived initiatives.',
}

/** Peek's columns: its team stays longest; who is in it and when it was last active give way first in a narrow window. */
const COLUMNS: ListTableColumn[] = [
  { label: 'Team', width: 'large' },
  // The members pill's width: three faces and the number.
  { label: 'Members', width: 'large', keep: 'low' },
  { label: 'Active', width: 'medium', keep: 'low' },
]

/** Nobody Ship can name: a dash, as Peek draws them. */
const NO_FACE = (): AvatarGroupMember => ({ name: '—' })

/** A topic is found by the start of a word of its title, as search is everywhere (Miky, 19 Oct). */
export function findsTopic(title: string, query: string): boolean {
  // Split as the title is, so "q4-pl" finds "Q4-plan".
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const titleWords = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.every((word) => titleWords.some((titleWord) => titleWord.startsWith(word)))
}

export function TopicsView({ title, lists, tab, onTab, onRetry, onJoin, joining, faceOf = NO_FACE, now: givenNow, query: firstQuery = '' }: TopicsViewProps) {
  const [query, setQuery] = useState(firstQuery)
  // Drawn afresh each time it opens, so "now" is when it opened, as Peek's and Leaf's.
  const [opened] = useState(() => Date.now())
  const now = givenNow ?? opened
  const asked = query.trim()
  useReportFailure(lists === 'failed' ? 'not-loaded' : undefined)
  const shown = typeof lists === 'string' ? [] : lists[tab].filter((topic) => !asked || findsTopic(topic.title, asked))
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView. The list's name in the page's bar, as Peek's and Leaf's
    // Explore (Katerina, 18 November: "the title of the page sits in a header … We should unify that"), the kit's Panel. A page that
    // scrolls inside itself, as an issue's: `flex-1 min-h-0 [contain:size]` takes exactly the frame's height, so the
    // panel's body scrolls and its bar stays.
    <div data-surface="topics" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col">
      <Panel title={title} bodyClassName="flex flex-col gap-4 px-6 py-5">
      {/* The bar's title is words, not a heading: the page's heading, for assistive technology. */}
      <h1 className="sr-only">{title}</h1>
      {lists === 'loading' ? (
        <SkeletonList rows={8} />
      ) : lists === 'failed' ? (
        <EmptyState icon={<KindIcon kind="topic" tone="inherit" />} scope="page" message="Initiatives didn’t load." action={{ label: 'Try again', onClick: onRetry }} />
      ) : (
        // 24px between the tabs and the list, as Peek's (Katerina, 16 November: 16 was too tight).
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs<TopicsTab> aria-label={title} tabs={(Object.keys(TABS) as TopicsTab[]).map((id) => ({ id, label: TABS[id], count: lists[id].length }))} active={tab} onChange={onTab} />
            <div className="w-64">
              <SearchInput placeholder="Find an initiative" aria-label="Find an initiative" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState scope="section" message={asked ? `No initiative matches “${asked}”.` : lists.all.length === 0 && tab !== 'archived' ? EMPTY.all : EMPTY[tab]} />
          ) : (
            <ListTable aria-label={title} columns={COLUMNS} end>
              {shown.map((topic) => (
                <TopicRow
                  key={topic.address}
                  topic={topic}
                  now={now}
                  faceOf={faceOf}
                  joining={joining?.has(topic.address) ?? false}
                  {...(!topic.yours && !topic.archived ? { onJoin: () => onJoin(topic.address) } : {})}
                />
              ))}
            </ListTable>
          )}
        </div>
      )}
      </Panel>
      </div>
    </div>
  )
}

/**
 * One initiative, as Peek's Explore draws it: its name and summary, its team, who is in it (the kit's members pill,
 * nothing to press: up to three faces and the number), when anything last happened in it, and Join on a live one you
 * are not in. The Archived tab says it is archived; the row does not say it again. It opens its page here (SHIPS-4),
 * an archived one read-only.
 */
function TopicRow({ topic, now, faceOf, joining, onJoin }: { topic: TopicRowData; now: number; faceOf: (pubkey: string) => AvatarGroupMember; joining: boolean; onJoin?: () => void }) {
  return (
    <ListTableRow
      data-topic={topic.address}
      href={topic.href}
      label={topic.title}
      {...(topic.summary ? { description: topic.summary } : {})}
      icon={<KindIcon kind="topic" />}
      cells={[
        topic.team,
        topic.members === undefined ? undefined : topic.members === 0 ? '0' : <MembersPill readOnly members={(topic.people ?? []).slice(0, 3).map(faceOf)} count={topic.members} />,
        topic.active ? formatActive(topic.active * 1000, now) : undefined,
      ]}
      end={
        // Outlined on a list's rows, where many are on screen; a place's own header has it primary (kit Button).
        onJoin && (
          <Button size="small" variant="outlined" onClick={onJoin} disabled={joining}>
            Join
          </Button>
        )
      }
    />
  )
}
