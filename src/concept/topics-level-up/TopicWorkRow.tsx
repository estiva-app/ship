import { KindIcon, Link } from '@estiva-app/ui'
import { ProjectProgress } from '@/components/ProjectProgress'
import { cn } from '@/lib/cn'
import type { TopicWorkRow as Row } from '@/lib/topics'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'

/**
 * PROTOTYPE (Topics level-up, concept branch only): a copy of `src/components/TopicWorkRow.tsx`. What changed:
 * `edited`, who edited it last and when, before its status (Miky, 4 Nov). A topic's projects are drawn as the
 * Projects page draws them now, so only issues and archived rows use this one.
 *
 * A project or an issue on a topic's page (SHIPS-4), as the approved story
 * `TopicPage` draws it: a project with its issues done of all beside a bar, an
 * issue with its project and its status. The row opens its page here; an
 * archived one's title is muted.
 */
export function TopicWorkRow({ row, archived = false }: { row: Row & { edited?: string }; archived?: boolean }) {
  return (
    <div data-topic-work={row.address} className="relative flex h-9 min-w-0 items-center gap-3 rounded-md px-3 transition-colors hover:bg-bg-hover">
      <KindIcon kind={row.kind} />
      <Link {...linkTo(row.href)} variant="plain" cover className="flex min-w-0 flex-1">
        <span className={cn('min-w-0 flex-1 truncate text-body-2', archived ? 'text-text-muted' : 'text-text-primary')}>{row.title}</span>
      </Link>
      {row.project && <span className="hidden max-w-48 truncate text-caption text-text-muted sm:inline">{row.project}</span>}
      {row.edited && <span className="hidden w-32 shrink-0 truncate text-right text-caption text-text-muted sm:inline">{row.edited}</span>}
      {row.progress ? (
        <ProjectProgress {...row.progress} archived={archived} />
      ) : (
        <StatusLabel value={row.status.value} label={row.status.label} size="small" className="w-28 shrink-0 justify-end" />
      )}
    </div>
  )
}
