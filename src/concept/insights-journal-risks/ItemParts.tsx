/**
 * CONCEPT — the parts Ship's Insights, Journal and Risks tabs draw: an item's card, the Triage, the Journal timeline,
 * the filter row and the source as marked. Reuses: the kit's Card, Chip, StatusMark, Button, Avatar, MetaText,
 * EmptyState; the timeline's line is Ship's History line (a face, the words, when) on a vertical rule.
 */
import { useState, type ReactNode } from 'react'
import { IconArrowUpRight, IconTrash } from '@tabler/icons-react'
import { Avatar, Button, Card, Chip, EmptyState, MetaText, SkeletonList, StatusMark, Tabs, type ChipType } from '@estiva-app/ui'
import { TYPE_META, statusOption, type ItemType, type Status } from './MarkAs'
import type { Item, Source } from './fixtures'

const WORD_CHIP: Record<Item['word'], ChipType> = { Insight: 'warning', Decision: 'info', Update: 'neutral', Concern: 'error', Question: 'neutral' }

export function StatusOf({ item }: { item: Pick<Item, 'type' | 'status'> }) {
  const o = statusOption(item.type, item.status)
  return <StatusMark status={{ label: o.label, colour: o.colour ?? 'neutral' }} />
}

/** "From Katerina's message in Peek · Universal Navigation" — or "Typed by hand" for an item with no source. */
export function sourceLine(source?: Source) {
  if (!source) return 'Typed by hand'
  return `From ${source.author.name}’s ${source.what} in ${source.app} · ${source.place}`
}

/** Yes / No on a Proposed item — accept or reject it, signed as you (Miky, kickoff: on Proposed rows in the lists). */
export function YesNo({ onAnswer, waitingOn }: { onAnswer?: (yes: boolean) => void; waitingOn?: string }) {
  if (waitingOn) return <MetaText tone="muted">Waiting for {waitingOn}</MetaText>
  return (
    <div className="flex shrink-0 gap-2">
      <Button size="small" variant="outlined" onClick={() => onAnswer?.(true)}>
        Yes
      </Button>
      <Button size="small" variant="muted" onClick={() => onAnswer?.(false)}>
        No
      </Button>
    </div>
  )
}

/** One item as a card in a list: its word, title, where it came from, its status, and Yes / No while Proposed. */
export function ItemCard({ item, me = 'miky', onOpen }: { item: Item; me?: string; onOpen?: () => void }) {
  const [status, setStatus] = useState<Status>(item.status)
  const shown = { ...item, status }
  // A Decision naming someone else waits for them (Decided, 16 Nov); everyone else sees who.
  const waitingOn = status === 'proposed' && item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
  return (
    <Card fill="surface" hover="hairline" onPress={onOpen} {...(item.isNew ? { attention: 'accent' as const } : {})}>
      <div className="flex items-start gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Chip type={WORD_CHIP[item.word]} label={item.word} />
            <span className="truncate text-body-2 font-medium text-text-primary">{item.title}</span>
          </div>
          {item.summary && <span className="text-body-2 text-text-secondary">{item.summary}</span>}
          <MetaText tone="muted">
            {sourceLine(item.source)} · {item.decidedBy ? `Decided by ${item.decidedBy.name} · written by ${item.markedBy.name}` : `Marked by ${item.markedBy.name}`} · {item.at}
          </MetaText>
        </div>
        {status === 'proposed' ? <YesNo waitingOn={waitingOn} onAnswer={(yes) => setStatus(yes ? (item.type === 'risk' ? 'open' : 'accepted') : 'rejected')} /> : <StatusOf item={shown} />}
      </div>
    </Card>
  )
}

/** The filter row above a list: by status, the way Ship's Projects page tabs its statuses. */
export function FilterRow({ type, value, onChange, counts }: { type: ItemType; value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  const end = { insight: 'Outdated', journal: 'Superseded', risk: 'Resolved' }[type]
  const live = type === 'risk' ? 'Open' : 'Accepted'
  const tabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'live', label: live, count: counts.live },
    { id: 'proposed', label: 'Proposed', count: counts.proposed },
    { id: 'ended', label: `${end} and rejected`, count: counts.ended },
  ]
  return <Tabs tabs={tabs} active={value} onChange={onChange} size="small" />
}

export const LIVE: Status[] = ['accepted', 'open']
export const ENDED: Status[] = ['outdated', 'superseded', 'resolved', 'rejected']
export function filterItems(items: Item[], filter: string) {
  if (filter === 'live') return items.filter((i) => LIVE.includes(i.status))
  if (filter === 'proposed') return items.filter((i) => i.status === 'proposed')
  if (filter === 'ended') return items.filter((i) => ENDED.includes(i.status))
  return items
}
export const countsOf = (items: Item[]) => ({ all: items.length, live: filterItems(items, 'live').length, proposed: filterItems(items, 'proposed').length, ended: filterItems(items, 'ended').length })

/** A list's state: what to draw while it loads, when it failed, when it is empty. */
export type ListState = 'ready' | 'loading' | 'error' | 'empty'
export function ListStateView({ state, type, children }: { state: ListState; type: ItemType; children: ReactNode }) {
  if (state === 'loading') return <SkeletonList rows={4} />
  if (state === 'error') return <EmptyState scope="section" message={`Couldn’t load the ${TYPE_META[type].plural.toLowerCase()}. Try again.`} />
  if (state === 'empty')
    return (
      <EmptyState
        scope="section"
        icon={TYPE_META[type].icon(24)}
        message={
          {
            insight: 'No insights yet. Mark a message, a comment or a block as an Insight and it shows here.',
            journal: 'Nothing in the journal yet. Mark a message, a comment or a block as a Decision or an Update.',
            risk: 'No risks yet. Mark a message, a comment or a block as a Concern or a Question.',
          }[type]
        }
      />
    )
  return <>{children}</>
}

/** The Triage: what is new since your last visit, at the top of Insights (and Risks), each with Yes / No. */
export function Triage({ items, onOpen }: { items: Item[]; onOpen?: (item: Item) => void }) {
  const fresh = items.filter((i) => i.isNew && i.status === 'proposed')
  if (!fresh.length) return null
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-bg-inset p-3" aria-label="Triage">
      <span className="text-caption font-medium text-text-secondary">New since your last visit · {fresh.length}</span>
      {fresh.map((item) => (
        <ItemCard key={item.id} item={item} onOpen={() => onOpen?.(item)} />
      ))}
    </section>
  )
}

/** The Journal: History's lines on a vertical rule, grouped by day, newest first; a Proposed entry sits on the line with Yes / No. */
export function JournalTimeline({ items, onOpen, me = 'miky' }: { items: Item[]; onOpen?: (item: Item) => void; me?: string }) {
  const sorted = [...items].sort((a, b) => b.day.localeCompare(a.day))
  const days: { day: string; at: string; items: Item[] }[] = []
  for (const item of sorted) {
    const last = days[days.length - 1]
    if (last && last.day === item.day) last.items.push(item)
    else days.push({ day: item.day, at: item.at, items: [item] })
  }
  return (
    <ol className="flex flex-col gap-4" aria-label="Journal">
      {days.map((d) => (
        <li key={d.day} className="flex flex-col gap-2">
          <span className="text-caption font-medium text-text-secondary">{d.at}</span>
          <ol className="flex flex-col border-l border-border-default">
            {d.items.map((item) => (
              <TimelineEntry key={item.id} item={item} me={me} onOpen={() => onOpen?.(item)} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function TimelineEntry({ item, me, onOpen }: { item: Item; me: string; onOpen: () => void }) {
  const [status, setStatus] = useState<Status>(item.status)
  const proposed = status === 'proposed'
  const waitingOn = proposed && item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
  const ended = status === 'superseded' || status === 'rejected'
  return (
    <li className="relative flex items-start gap-3 py-2 pl-4">
      {/* The dot on the line: filled when accepted, hollow while proposed. */}
      <span aria-hidden className={`absolute -left-[5px] top-3.5 size-2.5 rounded-full border-2 ${proposed ? 'border-border-strong bg-bg-surface' : ended ? 'border-border-default bg-border-default' : 'border-info-default bg-info-default'}`} />
      <Avatar name={(item.decidedBy ?? item.markedBy).name} size={20} />
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${ended ? 'opacity-60' : ''}`}>
        <span className="text-body-2 text-text-primary">
          <span className="font-medium">{item.word}:</span>{' '}
          <span className={status === 'superseded' ? 'line-through' : ''}>{item.title}</span>
          {item.isNew && <span className="ml-2 text-caption font-medium text-info-default">New</span>}
        </span>
        <MetaText tone="muted">
          {item.decidedBy ? `Decided by ${item.decidedBy.name} · written by ${item.markedBy.name}` : `By ${item.markedBy.name}`} · {sourceLine(item.source)}
          {status !== 'proposed' && status !== 'accepted' ? ` · ${statusOption(item.type, status).label}` : ''}
        </MetaText>
      </div>
      {proposed ? <YesNo waitingOn={waitingOn} onAnswer={(yes) => setStatus(yes ? 'accepted' : 'rejected')} /> : null}
      <Button size="small" variant="muted" onClick={onOpen} aria-label={`Open ${item.title}`}>
        <IconArrowUpRight size={14} stroke={1.5} />
      </Button>
    </li>
  )
}

/** The source as it read when marked, pinned; "edited since marked" opens the words now (record #448). */
export function SourceAsMarked({ source }: { source?: Source }) {
  const [showNow, setShowNow] = useState(false)
  if (!source)
    return <MetaText tone="muted">Typed by hand — no message, comment or block behind it.</MetaText>
  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-border-default p-3">
      <figcaption className="flex items-center gap-2">
        <Avatar name={source.author.name} size={20} />
        <span className="text-body-2 text-text-primary">{source.author.name}’s {source.what}</span>
        <MetaText tone="muted">
          in {source.app} · {source.place}
        </MetaText>
        <div className="flex-1" />
        {!source.gone && (
          <Button size="small" variant="muted" onClick={() => {}}>
            Open in {source.app}
          </Button>
        )}
      </figcaption>
      {/* An item points, never copies (record #448): a deleted source shows that it was deleted, and no words. */}
      {source.gone ? (
        <MetaText tone="muted">
          <IconTrash size={12} stroke={1.5} className="mr-1 inline" />
          This {source.what} was deleted. The item keeps its own title and details.
        </MetaText>
      ) : (
        <blockquote className="border-l-2 border-border-default pl-3 text-body-2 text-text-primary">{showNow && source.now ? source.now : source.quote}</blockquote>
      )}
      {source.gone ? null : source.now ? (
        <Button size="small" variant="muted" onClick={() => setShowNow((v) => !v)}>
          {showNow ? 'Show as marked' : 'Edited since marked — show it now'}
        </Button>
      ) : (
        <MetaText tone="muted">As marked</MetaText>
      )}
    </figure>
  )
}
