/**
 * CONCEPT — Ship's own views of two lists (Miky, 16 Nov: "Project Insights are not timeline … Insights will be grid
 * view and risks table view similarish to Issues"). The Journal stays the timeline (ItemParts).
 * - Insights: a grid of boxes, the kit's Card as Ship's project cards use it.
 * - Risks: Issues' table (`src/components/IssuesTable.tsx`), its header, cells and covering row link, with a risk's
 *   own columns. Concern, Question and Blocker; a severity (Critical, High, Medium, Low) and the order: most recent or
 *   most severe first (Miky, 16 Nov).
 */
import { useState } from 'react'
import { IconAntennaBars2, IconAntennaBars3, IconAntennaBars4, IconAntennaBars5, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { Card, Link, MetaText, Person, SectionHeader } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { AcceptReject, ENDED, ItemTag, LIVE, StatusOf, acceptedStatus } from './ItemParts'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { statusOption, type Status } from './MarkAs'
import { SEVERITIES, type Item, type Severity, type Visual } from './fixtures'

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

/** A chart's range over it, as an analytics tool labels its tiles ("LAST 12 WEEKS"), and the latest value on the right. */
function ChartHead({ range, now }: { range: string; now?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-menu font-medium uppercase tracking-widest text-text-muted">{range}</span>
      {now && <span className="text-body-2 font-medium tabular-nums text-text-primary">{now}</span>}
    </div>
  )
}

/** A chart's two end dates under it. */
function ChartEnds({ labels }: { labels: [string, string] }) {
  return (
    <div className="flex justify-between">
      <MetaText tone="muted">{labels[0]}</MetaText>
      <MetaText tone="muted">{labels[1]}</MetaText>
    </div>
  )
}

/**
 * What an insight from another tool shows (Miky, 16 Nov: "make it more live"): PostHog's big number, bars or line,
 * drawn small in the accent colour, with the moment that changed it marked; a support desk's customer, in their words.
 */
function InsightVisual({ visual }: { visual: Visual }) {
  if (visual.kind === 'number')
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4">
        <ChartHead range={visual.range} />
        {/* eslint-disable-next-line token-values/no-restricted-classes -- @estiva-escape: a dashboard tile's big number; the kit has no display size yet, the build adds one */}
        <span className="text-[56px] font-semibold leading-none tabular-nums text-text-primary">{visual.value}</span>
        <span className={cn('flex items-center gap-1 text-body-2', visual.up ? 'text-success-default' : 'text-error-default')}>
          {visual.up ? <IconTrendingUp size={16} stroke={1.5} /> : <IconTrendingDown size={16} stroke={1.5} />}
          {visual.change}
        </span>
      </div>
    )
  if (visual.kind === 'quote')
    return (
      <figure className="flex flex-1 flex-col justify-center gap-2 py-1">
        <blockquote className="text-h3 font-normal leading-snug text-text-primary">“{visual.quote}”</blockquote>
        <figcaption>
          <MetaText tone="muted">
            {visual.customer}, {visual.company}
          </MetaText>
        </figcaption>
      </figure>
    )
  const max = Math.max(...visual.points) * 1.1
  const n = visual.points.length
  const last = visual.points[n - 1]
  const x = (i: number) => (visual.kind === 'bars' ? (i + 0.5) * (300 / n) : (i * 300) / (n - 1))
  const y = (v: number) => 100 - (v / max) * 100
  return (
    <div className="flex flex-col gap-1">
      <ChartHead range={visual.range} now={`${last}${visual.unit ?? ''} now`} />
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-28 w-full text-accent-primary" aria-label={`${visual.range}: ${visual.points.join(', ')}`}>
        {visual.kind === 'bars'
          ? visual.points.map((v, i) => (
              <rect key={i} x={x(i) - 300 / n / 2 + 3} width={300 / n - 6} y={y(v)} height={100 - y(v)} rx={1.5} fill="currentColor" opacity={visual.marker && i < visual.marker.at ? 0.35 : 1} />
            ))
          : (
            <>
              <polygon points={`0,100 ${visual.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} 300,100`} fill="currentColor" opacity={0.12} />
              <polyline points={visual.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </>
          )}
        {visual.marker && <line x1={x(visual.marker.at) - (visual.kind === 'bars' ? 300 / n / 2 : 0)} x2={x(visual.marker.at) - (visual.kind === 'bars' ? 300 / n / 2 : 0)} y1={0} y2={100} stroke="currentColor" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-text-muted" />}
      </svg>
      <ChartEnds labels={visual.labels} />
      {visual.marker && <MetaText tone="muted">┆ {visual.marker.label}</MetaText>}
    </div>
  )
}

/** One insight as a box: its category and when, the title, its picture or summary, then who sent it and where. */
function InsightBox({ item, me, onOpen, selected }: { item: Item; me: string; onOpen?: () => void; selected?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  // A tool sends it: the tool is the face, its dashboard or inbox the place (the customer is in the quote itself).
  const fromTool = item.source?.app === 'PostHog' || item.source?.app === 'Intercom'
  const face = fromTool ? item.markedBy.name : (item.source?.author ?? item.markedBy).name
  const wide = item.visual?.kind === 'bars' || item.visual?.kind === 'line'
  return (
    <Card fill="surface" hover="hairline" onPress={onOpen} selected={selected} className={cn('flex', wide && 'col-span-2')}>
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
        {item.visual ? <InsightVisual visual={item.visual} /> : item.summary && <span className="line-clamp-3 text-body-2 text-text-secondary">{item.summary}</span>}
        <div className="mt-auto flex min-w-0 items-center gap-2 pt-1">
          <Person name={face} size={16} />
          <span className="min-w-0 truncate">
            <MetaText tone="muted">{fromTool ? item.source?.place : where(item)}</MetaText>
          </span>
          {/* A tool's insight keeps updating: it says so, the way a dashboard tile does. */}
          {fromTool && item.visual?.kind !== 'quote' && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full bg-success-default" />
              <MetaText tone="muted">Updated 5 min ago</MetaText>
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Insights as a grid of boxes, as many columns as the room beside an open item allows. */
export function InsightGrid({ items, onOpen, openId, me = 'miky' }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string }) {
  // Two sections (Miky, 16 Nov: "a clear line between triaging and going through past insights"): what waits for an
  // answer, then everything else. With nothing to triage, only the second.
  const triage = newFirst(items.filter((i) => i.status === 'proposed'))
  const past = newFirst(items.filter((i) => i.status !== 'proposed'))
  const grid = (list: Item[], label: string) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-label={label}>
      {list.map((item) => (
        <InsightBox key={item.id} item={item} me={me} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
      ))}
    </div>
  )
  return (
    <div className="flex flex-col gap-6">
      {triage.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="To triage" count={triage.length} />
          {grid(triage, 'To triage')}
        </section>
      )}
      <section className="flex flex-col gap-3">
        {triage.length > 0 && <SectionHeader title="All insights" count={past.length} />}
        {grid(past, 'All insights')}
      </section>
    </div>
  )
}

// Issues' table look, as IssuesTable keeps it.
// @estiva-escape(no-copied-look): the concept copies IssuesTable's header cell so the two tables match; the build shares one table part
const TH = 'h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary'
const TD = 'h-10 px-3 text-body-2'

/** One risk as a row: Concern, Question or Blocker · Title (its summary on hover) · Severity · Status · Raised by · When. */
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
      {/* Two lines, as Linear's table has them (Miky, 16 Nov): the title, and the summary under it in full width. */}
      <td className="px-3 py-2 text-body-2">
        <span className="block font-medium"><Link href="#" variant="quiet" truncate cover className="block" onClick={(e) => (e.preventDefault(), onOpen?.())}>
          {item.title}
        </Link></span>
        {item.summary && <span className="block truncate text-text-secondary">{item.summary}</span>}
      </td>
      <td className={TD}>
        <SeverityMark severity={item.severity} />
      </td>
      <td className={cn(TD, 'text-text-secondary')}>
        <Person name={author.name} size={16} />
      </td>
      <td className={cn(TD, 'whitespace-nowrap tabular-nums text-text-muted')}>{item.at}</td>
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
    </tr>
  )
}

/** How the Risks table is ordered: newest first (new ones leading), or most severe first. */
export type RiskOrder = 'recent' | 'severe'
export const RISK_ORDERS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'severe', label: 'Most severe' },
]
const ordered = (items: Item[], order: RiskOrder) => {
  if (order === 'recent') return newFirst(items)
  // Most severe: what is still open by severity, Critical first (none set last), newest first within one; ended ones after.
  const rank = (i: Item) => (ENDED.includes(i.status) ? 10 : 0) + (i.severity ? SEVERITIES.indexOf(i.severity) : 4)
  return [...items].sort((a, b) => rank(a) - rank(b) || b.day.localeCompare(a.day))
}

/** A risk's severity: bars as a signal's strength, in the colour of how bad it is, and the word. */
export function SeverityMark({ severity }: { severity?: Severity }) {
  if (!severity) return <span className="text-text-muted">—</span>
  const look = {
    Critical: { icon: <IconAntennaBars5 size={16} stroke={1.5} />, text: 'text-error-default' },
    High: { icon: <IconAntennaBars4 size={16} stroke={1.5} />, text: 'text-warning-default' },
    Medium: { icon: <IconAntennaBars3 size={16} stroke={1.5} />, text: 'text-text-secondary' },
    Low: { icon: <IconAntennaBars2 size={16} stroke={1.5} />, text: 'text-text-muted' },
  }[severity]
  return (
    <span className={cn('flex items-center gap-1.5', look.text)}>
      {look.icon}
      {severity}
    </span>
  )
}

/** Risks as a table, as Issues are: it scrolls sideways inside its own box rather than widen the page. */
export function RiskTable({ items, order = 'recent', onOpen, openId, me = 'miky' }: { items: Item[]; order?: RiskOrder; onOpen?: (item: Item) => void; openId?: string; me?: string }) {
  return (
    <Card clip fill="none">
      <ScrollArea orientation="horizontal">
        <table className="w-full min-w-[840px] table-fixed border-collapse" aria-label="Risks">
          <thead className="bg-bg-surface">
            <tr className="border-b border-border-default">
              <th className={cn(TH, 'w-28')}>Kind</th>
              <th className={TH}>Title</th>
              <th className={cn(TH, 'w-28')}>Severity</th>
              <th className={cn(TH, 'w-32')}>Raised by</th>
              <th className={cn(TH, 'w-20')}>When</th>
              <th className={cn(TH, 'w-36')}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered(items, order).map((item) => (
              <RiskRow key={item.id} item={item} me={me} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  )
}
