/**
 * CONCEPT — Ship's own views of two lists (Miky, 16 Nov: "Project Insights are not timeline … Insights will be grid
 * view and risks table view similarish to Issues"). The Journal stays the timeline (ItemParts).
 * - Insights: a grid of boxes, the kit's Card as Ship's project cards use it.
 * - Risks: Issues' table (`src/components/IssuesTable.tsx`), its header, cells and covering row link, with a risk's
 *   own columns. Concern, Question and Blocker; a severity (Critical, High, Medium, Low) and the order: most recent or
 *   most severe first (Miky, 16 Nov).
 */
import { useState } from 'react'
import { IconPlus, IconSparkles } from '@tabler/icons-react'
import { AvatarGroup, Button, Card, Link, MetaText, Person, SectionHeader } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { AcceptReject, ENDED, ItemTag, LIVE, NewDot, StatusOf, WhereChip, acceptedStatus } from './ItemParts'
import { DecideDialog, InsightVisual, QuestionOptions, SeverityMark, needs, waited } from './ItemKinds'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { statusOption, wordIcon, type Status } from './MarkAs'
/** A severity's colour: the kind and the severity share it. */
import { SEVERITIES, type Item } from './fixtures'

/** New first, then newest first: what waits for you leads either view. */
const newFirst = (items: Item[]) => [...items].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew) || b.day.localeCompare(a.day))

/** Accept and ✕ while Proposed, else its status; a Decision for someone else waits for them. */
function Answer({ item, me, status, onStatus }: { item: Item; me: string; status: Status; onStatus: (s: Status) => void }) {
  if (status === 'proposed') {
    const waitingOn = item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
    return <AcceptReject waitingOn={waitingOn} label={item.type === 'insight' ? 'Add' : undefined} onAnswer={(yes) => onStatus(yes ? acceptedStatus(item) : 'rejected')} />
  }
  return LIVE.includes(status) ? null : <StatusOf item={{ type: item.type, status }} />
}

const where = (item: Item) => (item.source ? `${item.source.app} · ${item.source.place}` : 'Typed by hand')


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
          <ItemTag item={item} />
          <MetaText tone="muted">{item.at}</MetaText>
          <span className="ml-auto">
            <Answer item={item} me={me} status={status} onStatus={setStatus} />
          </span>
        </div>
        <span className="text-body-2 font-medium text-text-primary">
          {item.title}
          <NewDot on={item.isNew} />
          <WhereChip item={item} />
        </span>
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
export function InsightGrid({ items, onOpen, openId, me = 'miky', label = 'Insights' }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string; label?: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-label={label}>
      {newFirst(items).map((item) => (
        <InsightBox key={item.id} item={item} me={me} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
      ))}
    </div>
  )
}

/**
 * Newly suggested (Miky, 17 Nov: "simplify, simplify, simplify"): on every tab, what someone suggested and nobody has
 * added yet, as the same boxes and the same Add, above the tab's own list. Nothing suggested, no section.
 */
export function NewlySuggested({ items, onOpen, openId, me = 'miky' }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string }) {
  if (!items.length) return null
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Newly suggested" count={items.length} />
      <InsightGrid items={items} onOpen={onOpen} openId={openId} me={me} label="Newly suggested" />
    </section>
  )
}

// Issues' table look, as IssuesTable keeps it.
// @estiva-escape(no-copied-look): the concept copies IssuesTable's header cell so the two tables match; the build shares one table part
const TH = 'h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary'
const TD = 'h-10 px-3 text-body-2'

/** One risk as a row: Severity · Kind (Concern, Question or Blocker) · Title over its summary · Raised by · When · Status. */
function RiskRow({ item, me, onOpen, selected, kind = true }: { item: Item; me: string; onOpen?: () => void; selected?: boolean; kind?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  const author = item.source?.author ?? item.markedBy
  return (
    <tr className={cn('relative border-b border-border-subtle last:border-b-0 hover:bg-bg-hover', selected && 'bg-bg-selected', ENDED.includes(status) && 'text-text-muted')}>
      {/* Severity carries the colour; the kind only says what kind of risk it is, in plain text (Miky, 16 Nov: one cell for both was "too much"). */}
      <td className={TD}>
        <SeverityMark severity={item.severity} />
      </td>
      {kind && (
        <td className={cn(TD, 'text-text-secondary')}>
          <span className="flex items-center gap-1.5">
            {wordIcon(item.word, 16)}
            {item.word}
          </span>
        </td>
      )}
      {/* Two lines, as Linear's table has them (Miky, 16 Nov): the title, and the summary under it in full width. */}
      <td className="px-3 py-2 text-body-2">
        <span className="flex items-center font-medium">
          <Link href="#" variant="quiet" truncate cover onClick={(e) => (e.preventDefault(), onOpen?.())}>
            {item.title}
          </Link>
          <NewDot on={item.isNew} />
          <WhereChip item={item} />
        </span>
        {item.summary && <span className="block truncate text-text-secondary">{item.summary}</span>}
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


/** Risks as a table, as Issues are: it scrolls sideways inside its own box rather than widen the page. */
export function RiskTable({ items, order = 'recent', onOpen, openId, me = 'miky', kind = true }: { items: Item[]; order?: RiskOrder; onOpen?: (item: Item) => void; openId?: string; me?: string; kind?: boolean }) {
  return (
    <Card clip fill="none">
      <ScrollArea orientation="horizontal">
        <table className="w-full min-w-[840px] table-fixed border-collapse" aria-label="Risks">
          <thead className="bg-bg-surface">
            <tr className="border-b border-border-default">
              <th className={cn(TH, 'w-24')}>Severity</th>
              {kind && <th className={cn(TH, 'w-32')}>Kind</th>}
              <th className={TH}>Title</th>
              <th className={cn(TH, 'w-32')}>Raised by</th>
              <th className={cn(TH, 'w-20')}>When</th>
              <th className={cn(TH, 'w-36')}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered(items, order).map((item) => (
              <RiskRow key={item.id} item={item} me={me} kind={kind} selected={item.id === openId} onOpen={() => onOpen?.(item)} />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  )
}


/** A blocker: what stops, who has to act, for how long. Proposed ones ask for Accept first. */
function BlockerRow({ item, me, onOpen, selected }: { item: Item; me: string; onOpen?: () => void; selected?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  return (
    <li className={cn('relative flex items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0 hover:bg-bg-hover', selected && 'bg-bg-selected')}>
      <span className="mt-0.5 flex text-error-default">{wordIcon('Blocker', 18)}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center font-medium">
          <Link href="#" variant="quiet" truncate cover onClick={(e) => (e.preventDefault(), onOpen?.())}>
            {item.title}
          </Link>
          <NewDot on={item.isNew} />
          <WhereChip item={item} />
        </span>
        {item.summary && <span className="text-body-2 text-text-secondary">{item.summary}</span>}
        {item.blocks && <MetaText>Stops: {item.blocks}</MetaText>}
      </div>
      <div className="relative flex shrink-0 items-center gap-2 text-body-2">
        {status === 'proposed' ? (
          <>
            {/* Proposed still says how long it has stood: a blocker waits from when it was raised. */}
            <span className="tabular-nums text-text-muted">Raised {waited(item.day) === 'today' ? 'today' : `${waited(item.day)} ago`}</span>
            <Answer item={item} me={me} status={status} onStatus={setStatus} />
          </>
        ) : (
          item.waitingOn && (
            <>
              <span className="text-text-muted">Waiting on</span>
              <Person name={item.waitingOn.name} size={16} />
              <span className="tabular-nums text-text-muted">· {waited(item.day)}</span>
            </>
          )
        )}
      </div>
    </li>
  )
}

/** An open question as a box: its options at a glance, and the talk about them, so a team can start deciding. */
function QuestionBox({ item, me, onOpen, selected, onDecide, deciding = false }: { item: Item; me: string; onOpen?: () => void; selected?: boolean; onDecide?: (choice: number, why: string) => void; deciding?: boolean }) {
  const [status, setStatus] = useState<Status>(item.status)
  const [decide, setDecide] = useState(deciding)
  return (
    <Card fill="surface" hover="hairline" selected={selected} className="relative flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Severity first, as in the Concerns table (Miky, 16 Nov: some questions are secondary, some critical). */}
        <span className="flex min-w-0 items-start gap-2 font-medium">
          <span className="mt-0.5 flex shrink-0">
            <SeverityMark severity={item.severity} />
          </span>
          <span>
            <Link href="#" variant="quiet" cover onClick={(e) => (e.preventDefault(), onOpen?.())}>
              {item.title}
            </Link>
            <NewDot on={item.isNew} />
            <WhereChip item={item} />
          </span>
        </span>
        {status === 'proposed' && (
          <span className="relative shrink-0">
            <Answer item={item} me={me} status={status} onStatus={setStatus} />
          </span>
        )}
      </div>
      {item.options ? (
        <QuestionOptions options={item.options} />
      ) : (
        <div className="relative flex items-center justify-between gap-3 rounded-md bg-bg-inset px-3 py-2 text-body-2">
          <span className="text-text-secondary">No options yet.</span>
          <Button variant="outlined" size="small" leadingIcon={<IconSparkles size={14} stroke={1.5} />} onClick={() => undefined}>
            Research options
          </Button>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-2 border-t border-border-subtle pt-3">
        {/* What it needs now, from whom: the box's one call to act. */}
        <div className="relative flex items-center justify-between gap-3 text-body-2">
          <span className="font-medium text-text-primary">{needs(item, me)}</span>
          {item.step === 'decide' && item.decider?.key === me && (
            <Button variant="primary" size="small" onClick={() => setDecide(true)}>
              Decide
            </Button>
          )}
        </div>
        {decide && <DecideDialog item={item} onDecide={(c, why) => onDecide?.(c, why)} onClose={() => setDecide(false)} />}
        <div className="flex items-center justify-between gap-3 text-caption text-text-muted">
          {item.discussion ? (
            <span className="flex items-center gap-2">
              <AvatarGroup members={item.discussion.people.map((p) => ({ name: p.name, bot: p.bot }))} size={18} />
              {item.discussion.replies} replies · last {item.discussion.last}
            </span>
          ) : (
            <span>No discussion yet</span>
          )}
        </div>
      </div>
    </Card>
  )
}

/** An empty section: one quiet word, its + still beside the heading. */
function None() {
  return <MetaText tone="muted">None</MetaText>
}

/** A section's subtle + to add one of its kind by hand (Miky, 16 Nov). */
const add = (tooltip: string) => ({ icon: <IconPlus size={16} stroke={1.5} />, tooltip, onClick: () => undefined })

/**
 * Risks as a dashboard, not one table (Miky, 16 Nov): what someone must act on now, what is still to be decided, and
 * what to keep an eye on. Each is always there with its own +, saying None when empty (Miky, 16 Nov); what ended is
 * one line at the bottom.
 */
export function RiskDashboard({ items, onOpen, openId, me = 'miky', onDecide, deciding }: { items: Item[]; onOpen?: (item: Item) => void; openId?: string; me?: string; onDecide?: (item: Item, choice: number, why: string) => void; deciding?: string }) {
  const live = items.filter((i) => !ENDED.includes(i.status))
  const blockers = newFirst(live.filter((i) => i.word === 'Blocker'))
  const questions = ordered(live.filter((i) => i.word === 'Question'), 'severe')
  const concerns = live.filter((i) => i.word === 'Concern')
  const ended = items.length - live.length
  const open = (item: Item) => () => onOpen?.(item)
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Blockers" count={blockers.length} actions={[add('Add a blocker')]} showActions="always" />
        {blockers.length ? (
          // Urgent: someone must act now, so the warning hairline (Miky, 16 Nov: blockers to address at once).
          <Card fill="none" clip attention="warning">
            <ul aria-label="Blockers">
              {blockers.map((item) => (
                <BlockerRow key={item.id} item={item} me={me} selected={item.id === openId} onOpen={open(item)} />
              ))}
            </ul>
          </Card>
        ) : (
          <None />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <SectionHeader title="Open questions" count={questions.length} actions={[add('Add a question')]} showActions="always" />
        {questions.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3" aria-label="Open questions">
            {questions.map((item) => (
              <QuestionBox key={item.id} item={item} me={me} selected={item.id === openId} onOpen={open(item)} deciding={item.id === deciding} onDecide={(c, why) => onDecide?.(item, c, why)} />
            ))}
          </div>
        ) : (
          <None />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <SectionHeader title="Concerns" count={concerns.length} actions={[add('Add a concern')]} showActions="always" />
        {concerns.length ? <RiskTable items={concerns} order="severe" kind={false} onOpen={onOpen} openId={openId} me={me} /> : <None />}
      </section>
      {ended > 0 && <MetaText>Resolved and rejected · {ended}</MetaText>}
    </div>
  )
}
