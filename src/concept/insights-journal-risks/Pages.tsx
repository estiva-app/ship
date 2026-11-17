/**
 * CONCEPT — Ship's pages for Insights, Journal and Risks, drawn on today's frame (PageHeader, Breadcrumb, the kit's
 * Tabs under it, ScrollArea, Centred, LiveHeader, the 384px column beside the page), changing only what this adds:
 * - the project's tabs Overview · Issues · Insights · Journal · Risks (Miky's sketch, 16 Nov); Overview gets What's new;
 * - the issue page lists the items about it (record: every app that opens a file shows its items);
 * - an item's own page, shaped like an issue's;
 * - the team page (today's Projects page for one team) gets the team's own lists.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { IconBox, IconCircleDot, IconPlus, IconUsers } from '@tabler/icons-react'
import { serializeBlockDocument } from '@estiva-app/protocol'
import { Button, Card, EmptyState, IconButton, Link, LinkPickers, MetaText, NoAccessNotice, PageHeader, SectionHeader, Select, SkeletonList, Tabs } from '@estiva-app/ui'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Centred } from '@/components/layout/ReadingColumn'
import { LiveHeader } from '@/components/editing/LiveHeader'
import { ConceptBlockRows } from '@/components/editing/blockRows'
import { IssuesTable } from '@/components/IssuesTable'
import { OverviewPanel } from '@/components/OverviewPanel'
import { PageActions } from '@/components/PageActions'
import { ProjectFields } from '@/components/PageFields'
import { useSideColumn } from '@/pages/sideColumn'
import { ISSUES, ISSUE_STATUSES, hrefFor, ACTIVITY_ITEMS } from '@/fixtures/issues'
import { ACTIVITY, PEOPLE as SHIP_PEOPLE, PROJECT_STATUSES } from '@/fixtures/projects'
import { MarkAsRows, MarkedNotice, STATUSES, TYPE_META, wordIcon, TYPE_OF, blockLineCss, markedBlockAt, type ItemType, type MarkWord, type Status } from './MarkAs'
import { ENDED, FilterRow, ItemTimeline, ListStateView, filterItems, type ListState } from './ItemParts'
import { ItemFields, ItemPanel, commentsOn } from './ItemPanel'
import { ItemContent } from './ItemDetail'
import { InsightGrid, RiskDashboard } from './ShipLists'
import { BuildPlan } from './BuildPlan'
import { SeverityMark, waited } from './ItemKinds'
import { CommentsColumn, type StoryComment } from './CommentsColumn'
import { HAND_TYPED, ITEMS, KATERINA, MIKY, PEOPLE, PROJECT, TEAM, byType, decide, type Item } from './fixtures'

const noop = () => {}
export type ConceptTab = 'overview' | 'issues' | 'insights' | 'journal' | 'risks'
const TAB_TYPE: Record<string, ItemType | undefined> = { insights: 'insight', journal: 'journal', risks: 'risk' }

/** A description as blocks with ids, so a block's menu can mark it and a story can draw its line by id. */
export const blocksDoc = (...paragraphs: [string, string][]) =>
  serializeBlockDocument({ type: 'doc', content: paragraphs.map(([id, words]) => ({ type: 'paragraph', id, content: [{ type: 'text', text: words }] })) })

const PROJECT_DOC = blocksDoc(
  ['p1', 'Ship and Leaf get the same sidebar as Peek: Teams and Topics at the top, Folders gone from the navigation.'],
  ['p2', 'A file opened from anywhere shows where it belongs: its team and topic are selected on the left.'],
  ['p3', 'Who leads a topic and who can read it stays what the team says; nothing about access changes in this project.'],
  ['p4', 'Katerina judges the look on the prototype; the build issues follow from the approved stories.'],
)

/** The block menu's Mark as…, through the concept hook in blockRows; marks at once and says so. */
function MarkableBlocks({ children, team, about, marked: m0 = {}, changed = [], onOpenBlock }: { children: ReactNode; team: string; about?: string; marked?: Record<string, ItemType>; changed?: string[]; onOpenBlock?: (blockId: string) => void }) {
  const [marked, setMarked] = useState(m0)
  const [notice, setNotice] = useState<MarkWord>()
  const rows = (id: string) => (
    <MarkAsRows
      mark={marked[id] ? { type: marked[id], word: TYPE_META[marked[id]].label as MarkWord, title: '', href: '#', status: 'accepted' } : undefined}
      onMark={(word) => (setMarked((m) => ({ ...m, [id]: TYPE_OF[word] })), setNotice(word))}
      onUnmark={() => setMarked((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)))}
    />
  )
  return (
    <ConceptBlockRows.Provider value={rows}>
      <style>{blockLineCss(marked, changed)}</style>
      {/* @estiva-escape(no-raw-interactive): concept only — the margin label is CSS on the editor's own block, so its click is read here. */}
      <div onClickCapture={(e) => { const id = markedBlockAt(e, marked); if (id) onOpenBlock?.(id) }}>{children}</div>
      {notice && <MarkedNotice word={notice} team={team} about={about} onClose={() => setNotice(undefined)} />}
    </ConceptBlockRows.Provider>
  )
}

/**
 * Overview, levelled up (Miky, 16 Nov): it leads with what needs you, the blocker waiting on you, the question ready
 * for you to decide, what waits for you to accept, each one click from acting. Then one quiet line of what is new
 * since your last visit. What "new" counts is still Miky's call.
 */
function NeedsYou({ all, me, onTab, onOpen, onDecide }: { all: Item[]; me: string; onTab: (t: ConceptTab) => void; onOpen: (i: Item) => void; onDecide: (i: Item) => void }) {
  const live = all.filter((i) => !ENDED.includes(i.status))
  const blocking = live.filter((i) => i.word === 'Blocker' && i.status !== 'proposed' && i.waitingOn?.key === me)
  const deciding = live.filter((i) => i.word === 'Question' && i.status !== 'proposed' && i.step === 'decide' && i.decider?.key === me)
  const toAccept = live.filter((i) => i.status === 'proposed' && (!i.decidedBy || i.decidedBy.key === me))
  const fresh = all.filter((i) => i.isNew)
  const count = (t: ItemType) => fresh.filter((i) => i.type === t).length
  const tabOf = (t: ItemType): ConceptTab => (t === 'insight' ? 'insights' : t === 'journal' ? 'journal' : 'risks')
  const rows: { item: Item; why: string; action?: string }[] = [
    ...blocking.map((item) => ({ item, why: `Blocks the team · waiting on you ${waited(item.day)}`, action: 'Open' })),
    ...deciding.map((item) => ({ item, why: 'Ready for you to decide', action: 'Decide' })),
  ]
  const byType = (['insight', 'journal', 'risk'] as ItemType[]).map((t) => ({ t, n: toAccept.filter((i) => i.type === t).length })).filter((x) => x.n)
  return (
    <section aria-label="Needs you" className="flex flex-col gap-3">
      <SectionHeader title="Needs you" count={rows.length + toAccept.length} />
      {rows.length + toAccept.length === 0 ? (
        <MetaText tone="muted">Nothing waits for you.</MetaText>
      ) : (
        <Card fill="none" clip attention={blocking.length ? 'warning' : undefined}>
          <ul aria-label="Needs you">
            {rows.map(({ item, why, action }) => (
              <li key={item.id} className="relative flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
                <span className={item.word === 'Blocker' ? 'flex text-error-default' : 'flex'}>{item.word === 'Blocker' ? wordIcon('Blocker', 16) : <SeverityMark severity={item.severity} />}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href="#" variant="quiet" truncate cover onClick={(e) => (e.preventDefault(), onOpen(item))}>
                    {item.title}
                  </Link>
                  <MetaText tone="muted">{why}</MetaText>
                </span>
                <span className="relative shrink-0">
                  <Button variant={action === 'Decide' ? 'primary' : 'outlined'} size="small" onClick={() => (action === 'Decide' ? onDecide(item) : onOpen(item))}>
                    {action}
                  </Button>
                </span>
              </li>
            ))}
            {byType.map(({ t, n }) => (
              <li key={t} className="relative flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
                <span className={`flex ${TYPE_META[t].text}`}>{TYPE_META[t].icon(16)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href="#" variant="quiet" cover onClick={(e) => (e.preventDefault(), onTab(tabOf(t)))}>
                    {t === 'insight' ? `${n} newly suggested ${n === 1 ? 'insight' : 'insights'}` : `${n} ${t === 'journal' ? (n === 1 ? 'Journal entry' : 'Journal entries') : n === 1 ? 'risk' : 'risks'} to accept`}
                  </Link>
                  <span className="min-w-0 truncate">
                    <MetaText tone="muted">{toAccept.filter((i) => i.type === t).map((i) => i.title).join(' · ')}</MetaText>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <MetaText tone="muted">New since your last visit:</MetaText>
        {(['insight', 'journal', 'risk'] as ItemType[]).map((t) =>
          count(t) ? (
            <Link key={t} href="#" variant="quiet" onClick={(e) => (e.preventDefault(), onTab(tabOf(t)))}>
              {count(t)} in {TYPE_META[t].tab}
            </Link>
          ) : null,
        )}
        <span className="flex items-center gap-1">
          <IconCircleDot size={14} stroke={1.5} className="text-text-secondary" />
          <MetaText tone="muted">3 issues changed</MetaText>
        </span>
      </span>
    </section>
  )
}

/**
 * Insights, Journal or Risks: the filter row, then each list's own view (Miky, 16 Nov): Insights a grid of boxes,
 * Journal the timeline in the reading column, Risks a table as wide as Issues'.
 */
function ItemsTab({ type, all = ITEMS, state, onOpen, openId, me, onDecide, deciding }: { type: ItemType; all?: Item[]; state: ListState; onOpen: (i: Item) => void; openId?: string; me?: string; onDecide?: (item: Item, choice: number, why: string) => void; deciding?: string }) {
  const items = all.filter((i) => i.type === type)
  const [filter, setFilter] = useState('all')
  const shown = filterItems(items, filter)
  return (
    <div className={`flex w-full flex-col gap-3 ${type === 'journal' ? 'mx-auto max-w-[768px]' : ''}`}>
      <ListStateView state={state} type={type}>
        {/* Risks are a dashboard of three sections, so no filter row (Miky, 16 Nov). */}
        {/* A subtle + to add an item by hand, beside the filters (Miky, 16 Nov). */}
        {type !== 'risk' && (
          <div className="flex items-center justify-between gap-3">
            <FilterRow type={type} value={filter} onChange={setFilter} items={items} />
            <IconButton variant="muted" tooltip={type === 'insight' ? 'Add an insight' : 'Add to the Journal'} aria-label={type === 'insight' ? 'Add an insight' : 'Add to the Journal'} onClick={noop}>
              <IconPlus size={16} stroke={1.5} />
            </IconButton>
          </div>
        )}
        {type === 'insight' && <InsightGrid items={shown} onOpen={onOpen} openId={openId} me={me} />}
        {type === 'journal' && <ItemTimeline items={shown} onOpen={onOpen} openId={openId} me={me} label="Journal" />}
        {type === 'risk' && <RiskDashboard items={[...items, HAND_TYPED]} onOpen={onOpen} openId={openId} me={me} onDecide={onDecide} deciding={deciding} />}
      </ListStateView>
    </div>
  )
}

/** The project page: today's header and tab row, three more tabs; an item opens beside its list. */
export function ProjectPage({ start = 'overview', listState = 'ready', me = 'miky', open: open0, side: side0 = 'none', decided, deciding }: { start?: ConceptTab; listState?: ListState; me?: string; open?: string; side?: 'comments' | 'overview' | 'none'; decided?: string; deciding?: string }) {
  const [tab, setTab] = useState<ConceptTab>(start)
  // Decide changes the lists in place: the question resolves, its Decision joins the Journal (Miky, 16 Nov).
  const [all, setAll] = useState<Item[]>(() => (decided ? decide(ITEMS, decided, Math.max(0, ITEMS.find((i) => i.id === decided)?.options?.findIndex((o) => o.lean) ?? 0)) : ITEMS))
  const [open, setOpen] = useState<Item | undefined>(all.find((i) => i.id === open0))
  const [decidingId, setDecidingId] = useState(deciding)
  const onDecide = (q: Item, choice: number, why: string) => {
    const next = decide(all, q.id, choice, why)
    setAll(next)
    setOpen((o) => (o ? next.find((i) => i.id === o.id) : o))
  }
  const onOpenItem = (i: Item) => setOpen((o) => (o?.id === i.id ? undefined : i))
  const side = useSideColumn(side0)
  const counts = useMemo(() => ({ insight: all.filter((i) => i.type === 'insight' && i.isNew).length, journal: all.filter((i) => i.type === 'journal' && i.isNew).length, risk: all.filter((i) => i.type === 'risk' && i.isNew).length }), [all])
  const tabs: { id: ConceptTab; label: string; count?: number; unread?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'issues', label: 'Issues' },
    { id: 'insights', label: 'Insights', unread: counts.insight > 0 },
    { id: 'journal', label: 'Journal', unread: counts.journal > 0 },
    { id: 'risks', label: TYPE_META.risk.tab, unread: counts.risk > 0 },
  ]
  const [status, setStatus] = useState('in_progress')
  const [lead, setLead] = useState('ravi')
  return (
    <div data-surface="project" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <PageHeader
          title={<Breadcrumb items={[{ label: 'Projects', href: '#/projects' }, { label: PROJECT, icon: <IconBox size={16} stroke={1.5} /> }]} />}
          actions={<PageActions what="project" comments={side.comments} overview={side.overview} archive="none" onArchive={noop} onDelete={noop} onCopyLink={noop} />}
        />
        <div className="flex min-h-8 items-center gap-3 px-6">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
          {tab === 'overview' && (
            <Centred>
              <NeedsYou all={all} me={me} onTab={setTab} onOpen={(i) => setOpen(i)} onDecide={(i) => (setDecidingId(i.id), setOpen(i))} />
              <MarkableBlocks team={TEAM} about={PROJECT} marked={{ p2: 'insight' }} changed={['p3']} onOpenBlock={() => setOpen(ITEMS.find((i) => i.id === 'i1'))}>
                <LiveHeader
                  fields={<ProjectFields status={status} statuses={PROJECT_STATUSES} onStatusChange={setStatus} lead={lead} people={SHIP_PEOPLE} onLeadChange={setLead} done={3} total={8} />}
                  title={PROJECT}
                  titlePlaceholder="Untitled project"
                  onRename={() => true}
                  summary="Ship and Leaf get Peek's Teams and Topics sidebar."
                  description={PROJECT_DOC}
                  format="blocks"
                  onDescribe={() => true}
                  onCommentOnBlock={noop}
                />
              </MarkableBlocks>
            </Centred>
          )}
          {tab === 'issues' && (
            // Issues as the plan of the build (Miky, 17 Nov): Triage, the milestones, then Later and Not doing.
            <BuildPlan />
          )}
          {tab === 'insights' && <ItemsTab type="insight" all={all} state={listState} onOpen={onOpenItem} openId={open?.id} me={me} />}
          {tab === 'journal' && <ItemsTab type="journal" all={all} state={listState} onOpen={onOpenItem} openId={open?.id} me={me} />}
          {tab === 'risks' && <ItemsTab type="risk" all={all} state={listState} onOpen={onOpenItem} openId={open?.id} me={me} onDecide={onDecide} deciding={deciding} />}
        </ScrollArea>
      </div>
      {open && (tab === 'overview' || open.type === TAB_TYPE[tab]) && <ItemPanel item={open} me={me} onClose={() => (setOpen(undefined), setDecidingId(undefined))} deciding={open.id === decidingId} onDecide={(c, why) => onDecide(open, c, why)} />}
      {side.overview.shown && (
        <div className="flex shrink-0 flex-col border-l border-border-default">
          <OverviewPanel activity={ACTIVITY_ITEMS} history={ACTIVITY} />
        </div>
      )}
      {side.comments.shown && (
        <div className="flex shrink-0 flex-col border-l border-border-default">
          <CommentsColumn team={TEAM} about={PROJECT} comments={PROJECT_COMMENTS} />
        </div>
      )}
    </div>
  )
}

const PROJECT_COMMENTS: StoryComment[] = [
  { id: 'c1', author: MIKY, time: '2h', text: 'What is new in Ship and Leaf needs more thinking before we build it.', mark: { type: 'risk', word: 'Concern', title: 'Ship and Leaf “what is new” needs more thinking', href: '#', status: 'open' } },
  { id: 'c2', author: KATERINA, time: '1h', text: 'I can draw the sidebar first and we look at what is new after.' },
]

/** The issue page: today's header and description, the items about it under the description, its comments beside it. */
export function IssuePage({ itemsState = 'ready', commentMark = true }: { itemsState?: ListState; commentMark?: boolean }) {
  const issueTitle = 'Ship and Leaf sidebar match Peek'
  const about = ITEMS.filter((i) => i.about?.kind === 'issue' && i.about.title === issueTitle)
  const comments: StoryComment[] = [
    {
      id: 'k1',
      author: KATERINA,
      time: '3h',
      text: 'Let’s go with Teams and Topics at the top and drop Folders from the sidebar completely.',
      ...(commentMark ? { mark: { type: 'journal' as const, word: 'Decision' as const, title: 'The sidebar shows Teams and Topics, never Folders', href: '#', status: 'proposed' as Status } } : {}),
    },
    { id: 'k2', author: MIKY, time: '2h', text: 'Agreed. And a file opened from anywhere should select its team on the left.' },
    { id: 'k3', author: KATERINA, time: '1h', text: 'I’ll draw both states, selected and not.' },
  ]
  return (
    <div data-surface="issue" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <PageHeader
          title={<Breadcrumb items={[{ label: 'Issues', href: '#/issues' }, { label: PROJECT, href: '#/project/p' }, { label: 'TEA-12' }]} />}
          actions={<PageActions what="issue" archive="none" onArchive={noop} onDelete={noop} onCopyLink={noop} />}
        />
        <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
          <Centred>
            <MarkableBlocks team={TEAM} about={issueTitle}>
              <LiveHeader
                title={issueTitle}
                titlePlaceholder="Untitled issue"
                onRename={() => true}
                summary="The same Teams and Topics sidebar in all three apps."
                description={blocksDoc(['d1', 'Ship and Leaf draw Peek’s sidebar: Teams, then Topics, no Folders.'], ['d2', 'An open file selects its team and topic on the left.'])}
                format="blocks"
                onDescribe={() => true}
                onCommentOnBlock={noop}
              />
            </MarkableBlocks>
            {/* The items about this issue: every app that opens a file shows its items (record #450). */}
            <section className="flex flex-col gap-2" aria-label="Insights, Journal and Risks">
              <SectionHeader title="Insights, Journal and Risks" count={about.length} />
              {itemsState === 'loading' ? (
                <SkeletonList rows={2} />
              ) : itemsState === 'error' ? (
                <EmptyState scope="section" message="Couldn’t load what was marked here. Try again." />
              ) : !about.length || itemsState === 'empty' ? (
                <EmptyState scope="section" message="Nothing marked about this issue yet." />
              ) : (
                <ItemTimeline items={about} label="Insights, Journal and Risks" />

              )}
            </section>
          </Centred>
        </ScrollArea>
      </div>
      <div className="flex shrink-0 flex-col border-l border-border-default">
        <CommentsColumn team={TEAM} about={issueTitle} comments={comments} />
      </div>
    </div>
  )
}

/** An item's own page, shaped like an issue's: title, summary, its fields, its source as marked, details, comments. */
export function ItemPage({ item, me = 'miky', state = 'ready' }: { item: Item; me?: string; state?: 'ready' | 'loading' | 'error' | 'no-access' }) {
  const crumbs = [
    { label: 'Projects', href: '#/projects' },
    { label: PROJECT, href: '#/project/p' },
    { label: TYPE_META[item.type].tab, icon: <span className={TYPE_META[item.type].text}>{TYPE_META[item.type].icon(16)}</span> },
  ]
  const header = <PageHeader title={<Breadcrumb items={crumbs} />} actions={<PageActions what="issue" archive="none" onArchive={noop} onDelete={noop} onCopyLink={noop} />} />
  if (state !== 'ready')
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {header}
        <div className="px-6">
          {state === 'loading' ? <SkeletonList rows={5} /> : state === 'error' ? <EmptyState scope="page" message="Couldn’t load this item. Try again." /> : <NoAccessNotice what={TYPE_META[item.type].label.toLowerCase()} />}
        </div>
      </div>
    )
  const fields = (
    <div className="flex flex-col gap-3">
      <ItemFields item={item} me={me} />
      <ItemContent item={item} me={me} words={false} />
    </div>
  )
  const comments = commentsOn(item)
  return (
    <div data-surface="item" className="flex min-h-0 flex-1 [contain:size]">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {header}
        <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
          <Centred>
            <LiveHeader
              fields={fields}
              title={item.title}
              titlePlaceholder={`Untitled ${TYPE_META[item.type].label.toLowerCase()}`}
              onRename={() => true}
              summary={item.summary}
              description={item.details ?? ''}
              format="marker"
              onDescribe={() => true}
            />
          </Centred>
        </ScrollArea>
      </div>
      <div className="flex shrink-0 flex-col border-l border-border-default">
        <CommentsColumn team={TEAM} about={item.title} comments={comments} />
      </div>
    </div>
  )
}

/** The team page — today's Projects page for one team — with the team's own lists beside Projects. */
export function TeamPage({ start = 'insights' }: { start?: 'projects' | ConceptTab }) {
  const [tab, setTab] = useState<string>(start)
  const [open, setOpen] = useState<Item>()
  const onOpen = (i: Item) => setOpen((o) => (o?.id === i.id ? undefined : i))
  return (
    <div className="flex min-h-0 flex-1 [contain:size]">
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <PageHeader title={<Breadcrumb items={[{ label: 'Teams', href: '#/teams' }, { label: TEAM, icon: <IconUsers size={16} stroke={1.5} /> }]} />} />
      <div className="flex min-h-8 items-center gap-3 px-6">
        <Tabs
          tabs={[
            { id: 'projects', label: 'Projects', count: 6 },
            { id: 'insights', label: 'Insights', count: byType('insight').length },
            { id: 'journal', label: 'Journal', count: byType('journal').length },
            { id: 'risks', label: TYPE_META.risk.tab, count: byType('risk').length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
        {tab === 'projects' && <EmptyState scope="section" message="Today's Projects list for this team, unchanged." />}
        {tab === 'insights' && <ItemsTab type="insight" state="ready" onOpen={onOpen} openId={open?.id} />}
        {tab === 'journal' && <ItemsTab type="journal" state="ready" onOpen={onOpen} openId={open?.id} />}
        {tab === 'risks' && <ItemsTab type="risk" state="ready" onOpen={onOpen} openId={open?.id} />}
        {tab !== 'projects' && <MetaText tone="muted">Everything the team marked, from every project, and the items about no project.</MetaText>}
      </ScrollArea>
    </div>
    {open && open.type === TAB_TYPE[tab] && <ItemPanel item={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}
