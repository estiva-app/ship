import { KindIcon, Link } from '@estiva-app/ui'
import { ProjectProgress } from './ProjectProgress'
import { cn } from '@/lib/cn'
import type { TopicWorkRow as Row } from '@/lib/topics'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'

/** Who edited a row's file last and when ("Katerina, 2h ago"), in its column on a topic's page; hidden on a phone. */
export function EditedCaption({ edited }: { edited: string }) {
  return <span className="hidden w-32 shrink-0 truncate text-right text-caption text-text-muted sm:inline">{edited}</span>
}

/**
 * A project or an issue on a topic's page (SHIPS-4), as the approved story
 * `TopicPage` draws it: a project with its issues done of all beside a bar, an
 * issue with its project and its status. The row opens its page here; an
 * archived one's title is muted. `edited`, who edited it last and when, sits
 * before an issue's status (TOPI-8; Miky, 4 Nov). A topic's live projects are
 * drawn as the Projects page draws them, so only issues and archived rows use
 * this one.
 */
export function TopicWorkRow({ row, archived = false, edited }: { row: Row; archived?: boolean; edited?: string }) {
  return (
    <div data-topic-work={row.address} className="relative flex h-9 min-w-0 items-center gap-3 rounded-md px-3 transition-colors hover:bg-bg-hover">
      <KindIcon kind={row.kind} />
      <Link {...linkTo(row.href)} variant="plain" cover className="flex min-w-0 flex-1">
        <span className={cn('min-w-0 flex-1 truncate text-body-2', archived ? 'text-text-muted' : 'text-text-primary')}>{row.title}</span>
      </Link>
      {row.project && <span className="hidden max-w-48 truncate text-caption text-text-muted sm:inline">{row.project}</span>}
      {edited && <EditedCaption edited={edited} />}
      {row.progress ? (
        <ProjectProgress {...row.progress} archived={archived} />
      ) : (
        <StatusLabel value={row.status.value} label={row.status.label} size="small" className="w-28 shrink-0 justify-end" />
      )}
    </div>
  )
}
