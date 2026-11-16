/**
 * CONCEPT — Ship's own views of two lists (Miky, 16 Nov: "Project Insights are not timeline … Insights will be grid
 * view and risks table view similarish to Issues"). The Journal stays the timeline (ItemParts).
 * - Insights: a grid of boxes, the kit's Card as Ship's project cards use it.
 * - Risks: Issues' table (`src/components/IssuesTable.tsx`), its header, cells and covering row link, with a risk's
 *   own columns.
 */
import { useState } from 'react'
import { Card, Link, MetaText, Person } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { WithSummary } from '@/components/SummaryLine'
import { AcceptReject, ENDED, ItemTag, LIVE, StatusOf, acceptedStatus } from './ItemParts'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { statusOption, type Status } from './MarkAs'
import type { Item } from './fixtures'

/** New first, then newest first: what waits for you leads either view. */
const newFirst = (items: Item[]) => [...items].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew) || b.day.localeCompare(a.day))

/** The dot that says new since your last visit, the tab's own dot. */
function NewDot({ on }: { on?: boolean }) {
  return on ? <span aria-label="New" className="size-1.5 shrink-0 rounded-full bg-accent-primary" /> : null
}

/** Accept and ✕ while Proposed, else its status; a Decision for someone else waits for them. */
function Answer({ item, me, status, onStatus }: { item: Item; me: string; status: Status; onStatus: (s: Status) => void }) {
  if (status === 'proposed') {
    const waitingOn = item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
    return <AcceptReject waitingOn={waitingOn} onAnswer={(yes) => onStatus(yes ? acceptedStatus(item) : 'rejected')} />
  }
  return LIVE.includes(status) ? null : <StatusOf item={{ type: item.type, status }} />
}

const where = (item: Item) => (item.source ? `${item.source.app} · ${item.source.place}` : 'Typed by hand')

/** One insight as a box: its category and when, the title, the summary, then who said it and where. */
function InsightBox({ item, me, onOpen, selected }: { item: Item; me: string; onOpen?: () => void; selected?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  const author = item.source?.author ?? item.markedBy
  return (
    <Card fill="surface" hover="hairline" onPress={onOpen} selected={selected} className="flex">
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2 p-3', ENDED.includes(status) && 'opacity-60')}>
        <div className="flex h-6 items-center gap-2">
          <NewDot on={item.isNew} />
          <ItemTag item={item} />
          <MetaText tone="muted">{item.at}</MetaText>
          <span className="ml-auto">
            <Answer item={item} me={me} status={status} onStatus={setStatus} />
          </span>
        </div>
        <span className="text-body-2 font-medium text-text-primary">{item.title}</span>
        {item.summary && <span className="line-clamp-3 text-body-2 text-text-secondary">{item.summary}</span>}
        <div className="mt-auto flex min-w-0 items-center gap-2 pt-1">
          <Person name={author.name} size={16} />
          <span className="min-w-0 truncate">
            <MetaText tone="muted">{where(item)}</MetaText>
          </span>
        </div>
      </div>
    </Card>
  )
}

/** Insights as a grid of boxes, as many columns as the room beside an open item allows. */
export function InsightGrid({ items, onOpen, openId, me = 'miky' }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-label="Insights">
      {newFirst(items).map((item) => (
        <InsightBox key={item.id} item={item} me={me} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
      ))}
    </div>
  )
}

// Issues' table look, as IssuesTable keeps it.
// @estiva-escape(no-copied-look): the concept copies IssuesTable's header cell so the two tables match; the build shares one table part
const TH = 'h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary'
const TD = 'h-10 px-3 text-body-2'

/** One risk as a row: Concern or Question · Title (its summary on hover) · Status · Raised by · About · When. */
function RiskRow({ item, me, onOpen, selected }: { item: Item; me: string; onOpen?: () => void; selected?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  const author = item.source?.author ?? item.markedBy
  return (
    <tr className={cn('relative border-b border-border-subtle last:border-b-0 hover:bg-bg-hover', selected && 'bg-bg-selected', ENDED.includes(status) && 'text-text-muted')}>
      <td className={TD}>
        <span className="flex items-center gap-2">
          <NewDot on={item.isNew} />
          <ItemTag item={item} />
        </span>
      </td>
      <td className={TD}>
        <WithSummary summary={item.summary} wrapperClassName="block min-w-0">
          <Link href="#" variant="quiet" truncate cover className="block" onClick={(e) => (e.preventDefault(), onOpen?.())}>
            {item.title}
          </Link>
        </WithSummary>
      </td>
      <td className={TD}>
        {/* Proposed: Accept and ✕ above the row's link; after that, the status written out, as Issues' table does. */}
        {status === 'proposed' ? (
          <span className="relative">
            <Answer item={item} me={me} status={status} onStatus={setStatus} />
          </span>
        ) : (
          <StatusLabel value={status} label={statusOption(item.type, status).label} colour={statusOption(item.type, status).colour} />
        )}
      </td>
      <td className={cn(TD, 'text-text-secondary')}>
        <Person name={author.name} size={16} />
      </td>
      <td className={cn(TD, 'truncate text-text-secondary')}>{item.about?.title ?? 'The team'}</td>
      <td className={cn(TD, 'whitespace-nowrap tabular-nums text-text-muted')}>{item.at}</td>
    </tr>
  )
}

/** Risks as a table, as Issues are: it scrolls sideways inside its own box rather than widen the page. */
export function RiskTable({ items, onOpen, openId, me = 'miky' }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string }) {
  return (
    <Card clip fill="none">
      <ScrollArea orientation="horizontal">
        <table className="w-full min-w-[840px] table-fixed border-collapse" aria-label="Risks">
          <thead className="bg-bg-surface">
            <tr className="border-b border-border-default">
              <th className={cn(TH, 'w-32')}>Kind</th>
              <th className={TH}>Title</th>
              <th className={cn(TH, 'w-48')}>Status</th>
              <th className={cn(TH, 'w-32')}>Raised by</th>
              <th className={cn(TH, 'w-48')}>About</th>
              <th className={cn(TH, 'w-24')}>When</th>
            </tr>
          </thead>
          <tbody>
            {newFirst(items).map((item) => (
              <RiskRow key={item.id} item={item} me={me} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  )
}
