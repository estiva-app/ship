import { IconMessages } from '@tabler/icons-react'
import { KindIcon, Link, UnreadDot } from '@estiva-app/ui'
import type { TopicRowData } from '@/lib/topics'
import { linkTo } from '@/router'

/**
 * One topic on Ship's Topics, as Linear draws an initiative (Miky, 2 Nov): its
 * name and summary, its projects done of all, its conversations and how many
 * are new for you. On a phone only the dot stays beside the name. It opens
 * the topic's page here (SHIPS-4).
 */
export function TopicRow({ topic }: { topic: TopicRowData }) {
  const { done, total } = topic.projects
  const name = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-body-2 font-medium text-text-primary">{topic.title}</span>
      {topic.summary && <span className="truncate text-caption text-text-secondary">{topic.summary}</span>}
    </span>
  )
  return (
    <div data-topic={topic.address} className="relative flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-bg-hover">
      <KindIcon kind="topic" />
      <Link {...linkTo(topic.href)} variant="plain" cover className="flex min-w-0 flex-1">
        {name}
      </Link>
      {topic.fresh > 0 && (
        <span className="flex shrink-0 sm:hidden">
          <UnreadDot />
          <span className="sr-only">{topic.fresh} new</span>
        </span>
      )}
      {/* A topic that lists no project leaves the cell empty, not "0 / 0" (Miky, 4 Nov). */}
      {total > 0 ? (
        <span className="hidden w-16 shrink-0 items-center gap-1 text-caption text-text-secondary sm:flex" aria-label={`${done} of ${total} projects completed`}>
          <KindIcon kind="project" />
          <span className="font-mono tabular-nums">
            {done} / {total}
          </span>
        </span>
      ) : (
        <span className="hidden w-16 shrink-0 sm:block" />
      )}
      <span className="hidden w-28 shrink-0 items-center gap-1 text-caption text-text-secondary sm:flex">
        <IconMessages size={16} stroke={1.5} aria-hidden />
        {/* A dash while the conversations are read: the rows draw from the topics read alone. */}
        <span className="font-mono tabular-nums">{topic.conversations ?? '–'}</span>
        {topic.fresh > 0 && (
          <span className="ml-1 flex items-center gap-1 text-text-primary">
            <UnreadDot />
            {topic.fresh} new
          </span>
        )}
      </span>
    </div>
  )
}
