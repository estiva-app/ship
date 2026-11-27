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
import { useState } from 'react'
import { IconNote, IconSparkles, IconTerminal2 } from '@tabler/icons-react'
import { Button, Card, Link, LinkRow, MetaText, PageHeader, SectionHeader, Select, type Linked } from '@estiva-app/ui'
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
  { id: 'p1', kind: 'project', title: PROJECT, href: '#', subtitle: 'Estiva HQ', done: { done: 5, total: 8 } },
  { id: 'p2', kind: 'project', title: 'Insights, Journal and Risks', href: '#', subtitle: 'Estiva HQ', done: { done: 2, total: 6 } },
  { id: 'p3', kind: 'project', title: 'Activity indicator', href: '#', subtitle: 'Estiva HQ', done: { done: 7, total: 7 } },
]

/** One thing that waits on you: an item, or an AI session that stopped for you. */
type Row =
  | { kind: 'item'; item: Item; why: string; action: string; project: string }
  | { kind: 'session'; id: string; title: string; why: string; loop: boolean; project: string }

function needsYou(all: Item[]): Row[] {
  const live = all.filter((i) => !ENDED.includes(i.status) && i.status !== 'proposed')
  const rows: Row[] = []
  for (const i of live) {
    const project = projectOf(i) ?? 'Estiva HQ'
    if (i.word === 'Question' && i.step === 'decide' && i.decider?.key === ME) rows.push({ kind: 'item', item: i, why: 'Ready for you to decide', action: 'Decide', project })
    else if (i.word === 'Blocker' && i.waitingOn?.key === ME) rows.push({ kind: 'item', item: i, why: `Blocks the team · waiting on you ${waited(i.day)}`, action: 'Open', project })
    else if (i.word === 'Question' && i.step === 'options' && i.decider?.key === ME) rows.push({ kind: 'item', item: i, why: needs(i, ME), action: 'Review', project })
    else if (noSourceLeft(i)) rows.push({ kind: 'item', item: i, why: 'Its only source was deleted · the loop proposes Outdated', action: 'Open', project })
  }
  for (const s of SESSIONS.filter((x) => x.state === 'waiting'))
    rows.push({ kind: 'session', id: s.id, title: s.loop ? `${s.who}: ${s.result}` : s.on, why: s.loop ? `${s.on} · ${s.ago}` : `${s.result} · ${s.ago}`, loop: !!s.loop, project: PROJECT })
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
          link={{ state: 'ready', linked: { id: item.brief.title, kind: 'page', noun: 'Brief', title: item.brief.title, href: '#', subtitle: `${by?.name ?? 'Claude'} · ${item.brief.at}`, ...(by ? { authors: [{ name: by.name, bot: by.bot }] } : {}) } }}
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
function NeedRow({ row, onOpen }: { row: Row; onOpen: (i: Item) => void }) {
  const icon =
    row.kind === 'session' ? (
      row.loop ? <IconSparkles size={16} stroke={1.5} /> : <IconTerminal2 size={16} stroke={1.5} />
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
          <MetaText tone="muted">
            {row.why} · {row.project}
          </MetaText>
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

/** One project on the right: its row, then a line each for its Insights, Journal, Risks and AI sessions. */
function ProjectPicture({ project, all }: { project: Linked; all: Item[] }) {
  const mine = all.filter((i) => (projectOf(i) ?? '') === project.title && i.status !== 'rejected')
  const ofType = (t: Item['type']) => mine.filter((i) => i.type === t)
  const fresh = (t: Item['type']) => ofType(t).filter((i) => i.isNew).length
  const insights = ofType('insight')
  const journal = ofType('journal').filter((i) => i.status !== 'proposed')
  const risks = ofType('risk').filter((i) => !ENDED.includes(i.status) && i.status !== 'proposed')
  const blockers = risks.filter((i) => i.word === 'Blocker').length
  const sessions = project.title === PROJECT ? SESSIONS : []
  const working = sessions.filter((s) => s.state === 'working').length
  const waiting = sessions.filter((s) => s.state === 'waiting').length
  const lines = [
    { icon: TYPE_META.insight.icon(14), label: 'Insights', text: insights.length ? `${insights.length}${fresh('insight') ? ` · ${fresh('insight')} new` : ''}` : 'None yet' },
    { icon: TYPE_META.journal.icon(14), label: 'Journal', text: journal[0] ? `${journal[0].title} · ${journal[0].at}` : 'Nothing written yet' },
    { icon: TYPE_META.risk.icon(14), label: 'Risks', text: risks.length ? `${risks.length} open${blockers ? ` · ${blockers} blocker` : ''}` : 'Nothing open' },
    { icon: <IconSparkles size={14} stroke={1.5} />, label: 'AI sessions', text: sessions.length ? [working && `${working} working`, waiting && `${waiting} wait on you`].filter(Boolean).join(' · ') || 'None running' : 'None running' },
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

/** The Desk. `open` starts with an item in the side panel; `filter` with one project picked. */
export function DeskPage({ open: open0, filter: filter0 = '' }: { open?: string; filter?: string }) {
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
    setDecided({ title: item.title, chosen: `${LETTERS[choice]} · ${item.options?.[choice]?.label ?? ''}` })
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
              <Select size="small" ariaLabel="Project" value={filter || 'all'} onChange={(v) => setFilter(v === 'all' ? '' : v)} options={[{ value: 'all', label: 'All projects' }, ...PROJECTS.map((p) => ({ value: p.title, label: p.title }))]} />
            </span>
          }
        />
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
              {first && <DecisionCard item={first.item} project={first.project} onDecide={(c) => onDecide(first.item, c)} onLater={() => setLater((l) => [...l, first.item.id])} onOpen={() => setOpen(first.item)} />}
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
                      <span className={`flex w-4 shrink-0 justify-center ${TYPE_META[i.type].text}`}>{i.word === 'Question' || i.word === 'Blocker' ? wordIcon(i.word, 14) : TYPE_META[i.type].icon(14)}</span>
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
      </div>
      {open && <ItemPanel item={open} me={ME} onClose={() => setOpen(undefined)} onDecide={(c) => (onDecide(open, c), setOpen(undefined))} />}
    </div>
  )
}
