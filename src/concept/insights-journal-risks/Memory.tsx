/**
 * CONCEPT — an item as memory, in its detail (27 Nov, from the agent-memory research session): who reads it and why,
 * when it comes up, what it came from and whether that changed, where it was used, and what happened to it since.
 * Only what is new or needs the person is open; the rest is one line or folded.
 * Reuses: the kit's QuotedLine (the words a mark is on, as a comment's), CollapsibleSection, SectionLabel, Card,
 * Button, IconButton, Avatar, MetaText, Link; LinkCard for what it is about, and MoveDialog to file it by hand.
 * New here: nothing.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { IconArchive, IconArrowsExchange, IconBox, IconExternalLink, IconHistory, IconHourglass, IconLink, IconLock, IconQuote, IconReceipt, IconSparkles, IconUsers } from '@tabler/icons-react'
import { Avatar, Button, Card, CollapsibleSection, IconButton, Link, LinkCard, MetaText, MoveDialog, QuotedLine, SectionHeader, type Linked, type MovePlace } from '@estiva-app/ui'
import { AcceptReject } from './ItemParts'
import { PROJECT, TEAM, type Item, type Source } from './fixtures'

const stay = (e: { preventDefault: () => void }) => e.preventDefault()
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Every source of an item, the first one first (record an-item-goes-with-its-last-source-unless-a-person-accepted-it). */
export const sourcesOf = (item: Item): Source[] => [...(item.source ? [item.source] : []), ...(item.sources ?? [])]
/** Its last source is deleted. A person-accepted item stays and says so; one nobody accepted went with it. */
export const noSourceLeft = (item: Item) => sourcesOf(item).length > 0 && sourcesOf(item).every((s) => s.gone)
const personAccepted = (item: Item) => item.status !== 'proposed' && item.status !== 'rejected'

/**
 * Where an item was used (Miky, 19 Nov: "memory shows where it was used"): each answer, summary or loop run that read
 * it into what it did, newest first, so a person sees why the AI said what it said and can fix the memory behind it.
 */
export interface Use { by: string; what: string; where: string; days: number }
export function usesOf(item: Item): Use[] {
  if (item.id.startsWith('peek-') || item.layer === 'personal') return item.layer === 'personal' ? [{ by: 'Claude', what: 'Question to Miky about who reads a topic', where: 'Claude Code', days: 2 }] : []
  if (item.status === 'proposed')
    return item.category === 'Customer' ? [{ by: 'Claude', what: 'Answer to Katerina about the sidebar', where: 'Peek · Design', days: 2 }] : []
  if (item.source?.app === 'PostHog' || item.source?.app === 'Intercom') return [{ by: 'Claude', what: 'Answer to Miky about activation', where: 'Peek · Direct messages', days: 1 }]
  if (item.type === 'journal')
    return [
      { by: 'Claude', what: 'Plan for Teams in Ship', where: 'Ship · Teams stage', days: 3 },
      { by: 'Leaf’s review loop', what: 'Checked Universal Navigation against it', where: 'Leaf · Estiva HQ', days: 6 },
    ]
  if (item.type === 'risk') return [{ by: 'Claude', what: 'Friday summary', where: 'Peek · Friday Meetings', days: 0 }]
  return [
    { by: 'Claude', what: 'Friday summary', where: 'Peek · Friday Meetings', days: 1 },
    { by: 'Ship’s triage loop', what: 'Filed “Sidebar folders collapse” under it', where: 'Ship · Bugs', days: 4 },
  ]
}
const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`)

/**
 * A Proposed item fades after a time its team sets (Miky, 19 Nov, as Linear archives what nobody touches): out of every
 * list and of what agents read, until anyone restores it. A use, a comment, an edit or "Still useful" starts it again.
 * Accepted items never fade; a person or a loop marks them Outdated.
 */
export const FADE_DAYS = 30
const daysSince = (day: string) => Math.floor((Date.parse('2026-11-19') - Date.parse(day)) / 86_400_000)
const fadesIn = (item: Item) => FADE_DAYS - Math.min(daysSince(item.day), ...usesOf(item).map((u) => u.days))

/**
 * Who reads it, in one line, and which layer it is in (record a-loop-reads-only-shared-memory-and-your-own-agent-writes-
 * as-you): a place's shared memory, or your personal memory. When a source narrowed its readers (the most restricted
 * access among its sources, record #448), a second line says which.
 */
export function Readers({ item }: { item: Item }) {
  const value = (icon: ReactNode, words: string) => (
    <span className="flex min-w-0 items-center gap-1.5 text-body-2 text-text-primary">
      <span className="flex shrink-0 text-text-muted">{icon}</span>
      <span className="truncate">{words}</span>
    </span>
  )
  if (item.layer === 'personal') return value(<IconLock size={14} stroke={1.5} />, 'Only you and your Claude')
  const narrow = sourcesOf(item).find((s) => s.readers)
  if (narrow)
    return (
      <span className="flex min-w-0 flex-col">
        {value(<IconLock size={14} stroke={1.5} />, `Only ${narrow.readers}`)}
        <MetaText tone="muted">{`A source is in ${narrow.place}`}</MetaText>
      </span>
    )
  return value(<IconUsers size={14} stroke={1.5} />, `Everyone in ${item.team}`)
}

/** Who marked it and when, and who added it when that was someone else: the first line of its History, kept in view. */
export function Marked({ item }: { item: Item }) {
  const by = item.acceptedBy && item.status !== 'proposed' && item.acceptedBy.key !== item.markedBy.key ? ` · added by ${item.acceptedBy.name}` : ''
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-body-2 text-text-primary">
      <Avatar name={item.markedBy.name} size={16} {...(item.markedBy.bot ? { bot: true } : {})} />
      <span className="truncate">
        {item.markedBy.name}
        <span className="text-text-muted">{` · ${sourcesOf(item)[0]?.when ?? item.at}${by}`}</span>
      </span>
    </span>
  )
}

/** When it comes up (it is loaded by relevance, 27 Nov), in the loop's words, as a value. */
export const comesUp = (item: Item) => (item.mattersWhen ? `When ${lower(item.mattersWhen)}` : undefined)

/** The entry that replaced it, or that it replaced, linked both ways. */
export function Replaced({ item }: { item: Item }) {
  return (
    <Link href="#" variant="quiet" onClick={stay}>
      {item.supersededBy ?? item.replaces}
    </Link>
  )
}

/** How a Group draws: a card (the grouped panel), plain under a tab, or bare as a tab's whole content. */
export const GroupLook = createContext<'card' | 'plain' | 'bare'>('card')

/**
 * One group of the item's detail, as Linear's sidebar groups (Miky, 27 Nov: "clean and well structured"): a card with a
 * plain header, its count or state at the right, its one action, and its rows. `fold` folds it behind the header.
 */
export function Group({ title, trailing, action, fold, open, children }: { title: string; trailing?: string; action?: { tooltip: string; icon: ReactNode; onClick: () => void }; fold?: boolean; open?: boolean; children?: ReactNode }) {
  const look = useContext(GroupLook)
  const right = trailing ? <MetaText tone="muted">{trailing}</MetaText> : undefined
  // In a tab: no card and no fold; a tab of its own (Used in, History) drops the header, which the tab already says.
  if (look === 'bare') return <>{children}</>
  if (look === 'plain')
    return (
      <div className="flex flex-col">
        <SectionHeader title={title} trailing={right} hover="none" showActions="always" {...(action ? { actions: [action] } : {})} />
        {children && <div className="px-2 pb-2 pt-1">{children}</div>}
      </div>
    )
  return (
    <Card fill="none" className="flex flex-col px-1 py-1">
      {fold ? (
        <CollapsibleSection title={title} defaultOpen={open ?? false} trailing={right} contentClassName="px-2 pb-2 pt-1">
          {children}
        </CollapsibleSection>
      ) : (
        <>
          <SectionHeader title={title} trailing={right} hover="none" showActions="always" {...(action ? { actions: [action] } : {})} />
          {children && <div className="px-2 pb-2 pt-1">{children}</div>}
        </>
      )}
    </Card>
  )
}

/** One thing waiting on the person, in the panel's inset card: a line, its reason, and its one or two answers. */
function Waiting({ icon, line, why, children }: { icon: ReactNode; line: string; why: string; children: ReactNode }) {
  return (
    <Card fill="inset" className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-body-2 text-text-primary">
          <span className="mr-1 inline-flex align-[-2px]">{icon}</span>
          {line}
        </span>
        <span className="text-caption text-text-muted">{why}</span>
      </span>
      {children}
    </Card>
  )
}

/**
 * What waits on the person, above everything else: a loop's change to review and undo (record a-loop-may-change-an-
 * accepted-item-…), and an accepted item whose last source was deleted, which its loop proposes as Outdated for a
 * person to confirm (record an-item-goes-with-its-last-source-…). Nothing at all when nothing waits.
 */
export function NeedsYou({ item }: { item: Item }) {
  const [change, setChange] = useState<'open' | 'undone'>('open')
  const [outdated, setOutdated] = useState<'open' | 'yes' | 'no'>('open')
  const orphan = noSourceLeft(item) && personAccepted(item) && item.status !== 'outdated'
  if (!item.changed && !orphan) return null
  return (
    <div className="flex flex-col gap-2">
      {item.changed &&
        (change === 'undone' ? (
          <MetaText tone="muted">Undone: it is back as it was.</MetaText>
        ) : (
          <Waiting icon={<IconSparkles size={14} stroke={1.5} />} line={`${item.changed.by} ${item.changed.what}`} why={`${item.changed.why} · ${item.changed.ago}`}>
            <Button variant="outlined" size="small" onClick={() => setChange('undone')}>
              Undo
            </Button>
          </Waiting>
        ))}
      {orphan &&
        (outdated === 'open' ? (
          <Waiting icon={<IconSparkles size={14} stroke={1.5} />} line="No source left" why="Its only source was deleted. The project’s loop proposes Outdated.">
            <AcceptReject label="Outdated" onAnswer={(yes) => setOutdated(yes ? 'yes' : 'no')} />
          </Waiting>
        ) : (
          <span className="flex items-center justify-between gap-3">
            <MetaText tone="muted">{outdated === 'yes' ? 'Marked Outdated' : 'Kept as it is, with no source'}</MetaText>
            <Button variant="muted" size="small" onClick={() => setOutdated('open')}>
              Undo
            </Button>
          </span>
        ))}
    </div>
  )
}

/**
 * One source as it read when it was marked (record #448), checked before the item is used: whose, where and when; the
 * words as marked, which say so when they were edited since (with "See it now") or deleted. Opens in its app.
 */
function SourceRow({ source }: { source: Source }) {
  const [now, setNow] = useState(false)
  const state = source.gone ? 'gone' : source.now && !now ? 'reworded' : 'here'
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex shrink-0">
        <Avatar name={source.author.name} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body-2 text-text-primary">
            {source.author.name}’s {source.what}
            {source.when && <span className="text-text-muted">{` · ${source.when}`}</span>}
          </span>
          <span className="min-w-0 truncate">
            <MetaText tone="muted">
              in {source.app} · {source.place}
            </MetaText>
          </span>
        </span>
        <QuotedLine words={now && source.now ? source.now : source.quote} state={state} />
        {source.now && !source.gone && (
          <span>
            <Button size="small" variant="muted" onClick={() => setNow((v) => !v)}>
              {now ? 'Show as marked' : 'See it now'}
            </Button>
          </span>
        )}
      </span>
      {!source.gone && (
        <IconButton variant="muted" tooltip={`Open in ${source.app}`} aria-label={`Open in ${source.app}`} onClick={() => {}}>
          <IconExternalLink size={16} stroke={1.5} />
        </IconButton>
      )}
    </li>
  )
}

/** The item's sources, one or more; none for one typed by hand. */
export function Sources({ item }: { item: Item }) {
  // A tool's insight shows its live chart or quote above instead; a Decision that answered a Question shows the question.
  const list = sourcesOf(item).filter((s) => s.app !== 'PostHog' && s.app !== 'Intercom')
  if (!list.length) return item.decision || sourcesOf(item).length ? null : <Group title="Sources" trailing="Typed by hand" />
  return (
    <Group title={list.length > 1 ? 'Sources' : 'Source'} trailing={list.length > 1 ? String(list.length) : undefined}>
      <ul aria-label="Sources" className="flex flex-col gap-3">
        {list.map((s) => (
          <SourceRow key={`${s.place}-${s.quote}`} source={s} />
        ))}
      </ul>
    </Group>
  )
}

/**
 * Whether it is useful: its receipts, folded, with how many and when last; on a Proposed item, how long until it fades
 * and "Still useful", which starts the time again. Once faded, that it was, and Restore.
 */
export function Uses({ item, here }: { item: Item; here?: string }) {
  const uses = usesOf(item)
  const [kept, setKept] = useState(false)
  const left = kept ? FADE_DAYS : fadesIn(item)
  // Each AI session or loop run that read it as a source, with the sparkle the app gives AI work.
  const list = uses.length > 0 && (
    <ul aria-label="AI sessions that used it" className="flex flex-col gap-2">
      {uses.map((u) => (
        <li key={u.what} className="flex items-start gap-2">
          <span className="mt-0.5 flex w-4 shrink-0 justify-center text-text-muted">
            <IconSparkles size={14} stroke={1.5} />
          </span>
          <span className="flex min-w-0 flex-col">
            <Link href="#" variant="quiet" onClick={stay}>
              {u.what}
            </Link>
            <MetaText tone="muted">
              {u.by} · {u.where} · {ago(u.days)}
            </MetaText>
          </span>
        </li>
      ))}
    </ul>
  )
  // A suggestion's fading is the thing to see, so its group stays open; an added item's receipts fold.
  const fading = item.status === 'proposed' && (
    <>
      {item.status === 'proposed' &&
        (left > 0 ? (
          <span className="flex items-center justify-between gap-3">
            <MetaText tone="muted">
              <IconHourglass size={12} stroke={1.5} className="mr-1 inline" />
              {kept ? `Kept: fades in ${left} days` : `Fades in ${left} days`}
            </MetaText>
            {!kept && (
              <Button size="small" variant="muted" onClick={() => setKept(true)}>
                Still useful
              </Button>
            )}
          </span>
        ) : (
          <Waiting icon={<IconArchive size={14} stroke={1.5} />} line={`Faded ${-left} days ago`} why={`Nobody used or added it in ${FADE_DAYS} days, so agents no longer read it.`}>
            <Button variant="outlined" size="small" onClick={() => setKept(true)}>
              Restore
            </Button>
          </Waiting>
        ))}
    </>
  )
  return (
    <Group title="Used in" trailing={uses.length ? `last ${ago(uses[0].days)}` : undefined}>
      <div className="flex flex-col gap-3">
        <Filing item={item} here={here} />
        {list}
        {fading}
      </div>
    </Group>
  )
}

interface Event { by: string; trust?: string; what: string; why?: string; ago: string; undo?: boolean }
/** Everything that happened to it, newest first: changes, then who added it, then who marked it and why. */
export function historyOf(item: Item): Event[] {
  const events: Event[] = [...(item.history ?? [])]
  if (item.changed) events.unshift({ by: item.changed.by, trust: 'Acts, with Undo', what: item.changed.what, why: item.changed.why, ago: item.changed.ago })
  const marked = { by: item.markedBy.name, what: item.markedBy.bot ? 'suggested it' : 'marked it', why: item.why, ago: sourcesOf(item)[0]?.when ?? item.at }
  const added = item.acceptedBy && item.status !== 'proposed' ? { by: item.acceptedBy.name, what: item.type === 'insight' ? 'added it' : 'accepted it', ago: item.at } : undefined
  // One line when the same person marked and added it: a second says nothing new.
  if (added && added.by === marked.by && !item.markedBy.bot) events.push({ ...marked, what: `marked and ${added.what.replace(' it', '')} it` })
  else events.push(...(added ? [added] : []), marked)
  return events
}

function HistoryRow({ event }: { event: Event }) {
  const [undone, setUndone] = useState(false)
  const loop = /loop/i.test(event.by)
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex w-4 shrink-0 justify-center text-text-muted">{loop ? <IconSparkles size={14} stroke={1.5} /> : <Avatar name={event.by} size={16} />}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={undone ? 'text-body-2 text-text-muted line-through' : 'text-body-2 text-text-primary'}>
          {event.by} {event.what}
        </span>
        <MetaText tone="muted">{[event.why, event.trust, event.ago].filter(Boolean).join(' · ')}</MetaText>
      </span>
      {event.undo && (
        <Button size="small" variant="muted" onClick={() => setUndone((v) => !v)}>
          {undone ? 'Redo' : 'Undo'}
        </Button>
      )}
    </li>
  )
}

/**
 * Its history, folded unless something in it can still be undone: each change says who (a loop with its trust level),
 * what and why. The kit's CollapsibleSection with the count beside it.
 */
export function History({ item }: { item: Item }) {
  const events = historyOf(item)
  return (
    <Group title="History" trailing={String(events.length)} fold open={events.some((e) => e.undo)}>
      <ul className="flex flex-col gap-2">
        {events.map((e) => (
          <HistoryRow key={`${e.by}-${e.what}`} event={e} />
        ))}
      </ul>
    </Group>
  )
}

/**
 * The files an item can be about, as the kit's link card draws them (Miky, 27 Nov: a concern raised in Peek or Leaf
 * that ends up in a Ship project shows that project, so you understand its context at once). Real titles; the counts
 * and keys are drawn for the picture.
 */
const FILES: Record<string, Linked> = {
  [PROJECT]: {
    id: 'p', kind: 'project', title: PROJECT, href: '#', subtitle: `Project · ${TEAM}`,
    summary: 'Teams and Topics at the top of every app’s sidebar, and no Folders.',
    status: { value: 'started', options: [{ value: 'started', label: 'In progress', colour: 'blue' }] },
    done: { done: 5, total: 8 },
  },
  'Ship and Leaf sidebar match Peek': {
    id: 'i', kind: 'issue', key: 'TEA-12', title: 'Ship and Leaf sidebar match Peek', href: '#', subtitle: PROJECT,
    summary: 'Ship’s and Leaf’s sidebars list Teams and Topics the way Peek does.',
    status: { value: 'started', options: [{ value: 'started', label: 'In progress', colour: 'blue' }] },
    owner: { value: 'claude', options: [{ value: 'claude', label: 'Claude', bot: true }] },
  },
}
const PLACES: MovePlace[] = [
  { id: '', path: [] },
  { id: PROJECT, path: [PROJECT] },
  { id: 'Ship and Leaf sidebar match Peek', path: [PROJECT, 'Ship and Leaf sidebar match Peek'] },
  { id: 'Sidebar folders collapse', path: ['Bugs', 'Sidebar folders collapse'] },
]

/**
 * The file it is applied to, first in Used in (Miky, 27 Nov: "About more represents where it's used"): the project or
 * issue as the kit's link card, or one line when it is the page you are on. ⇄ files it yourself with the kit's Move
 * dialog; loops usually file it, and a person filing it by hand is the strongest lesson they get.
 */
function Filing({ item, here }: { item: Item; here?: string }) {
  const [about, setAbout] = useState(item.about?.title ?? '')
  const [moving, setMoving] = useState(false)
  const [byHand, setByHand] = useState(false)
  const file = FILES[about] ?? (about ? { id: about, kind: 'issue' as const, title: about, href: '#', subtitle: TEAM } : undefined)
  const change = (
    <IconButton variant="muted" tooltip="File under…" aria-label="File under…" onClick={() => setMoving(true)}>
      <IconArrowsExchange size={16} stroke={1.5} />
    </IconButton>
  )
  return (
    <div className="flex flex-col gap-1">
      {file && about !== here ? (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <LinkCard link={{ state: 'ready', linked: file }} readOnly />
          </div>
          {change}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex w-4 shrink-0 justify-center text-text-muted">
            <IconBox size={14} stroke={1.5} />
          </span>
          <span className="min-w-0 flex-1 text-body-2 text-text-primary">{file ? 'This project' : 'Not filed under a project or issue'}</span>
          {change}
        </div>
      )}
      {byHand && <MetaText tone="muted">Filed by you. The loop that files items learns from it.</MetaText>}
      {moving && (
        <MoveDialog
          heading="File under"
          title={item.title}
          description={`It stays in ${item.team}, and everyone who reads it now still does. Only what it is about changes.`}
          from={item.team}
          folders={[{ id: item.team, name: item.team }]}
          places={PLACES}
          topLabel="Nothing: the team’s own"
          onMove={(choice) => {
            setAbout(choice.parent ?? '')
            setByHand(true)
          }}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  )
}

/** The groups under the item's content: where it is used (its file, then AI sessions), its sources, its history. */
export function ItemTrail({ item, here }: { item: Item; here?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Uses item={item} here={here} />
      <Sources item={item} />
      <History item={item} />
    </div>
  )
}
