/**
 * CONCEPT — the Desk (Miky, 27 Nov: "your command center and your inbox in one, where you see the whole picture and
 * what needs your attention"; he chose B, inbox + picture). It is the one Desk chosen for all three apps on 28 Oct,
 * here in Ship, first in the sidebar, with Peek's Desk icon.
 * - Left, Needs you: only what waits on you (Miky, 19 Nov: a new item is not a chore), from every project: a
 *   question to decide or review, a blocker waiting on you, an AI session that stopped for you, an item whose last
 *   source is gone. The first opens as a decision card, as in the post Miky shared: what it is, the brief to read
 *   whole, and its answers as buttons. Under it, a quiet list of what is new since your last visit.
 * - Right, Projects: each project you are in, as its row, then one line each for Insights, Journal, Risks and AI
 *   sessions: the whole picture, grouped by project.
 * - The project filter narrows both. An item opens in the side panel, as it does on its project.
 * Drawn from the kit's PageHeader, Select, Card, SectionHeader, LinkRow, Button and Link; nothing new.
 */
import { useState, type ReactNode } from 'react'
import { IconBox, IconNote, IconSparkles, IconTerminal2 } from '@tabler/icons-react'
import { AvatarGroup, Button, Card, Link, LinkRow, MetaText, PageHeader, SectionHeader, Select, type Linked } from '@estiva-app/ui'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { TYPE_META, wordIcon } from './MarkAs'
import { ENDED } from './ItemParts'
import { SeverityMark, needs, waited } from './ItemKinds'
import { ItemPanel } from './ItemPanel'
import { noSourceLeft } from './Memory'
import { SESSIONS } from './Agents'
import { ELSEWHERE, projectOf } from './lens'
import { ITEMS, PROJECT, decide, type Item } from './fixtures'

const stay = (e: { preventDefault: () => void }) => e.preventDefault()
const ME = 'miky'
const LETTERS = 'ABCDEF'

/** The projects on the Desk, as their rows draw them; the counts are drawn for the picture. */
const PROJECTS: Linked[] = [
  {
    id: 'p1',
    kind: 'project',
    title: PROJECT,
    href: '#',
    subtitle: 'Estiva HQ',
    done: { done: 5, total: 8 },
  },
  {
    id: 'p2',
    kind: 'project',
    title: 'Insights, Journal and Risks',
    href: '#',
    subtitle: 'Estiva HQ',
    done: { done: 2, total: 6 },
  },
  {
    id: 'p3',
    kind: 'project',
    title: 'Activity indicator',
    href: '#',
    subtitle: 'Estiva HQ',
    done: { done: 7, total: 7 },
  },
]

/** One thing that waits on you: an item, or an AI session that stopped for you. */
type Row =
  | { kind: 'item'; item: Item; why: string; action: string; project: string }
  | {
      kind: 'session'
      id: string
      title: string
      why: string
      loop: boolean
      project: string
    }

function needsYou(all: Item[]): Row[] {
  const live = all.filter((i) => !ENDED.includes(i.status) && i.status !== 'proposed')
  const rows: Row[] = []
  for (const i of live) {
    const project = projectOf(i) ?? 'Estiva HQ'
    if (i.word === 'Question' && i.step === 'decide' && i.decider?.key === ME)
      rows.push({
        kind: 'item',
        item: i,
        why: 'Ready for you to decide',
        action: 'Decide',
        project,
      })
    else if (i.word === 'Blocker' && i.waitingOn?.key === ME)
      rows.push({
        kind: 'item',
        item: i,
        why: `Blocks the team · waiting on you ${waited(i.day)}`,
        action: 'Open',
        project,
      })
    else if (i.word === 'Question' && i.step === 'options' && i.decider?.key === ME)
      rows.push({
        kind: 'item',
        item: i,
        why: needs(i, ME),
        action: 'Review',
        project,
      })
    else if (noSourceLeft(i))
      rows.push({
        kind: 'item',
        item: i,
        why: 'Its only source was deleted · the loop proposes Outdated',
        action: 'Open',
        project,
      })
  }
  for (const s of SESSIONS.filter((x) => x.state === 'waiting'))
    rows.push({
      kind: 'session',
      id: s.id,
      title: s.loop ? `${s.who}: ${s.result}` : s.on,
      why: s.loop ? `${s.on} · ${s.ago}` : `${s.result} · ${s.ago}`,
      loop: !!s.loop,
      project: PROJECT,
    })
  return rows
}

/**
 * The first thing that waits on you, as the post's decision card: where it comes from and how long it waited, the
 * question, its words, the brief to read whole, and each option as an answer; the leaning one first in colour. Not
 * now moves it down the list.
 */
function DecisionCard({ item, project, onDecide, onLater, onOpen }: { item: Item; project: string; onDecide: (choice: number) => void; onLater: () => void; onOpen: () => void }) {
  const by = item.optionsBy
  return (
    <Card fill="surface" className="flex flex-col gap-4 p-5">
      <span className="flex items-center gap-2">
        <span className="flex text-text-muted">{wordIcon('Question', 16)}</span>
        <MetaText tone="muted">
          {project} · ready for you {waited(item.day)}
        </MetaText>
      </span>
      <span className="flex flex-col gap-2">
        <Link href="#" variant="quiet" onClick={(e) => (stay(e), onOpen())}>
          <span className="text-h2 text-text-primary">{item.title}</span>
        </Link>
        {item.summary && <span className="text-body-1 text-text-secondary">{item.summary}</span>}
      </span>
      {item.brief && (
        <LinkRow
          link={{
            state: 'ready',
            linked: {
              id: item.brief.title,
              kind: 'page',
              noun: 'Brief',
              title: item.brief.title,
              href: '#',
              subtitle: `${by?.name ?? 'Claude'} · ${item.brief.at}`,
              ...(by ? { authors: [{ name: by.name, bot: by.bot }] } : {}),
            },
          }}
          preview
        />
      )}
      {item.options && (
        <span className="flex flex-wrap gap-2">
          {item.options.map((o, n) => (
            <Button key={o.label} variant={o.lean ? 'primary' : 'outlined'} onClick={() => onDecide(n)}>
              {`${LETTERS[n]} · ${o.label}`}
            </Button>
          ))}
          <Button variant="muted" onClick={onLater}>
            Not now
          </Button>
        </span>
      )}
    </Card>
  )
}

/** One row of Needs you: what it is, why it waits on you and in which project, and its one action. */
function NeedRow({ row, onOpen, bare = false }: { row: Row; onOpen: (i: Item) => void; bare?: boolean }) {
  const icon =
    row.kind === 'session' ? (
      row.loop ? (
        <IconSparkles size={16} stroke={1.5} />
      ) : (
        <IconTerminal2 size={16} stroke={1.5} />
      )
    ) : row.item.word === 'Blocker' ? (
      <span className="flex text-error-default">{wordIcon('Blocker', 16)}</span>
    ) : row.item.word === 'Question' ? (
      <SeverityMark severity={row.item.severity} />
    ) : (
      TYPE_META[row.item.type].icon(16)
    )
  const title = row.kind === 'item' ? row.item.title : row.title
  return (
    <li className="relative flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <span className="flex w-4 shrink-0 justify-center text-text-muted">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Link href="#" variant="quiet" truncate cover onClick={(e) => (stay(e), row.kind === 'item' && onOpen(row.item))}>
          {title}
        </Link>
        <span className="min-w-0 truncate">
          {/* Inside its project's feed item, the project goes without saying. */}
          <MetaText tone="muted">{bare ? row.why : `${row.why} · ${row.project}`}</MetaText>
        </span>
      </span>
      <span className="relative shrink-0">
        <Button variant={row.kind === 'item' && row.action === 'Decide' ? 'primary' : 'outlined'} size="small" onClick={() => row.kind === 'item' && onOpen(row.item)}>
          {row.kind === 'item' ? row.action : row.loop ? 'Review' : 'Open session'}
        </Button>
      </span>
    </li>
  )
}

/** A project's highlights, counted: what both Desk variants draw of it. */
function statsOf(project: string, all: Item[]) {
  const mine = all.filter((i) => (projectOf(i) ?? '') === project && i.status !== 'rejected')
  const ofType = (t: Item['type']) => mine.filter((i) => i.type === t)
  const fresh = (t: Item['type']) => ofType(t).filter((i) => i.isNew).length
  const insights = ofType('insight')
  const journal = ofType('journal').filter((i) => i.status !== 'proposed')
  const risks = ofType('risk').filter((i) => !ENDED.includes(i.status) && i.status !== 'proposed')
  const blockers = risks.filter((i) => i.word === 'Blocker').length
  const sessions = project === PROJECT ? SESSIONS : []
  const working = sessions.filter((s) => s.state === 'working').length
  const waiting = sessions.filter((s) => s.state === 'waiting').length
  return {
    mine,
    fresh,
    insights,
    journal,
    risks,
    blockers,
    sessions,
    working,
    waiting,
  }
}

/** One project on the right: its row, then a line each for its Insights, Journal, Risks and AI sessions. */
function ProjectPicture({ project, all }: { project: Linked; all: Item[] }) {
  const { fresh, insights, journal, risks, blockers, sessions, working, waiting } = statsOf(project.title, all)
  const lines = [
    {
      icon: TYPE_META.insight.icon(14),
      label: 'Insights',
      text: insights.length ? `${insights.length}${fresh('insight') ? ` · ${fresh('insight')} new` : ''}` : 'None yet',
    },
    {
      icon: TYPE_META.journal.icon(14),
      label: 'Journal',
      text: journal[0] ? `${journal[0].title} · ${journal[0].at}` : 'Nothing written yet',
    },
    {
      icon: TYPE_META.risk.icon(14),
      label: 'Risks',
      text: risks.length ? `${risks.length} open${blockers ? ` · ${blockers} blocker` : ''}` : 'Nothing open',
    },
    {
      icon: <IconSparkles size={14} stroke={1.5} />,
      label: 'AI sessions',
      text: sessions.length ? [working && `${working} working`, waiting && `${waiting} wait on you`].filter(Boolean).join(' · ') || 'None running' : 'None running',
    },
  ]
  return (
    <Card fill="none" className="flex flex-col gap-1 p-1">
      <LinkRow link={{ state: 'ready', linked: project }} preview />
      <ul className="flex flex-col px-2 pb-1.5 pt-1" aria-label={`${project.title} at a glance`}>
        {lines.map((l) => (
          <li key={l.label} className="flex items-center gap-2 py-1">
            <span className="flex w-4 shrink-0 justify-center text-text-muted">{l.icon}</span>
            <span className="w-20 shrink-0 text-body-2 text-text-muted">{l.label}</span>
            <span className="min-w-0 flex-1 truncate">
              <Link href="#" variant="quiet" onClick={stay}>
                {l.text}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** One count on a project's mini dashboard: its kind, how many, and what is new or waiting in it. */
function Tile({ icon, label, count, sub }: { icon: ReactNode; label: string; count: number; sub?: string }) {
  return (
    <Card fill="inset" className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span className="flex items-center gap-1.5 text-text-muted">
        {icon}
        <MetaText tone="muted">{label}</MetaText>
      </span>
      <span className="text-h3 text-text-primary">{count}</span>
      <span className="min-w-0 truncate">
        <MetaText tone="muted">{sub ?? ' '}</MetaText>
      </span>
    </Card>
  )
}

/**
 * One item of the feed (Miky, 27 Nov: "one item in the feed is the Project and there you kind a have mini dashboard
 * with all the highlights", as Linear's Pulse but richer): the project's row and who was active in it; what waits on
 * you there; its four counts; then what happened, newest first, each highlight with its words.
 */
function ProjectInFeed({ project, all, needs, onOpen }: { project: Linked; all: Item[]; needs: Row[]; onOpen: (i: Item) => void }) {
  const s = statsOf(project.title, all)
  const recent = [...s.mine]
    .filter((i) => i.status !== 'proposed' || i.isNew)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 4)
  const fresh = s.mine.filter((i) => i.isNew).length
  const people = [...new Map(recent.map((i) => [i.markedBy.name, i.markedBy])).values()]
  return (
    <article aria-label={project.title} className="flex flex-col gap-3">
      <Card fill="none" className="flex flex-col gap-3 px-1 py-3">
        {/* The feed item's heading: the project across the card, then what is new in it and who was active. */}
        <span className="flex flex-col gap-0.5 px-3">
          <span className="flex items-center gap-2">
            <span className="flex text-text-muted">
              <IconBox size={16} stroke={1.5} />
            </span>
            <Link href={project.href} variant="quiet" onClick={stay}>
              <span className="text-h3 text-text-primary">{project.title}</span>
            </Link>
            <span className="flex-1" />
            {people.length > 0 && <AvatarGroup members={people.map((p) => ({ name: p.name, bot: p.bot }))} size={16} />}
          </span>
          <MetaText tone="muted">
            {[project.done && `${project.done.done} of ${project.done.total} issues done`, fresh ? `${fresh} new since your last visit` : 'Nothing new', `last ${(recent[0]?.at ?? 'a while ago').replace(/^Today$/, 'today')}`].filter(Boolean).join(' · ')}
          </MetaText>
        </span>
        {needs.length > 0 && (
          <span className="flex flex-col gap-1.5 px-3">
            <span className="text-caption font-medium text-text-primary">Waiting on you · {needs.length}</span>
            <Card fill="none" clip attention={needs.some((r) => r.kind === 'item' && r.item.word === 'Blocker') ? 'warning' : undefined}>
              <ul aria-label={`Needs you in ${project.title}`}>
                {needs.map((r) => (
                  <NeedRow key={r.kind === 'item' ? r.item.id : r.id} row={r} onOpen={onOpen} bare />
                ))}
              </ul>
            </Card>
          </span>
        )}
        <span className="grid grid-cols-4 gap-2 px-3">
          <Tile icon={TYPE_META.insight.icon(14)} label="Insights" count={s.insights.length} sub={s.fresh('insight') ? `${s.fresh('insight')} new` : undefined} />
          <Tile icon={TYPE_META.journal.icon(14)} label="Journal" count={s.journal.length} sub={s.fresh('journal') ? `${s.fresh('journal')} new` : undefined} />
          <Tile icon={TYPE_META.risk.icon(14)} label="Risks open" count={s.risks.length} sub={s.blockers ? `${s.blockers} blocker` : undefined} />
          <Tile
            icon={<IconSparkles size={14} stroke={1.5} />}
            label="AI sessions"
            count={s.working + s.waiting}
            sub={s.waiting ? `${s.waiting} wait on you` : s.working ? `${s.working} working` : undefined}
          />
        </span>
        {recent.length > 0 && (
          <ul aria-label={`What happened in ${project.title}`} className="flex flex-col gap-3 px-3 pt-1">
            {recent.map((i) => (
              <li key={i.id} className="relative flex gap-3">
                <span className={`mt-0.5 flex w-4 shrink-0 justify-center ${TYPE_META[i.type].text}`}>
                  {i.word === 'Question' || i.word === 'Blocker' ? wordIcon(i.word, 16) : TYPE_META[i.type].icon(16)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href="#" variant="quiet" cover onClick={(e) => (stay(e), onOpen(i))}>
                    <span className="font-medium text-text-primary">{i.title}</span>
                  </Link>
                  {i.summary && <span className="line-clamp-2 text-body-2 text-text-secondary">{i.summary}</span>}
                  <MetaText tone="muted">
                    {i.status === 'proposed' ? `Suggested ${i.word}` : i.word} · {i.markedBy.name} · {i.at}
                    {i.isNew ? ' · new' : ''}
                  </MetaText>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </article>
  )
}

/**
 * The second Desk (Miky, 27 Nov: "more works as feed, something like Linear has Pulse"): one column, the project with
 * the newest highlight first, each as its mini dashboard. What needs you sits inside its project, not in a list apart.
 */
function DeskFeed({ items, filter, onOpen }: { items: Item[]; filter: string; onOpen: (i: Item) => void }) {
  const needs = needsYou(items)
  const latest = (p: Linked) => statsOf(p.title, items).mine.reduce((d, i) => (i.day > d ? i.day : d), '')
  const projects = PROJECTS.filter((p) => !filter || p.title === filter).sort((a, b) => latest(b).localeCompare(latest(a)))
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      {projects.map((p) => (
        <ProjectInFeed key={p.id} project={p} all={items} needs={needs.filter((r) => r.project === p.title)} onOpen={onOpen} />
      ))}
    </div>
  )
}

/** The Desk. `open` starts with an item in the side panel; `filter` with one project picked; `variant` the feed. */
export function DeskPage({ open: open0, filter: filter0 = '', variant = 'inbox' }: { open?: string; filter?: string; variant?: 'inbox' | 'feed' }) {
  const [items, setItems] = useState<Item[]>([...ITEMS, ...ELSEWHERE])
  const [filter, setFilter] = useState(filter0)
  const [later, setLater] = useState<string[]>([])
  const [decided, setDecided] = useState<{ title: string; chosen: string }>()
  const [open, setOpen] = useState<Item | undefined>(() => items.find((i) => i.id === open0))
  const inFilter = (project?: string) => !filter || project === filter
  const all = needsYou(items).filter((r) => inFilter(r.project))
  // The first question ready to decide is the card, unless you said Not now; the rest stay rows.
  const first = all.find((r): r is Extract<Row, { kind: 'item' }> => r.kind === 'item' && r.action === 'Decide' && !later.includes(r.item.id))
  const rows = all.filter((r) => r !== first)
  const fresh = items.filter((i) => i.isNew && i.status !== 'proposed' && inFilter(projectOf(i))).slice(0, 5)
  const onDecide = (item: Item, choice: number) => {
    setDecided({
      title: item.title,
      chosen: `${LETTERS[choice]} · ${item.options?.[choice]?.label ?? ''}`,
    })
    setItems((xs) => decide(xs, item.id, choice, ''))
  }
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader
          title={
            <span className="flex items-center gap-2 text-body-1 text-text-primary">
              <IconNote size={16} stroke={1.5} />
              Desk
            </span>
          }
          actions={
            <span className="w-56">
              <Select
                size="small"
                ariaLabel="Project"
                value={filter || 'all'}
                onChange={(v) => setFilter(v === 'all' ? '' : v)}
                options={[{ value: 'all', label: 'All projects' }, ...PROJECTS.map((p) => ({ value: p.title, label: p.title }))]}
              />
            </span>
          }
        />
        {variant === 'feed' ? (
          <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col px-6 pb-6 pt-2">
            <DeskFeed items={items} filter={filter} onOpen={setOpen} />
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex gap-6 px-6 pb-6 pt-2">
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <section aria-label="Needs you" className="flex flex-col gap-3">
                <SectionHeader title="Needs you" count={all.length} />
                {decided && (
                  <Card fill="inset" className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <MetaText tone="muted">
                      Decided {decided.chosen} on “{decided.title}”. It is in the Journal.
                    </MetaText>
                    <Button variant="muted" size="small" onClick={() => setDecided(undefined)}>
                      Undo
                    </Button>
                  </Card>
                )}
                {first && (
                  <DecisionCard
                    item={first.item}
                    project={first.project}
                    onDecide={(c) => onDecide(first.item, c)}
                    onLater={() => setLater((l) => [...l, first.item.id])}
                    onOpen={() => setOpen(first.item)}
                  />
                )}
                {rows.length > 0 ? (
                  <Card fill="none" clip>
                    <ul aria-label="Also waiting on you">
                      {rows.map((r) => (
                        <NeedRow key={r.kind === 'item' ? r.item.id : r.id} row={r} onOpen={setOpen} />
                      ))}
                    </ul>
                  </Card>
                ) : (
                  !first && <MetaText tone="muted">Nothing waits for you.</MetaText>
                )}
              </section>
              {fresh.length > 0 && (
                <section aria-label="New since your last visit" className="flex flex-col gap-2">
                  <SectionHeader title="New since your last visit" count={fresh.length} />
                  <ul className="flex flex-col">
                    {fresh.map((i) => (
                      <li key={i.id} className="relative flex items-center gap-3 rounded-md px-2 py-1.5">
                        <span className={`flex w-4 shrink-0 justify-center ${TYPE_META[i.type].text}`}>
                          {i.word === 'Question' || i.word === 'Blocker' ? wordIcon(i.word, 14) : TYPE_META[i.type].icon(14)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <Link href="#" variant="quiet" cover onClick={(e) => (stay(e), setOpen(i))}>
                            {i.title}
                          </Link>
                        </span>
                        <MetaText tone="muted">
                          {i.word} · {projectOf(i) ?? 'Estiva HQ'} · {i.at}
                        </MetaText>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            {/* The whole picture, by project; an open item takes this column, as on its project. */}
            {!open && (
              <section aria-label="Projects" className="flex w-[360px] shrink-0 flex-col gap-3">
                <SectionHeader title="Projects" count={PROJECTS.filter((p) => inFilter(p.title)).length} />
                {PROJECTS.filter((p) => inFilter(p.title)).map((p) => (
                  <ProjectPicture key={p.id} project={p} all={items} />
                ))}
              </section>
            )}
          </ScrollArea>
        )}
      </div>
      {open && <ItemPanel item={open} me={ME} onClose={() => setOpen(undefined)} onDecide={(c) => (onDecide(open, c), setOpen(undefined))} />}
    </div>
  )
}
