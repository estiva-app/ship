/**
 * CONCEPT — a project's Issues as the plan of its build (Miky, 17 Nov): sequencing is milestones.
 * - Triage first, as boxes in a grid, so what is new and unplaced never looks like the settled plan: each one goes into
 *   a milestone (needed for quality), to Later or another project, or to Not doing.
 * - Then one table per milestone, two lines a row; the milestone being built now is raised a little and tells more.
 *   A Claude Code session shows in its issue's row, one click away; an issue with none has Start session.
 * - Last, Later and Not doing, two tabs of one box.
 * Real data: the project "Topics: level up the topic experience" as it stood on 9 Nov, its milestones, issues and
 * Later lines (raised by its /land and kickoff runs) and its Not in scope list. The two sessions are imagined.
 */
import { useState, type ReactNode } from 'react'
import { IconCircleCheck, IconGitMerge, IconGitPullRequest, IconGitPullRequestDraft, IconPlus, IconSparkles, IconTerminal2 } from '@tabler/icons-react'
import { Button, Card, Link, MetaText, Person, SectionHeader, Select, Tabs, WithTooltip } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { NewDot } from './ItemParts'

type IssueStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
const STATUS: Record<IssueStatus, string> = { todo: 'Todo', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled' }
type Session = { stage: string; last: string; when: string; waitsOnYou?: boolean }
type PrStage = 'Draft' | 'Open' | 'Merged'
type PlanIssue = { ref: string; title: string; summary: string; status: IssueStatus; who: string; session?: Session; pr?: { name: string; stage: PrStage } }
type Milestone = { n: number; title: string; issues: PlanIssue[] }

const MILESTONES: Milestone[] = [
  { n: 1, title: 'The prototype shows the new sidebars, Explore, the menus and a topic’s arranged files', issues: [{ ref: 'TOPI-1', title: 'Topics level-up, prototyped', summary: 'Every changed Topics screen approved as a prototype; the build issues written from it.', status: 'done', who: 'Miky', pr: { name: 'ship#598', stage: 'Merged' } }] },
  {
    n: 2,
    title: 'Your topics come in the order things happen, in every app',
    issues: [
      { ref: 'TOPI-10', title: 'Peek lists your topics flat, newest activity first, with archived files in Overview', summary: 'One flat list of every topic you are in, re-sorted live.', status: 'done', who: 'Miky', pr: { name: 'peek#635', stage: 'Merged' } },
      {
        ref: 'TOPI-9',
        title: 'Ship’s sidebar shows your five newest topics, folded, then Explore topics',
        summary: 'The same order as Peek; each topic folds open to its files.',
        status: 'in_progress',
        who: 'Miky',
        session: { stage: 'Waiting on you', last: 'Asked: does a topic fold open to its projects only, or to its projects and their issues?', when: '20 min ago', waitsOnYou: true },
        pr: { name: 'ship#604', stage: 'Draft' },
      },
      {
        ref: 'TOPI-4',
        title: 'Leaf’s five topics follow the same order, and Explore topics opens Leaf’s page of every topic',
        summary: 'Leaf’s sidebar reads the same order as Peek and Ship.',
        status: 'in_progress',
        who: 'Miky',
        session: { stage: 'In review', last: 'The three reviewers are running on the PR', when: '4 min ago' },
        pr: { name: 'leaf#52', stage: 'Open' },
      },
    ],
  },
  { n: 3, title: 'A topic’s files keep the order and look someone gave them', issues: [{ ref: 'TOPI-5', title: 'A topic’s files keep one order and look for everyone', summary: 'Drag a file into place in Peek and show it as a row or a card; Ship and Leaf list them in that order.', status: 'todo', who: 'Miky' }] },
  {
    n: 4,
    title: 'You find any topic from Explore, and Peek’s menu has only what you need',
    issues: [
      { ref: 'TOPI-6', title: 'Explore topics in Peek finds any topic, archived ones too', summary: 'In place of Other topics and Archived.', status: 'todo', who: 'Miky' },
      { ref: 'TOPI-7', title: 'Peek’s topic menu keeps what you do from a list; Add to Open work gets a button and a shortcut', summary: 'Rename, Move, Archive and Delete move to the topic’s page.', status: 'todo', who: 'Miky' },
    ],
  },
]
const NOW = 2

// Issues' table look, as IssuesTable keeps it (ShipLists copies it for Risks the same way).
// @estiva-escape(no-copied-look): the concept copies IssuesTable's header cell so the tables match; the build shares one table part
const TH = 'h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary'

const PR_ICON: Record<PrStage, ReactNode> = {
  Draft: <IconGitPullRequestDraft size={14} stroke={1.5} className="shrink-0 text-text-muted" />,
  Open: <IconGitPullRequest size={14} stroke={1.5} className="shrink-0 text-success-default" />,
  Merged: <IconGitMerge size={14} stroke={1.5} className="shrink-0 text-accent-primary" />,
}

/** Start or open the issue's Claude Code session: Open session leads when it waits on you. */
function SessionCell({ issue }: { issue: PlanIssue }) {
  if (issue.status === 'done') return <MetaText tone="muted">Ended</MetaText>
  const s = issue.session
  return (
    <span className="flex flex-col items-start gap-1">
      {s && <span className={cn('text-caption', s.waitsOnYou ? 'font-medium text-warning-default' : 'text-text-secondary')}>{s.stage}</span>}
      <Button variant={s?.waitsOnYou ? 'primary' : s ? 'outlined' : 'muted'} size="small" leadingIcon={<IconTerminal2 size={14} stroke={1.5} />} onClick={() => undefined}>
        {s ? 'Open session' : 'Start session'}
      </Button>
    </span>
  )
}

/** One issue, two lines: the title, and under it what its session did last, or its summary. */
function PlanRow({ issue, now }: { issue: PlanIssue; now: boolean }) {
  const s = issue.session
  return (
    <tr className={cn('relative border-b border-border-subtle last:border-b-0 hover:bg-bg-hover', issue.status === 'done' && 'text-text-muted')}>
      <td className="px-3 align-top text-body-2 font-mono whitespace-nowrap text-text-muted">
        <span className={cn('block', now ? 'py-3' : 'py-2')}>{issue.ref}</span>
      </td>
      <td className={cn('px-3 align-top text-body-2', now ? 'py-3' : 'py-2')}>
        <span className="flex font-medium">
          <Link href="#" variant="quiet" truncate cover onClick={(e) => e.preventDefault()}>
            {issue.title}
          </Link>
        </span>
        {s ? (
          // The milestone being built now gives a session's last words in full: a question asked of you reads whole.
          <span className={cn('block text-text-secondary', !now && 'truncate')}>
            Claude, for {issue.who} · {s.last} · {s.when}
          </span>
        ) : (
          <span className="block truncate text-text-secondary">{issue.summary}</span>
        )}
      </td>
      <td className="px-3 align-top text-body-2">
        <span className={cn('flex flex-col gap-0.5', now ? 'py-3' : 'py-2')}>
          <StatusLabel value={issue.status} label={STATUS[issue.status]} />
          {/* Its pull request under the status (Miky, 17 Nov): the icon alone says Draft, Open or Merged; hover names it. */}
          {issue.pr && (
            <span className="relative flex items-center gap-1 whitespace-nowrap text-caption text-text-secondary">
              <WithTooltip label={issue.pr.stage}>
                <span role="img" aria-label={issue.pr.stage} className="flex">
                  {PR_ICON[issue.pr.stage]}
                </span>
              </WithTooltip>
              <Link href="#" variant="quiet" onClick={(e) => e.preventDefault()}>
                {issue.pr.name}
              </Link>
            </span>
          )}
        </span>
      </td>
      <td className="px-3 align-top text-body-2 text-text-secondary">
        <span className={cn('block', now ? 'py-3' : 'py-2')}>
          <Person name={issue.who} size={16} />
        </span>
      </td>
      <td className={cn('relative px-3 align-top', now ? 'py-3' : 'py-2')}>
        <SessionCell issue={issue} />
      </td>
    </tr>
  )
}

/** A milestone: its number and title over its issues; the one being built now raised a little, with more room. */
function MilestoneTable({ m }: { m: Milestone }) {
  const now = m.n === NOW
  const done = m.issues.filter((i) => i.status === 'done').length
  const finished = done === m.issues.length
  // A finished milestone folds closed under its header; it opens like any section.
  const [open, setOpen] = useState(!finished)
  return (
    <section className="flex flex-col gap-2" aria-label={`Milestone ${m.n}`}>
      {/* Every milestone heads its table with the same section header as To triage and Later, one level for all (Miky, 17 Nov: the rhythm). */}
      <SectionHeader
        title={`${m.n}. ${m.title}`}
        icon={finished ? <IconCircleCheck size={16} stroke={1.5} className="text-success-default" /> : undefined}
        chevron={finished}
        isExpanded={open}
        onToggle={() => setOpen((o) => !o)}
        trailing={
          <span className="flex items-center gap-2">
            {now && <span className="text-caption font-medium text-accent-primary">Now</span>}
            <MetaText tone="muted">{finished ? 'Done' : `${done} of ${m.issues.length} done`}</MetaText>
          </span>
        }
        actions={finished ? undefined : [{ icon: <IconPlus size={16} stroke={1.5} />, tooltip: 'New issue', onClick: () => undefined }]}
      />
      {open && (
      <Card clip fill={now ? 'surface' : 'none'} attention={now ? 'accent' : undefined}>
        <ScrollArea orientation="horizontal">
          <table className="w-full min-w-[840px] table-fixed border-collapse" aria-label={`Milestone ${m.n} issues`}>
            {now && (
              <thead>
                <tr className="border-b border-border-default">
                  <th className={cn(TH, 'w-24')}>Ref</th>
                  <th className={TH}>Title</th>
                  <th className={cn(TH, 'w-40')}>Status</th>
                  <th className={cn(TH, 'w-28')}>Lead</th>
                  <th className={cn(TH, 'w-40')}>Session</th>
                </tr>
              </thead>
            )}
            {/* The quieter tables keep the same columns without a header, so every milestone lines up under the first. */}
            {!now && (
              <colgroup>
                <col className="w-24" />
                <col />
                <col className="w-40" />
                <col className="w-28" />
                <col className="w-40" />
              </colgroup>
            )}
            <tbody>
              {m.issues.map((i) => (
                <PlanRow key={i.ref} issue={i} now={now} />
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </Card>
      )}
    </section>
  )
}

/** A line raised while building: real ones from this project's /land and kickoff runs (9–10 Nov). */
type Line = { id: string; title: string; from: string; at: string; isNew?: boolean; rec?: { to: string; why: string } }
const TRIAGE: Line[] = [
  { id: 't1', title: 'Join on Ship’s Explore topics says nothing when it works: the row loses Join and gains a member', from: 'TOPI-9’s review', at: 'Today', isNew: true, rec: { to: 'm2', why: 'Joining is in this milestone’s Done when, and a silent success reads as broken.' } },
  { id: 't2', title: 'A Members or Last active column on Ship’s Explore that did not load stays blank until you switch tabs', from: 'TOPI-9’s review', at: 'Today', isNew: true, rec: { to: 'later', why: 'Only when one read fails; the rest of the page works and nothing is lost.' } },
  { id: 't3', title: 'After Join on Leaf’s Explore topics, its Members count leaves you out until the next open', from: 'TOPI-4’s review', at: 'Today', isNew: true, rec: { to: 'm2', why: 'TOPI-4 is still in review: one line in its PR, before it merges.' } },
  { id: 't4', title: 'Peek’s Topics icon: back to Explore topics, or to your last topic?', from: 'TOPI-10’s kickoff', at: 'Yesterday', rec: { to: 'not', why: 'Peek’s navigation is reworked in the next stage; deciding it now would be undone.' } },
]
const LATER: Line[] = [
  { id: 'l1', title: 'In Ship’s and Leaf’s sidebars, a topic whose files are all archived folds open to an empty list', from: 'TOPI-1’s prototype', at: '8 Nov' },
  { id: 'l2', title: 'Ship reads its own read-state slot back once per publish, one small extra query', from: 'TOPI-10’s review', at: '9 Nov' },
  { id: 'l3', title: 'When Peek’s Topics column fails to load it offers no Explore topics row, where Ship’s sidebar does', from: 'TOPI-10’s review', at: '9 Nov' },
]
const NOT_DOING: Line[] = [
  { id: 'n1', title: 'Activity as a dot by the topic’s title, instead of the right-hand panel', from: 'the Activity stage of the Initiative', at: '3 Nov' },
  { id: 'n2', title: 'Choosing what a file’s widget shows, such as a project showing only To do and In progress', from: 'not this project', at: '3 Nov' },
  { id: 'n3', title: 'The order of topics inside a team’s section of Peek’s Teams screen', from: 'Teams and following', at: '3 Nov' },
]
const PUT_IN = [
  ...MILESTONES.filter((m) => m.issues.some((i) => i.status !== 'done')).map((m) => ({ value: `m${m.n}`, label: `${m.n}. ${m.title}${m.n === NOW ? ' (now)' : ''}` })),
  { value: 'later', label: 'Later' },
  { value: 'project', label: 'Another project…' },
  { value: 'not', label: 'Not doing' },
]

const said = (v: string) => (v === 'not' ? 'Not doing' : v === 'later' ? 'Later' : v === 'project' ? 'Another project' : `Milestone ${v.slice(1)}${Number(v.slice(1)) === NOW ? ' (now)' : ''}`)

/**
 * Triage: what came up while building and has no place yet, as boxes, not rows, so it never reads as the plan.
 * Each comes with Claude's recommendation and why (Miky, 17 Nov: triage is accepting or editing): into a milestone
 * (needed for the quality), Later or another project, or Not doing. Accept takes it; Edit picks another place.
 */
function Triage() {
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string>()
  const left = TRIAGE.filter((l) => !placed[l.id])
  const place = (id: string, v: string) => (setPlaced((p) => ({ ...p, [id]: v })), setEditing(undefined))
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="To triage" count={left.length} actions={[{ icon: <IconPlus size={16} stroke={1.5} />, tooltip: 'Raise something', onClick: () => undefined }]} showActions="always" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-label="To triage">
        {left.map((l) => (
          <Card key={l.id} fill="surface" hover="hairline" className="flex flex-col justify-between gap-3 p-4">
            <span className="flex flex-col gap-1">
              <span className="text-body-2 font-medium text-text-primary">
                {l.title}
                <NewDot on={l.isNew} />
              </span>
              <MetaText tone="muted">
                From {l.from} · {l.at}
              </MetaText>
            </span>
            {l.rec && (
              // The recommendation reads under the line it is about, never louder than it.
              <span className="flex gap-1.5 border-t border-border-subtle pt-3 text-body-2 text-text-secondary">
                <IconSparkles size={14} stroke={1.5} className="mt-0.5 shrink-0 text-accent-primary" />
                <span>
                  <span className="text-text-primary">{said(l.rec.to)}</span>: {l.rec.why}
                </span>
              </span>
            )}
            {editing === l.id ? (
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <Select size="small" ariaLabel="Put in" placeholder="Put in…" value="" onChange={(v) => place(l.id, v)} options={PUT_IN} />
                </span>
                <Button variant="muted" size="small" onClick={() => setEditing(undefined)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Button variant="primary" size="small" onClick={() => place(l.id, l.rec?.to ?? 'later')}>
                  Accept
                </Button>
                <Button variant="outlined" size="small" onClick={() => setEditing(l.id)}>
                  Edit
                </Button>
              </span>
            )}
          </Card>
        ))}
      </div>
      {/* A placed line leaves the grid and says where it went, once. */}
      {Object.entries(placed).map(([id, v]) => (
        <MetaText key={id} tone="muted">
          “{TRIAGE.find((l) => l.id === id)?.title}” → {said(v)}
        </MetaText>
      ))}
    </section>
  )
}

/** The last milestone is Later, with Not doing beside it as a tab: what was parked, and what was let go on purpose. */
function LaterAndNotDoing() {
  const [tab, setTab] = useState<'later' | 'not'>('later')
  const lines = tab === 'later' ? LATER : NOT_DOING
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center px-1">
        <Tabs
          size="small"
          tabs={[
            { id: 'later', label: 'Later', count: LATER.length },
            { id: 'not', label: 'Not doing', count: NOT_DOING.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      <Card fill="none" clip>
        <ul aria-label={tab === 'later' ? 'Later' : 'Not doing'}>
          {lines.map((l) => (
            <li key={l.id} className="flex flex-col border-b border-border-subtle px-4 py-2 last:border-b-0">
              <span className={cn('text-body-2', tab === 'later' ? 'text-text-primary' : 'text-text-secondary')}>{l.title}</span>
              <span className="min-w-0 truncate">
                <MetaText tone="muted">
                  {tab === 'later' ? 'From' : 'Belongs to'} {l.from} · {l.at}
                </MetaText>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

/** The Issues tab: Triage, the milestones in order, then Later and Not doing. */
export function BuildPlan() {
  return (
    <div className="flex flex-col gap-8">
      <Triage />
      <div className="flex flex-col gap-6">
        {MILESTONES.map((m) => (
          <MilestoneTable key={m.n} m={m} />
        ))}
        <LaterAndNotDoing />
      </div>
    </div>
  )
}
