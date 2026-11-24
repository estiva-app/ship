/**
 * CONCEPT — what the intelligence layer's agents do where people can see it, drawn after reading Notion's "A new shape
 * for work" with Miky (24 Nov): a Decision's follow-ups (what still says otherwise, each with a proposed change), a
 * loop's own page (what it reads, its instructions as a versioned page, the level a person allows, its checks and runs),
 * and an issue an agent claimed (claimed, working, wrote back). Ship only.
 */
import { useState } from 'react'
import { IconCircleCheck, IconGitPullRequest, IconHelpCircle, IconNotebook, IconSparkles, IconTerminal2 } from '@tabler/icons-react'
import { Button, Card, Link, MetaText, PageHeader, SectionHeader, Select } from '@estiva-app/ui'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Centred } from '@/components/layout/ReadingColumn'
import { LiveHeader } from '@/components/editing/LiveHeader'
import { AcceptReject } from './ItemParts'
import { PROJECT } from './fixtures'

const stay = (e: { preventDefault: () => void }) => e.preventDefault()
const LOOP_HREF = '#/loop/decision'

/** A place that still says what a Decision changed, with the words now and the change the loop proposes. */
interface FollowUp { id: string; place: string; now: string; proposed: string }
const FOLLOW_UPS: FollowUp[] = [
  { id: 'f1', place: 'Ship · the sidebar’s heading', now: 'Topics', proposed: 'Initiatives' },
  { id: 'f2', place: 'Leaf · Universal Navigation brainstorm', now: 'A topic gathers projects from every app.', proposed: 'An Initiative gathers projects from every app; a topic is a team’s room.' },
  { id: 'f3', place: 'Peek · a file’s menu', now: 'Add to topic', proposed: 'Add to Initiative' },
]

function FollowUpRow({ f }: { f: FollowUp }) {
  const [answer, setAnswer] = useState<'changed' | 'left' | undefined>()
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-1">
        <Link href="#" variant="quiet" onClick={stay}>
          {f.place}
        </Link>
        <span className="text-body-2 text-text-muted line-through">{f.now}</span>
        <span className="text-body-2 text-text-primary">{f.proposed}</span>
      </span>
      {answer ? (
        <span className="flex shrink-0 items-center gap-2">
          <MetaText tone="muted">{answer === 'changed' ? 'Changed' : 'Left as it is'}</MetaText>
          <Button variant="outlined" size="small" onClick={() => setAnswer(undefined)}>
            Undo
          </Button>
        </span>
      ) : (
        <AcceptReject label="Change" onAnswer={(yes) => setAnswer(yes ? 'changed' : 'left')} />
      )}
    </li>
  )
}

/**
 * Under an accepted Decision: every place that still says otherwise (Notion's "propagate decisions to all relevant
 * pages"), found by the decision loop from where the items were used. Each change waits for a person.
 */
export function DecisionFollowUps() {
  return (
    <section className="flex flex-col gap-2" aria-label="Still says otherwise">
      <SectionHeader title="Still says otherwise" count={FOLLOW_UPS.length} />
      <Card fill="none" clip>
        <ul aria-label="Still says otherwise">
          {FOLLOW_UPS.map((f) => (
            <FollowUpRow key={f.id} f={f} />
          ))}
        </ul>
      </Card>
      <MetaText tone="muted">
        <IconSparkles size={12} stroke={1.5} className="mr-1 inline" />
        Found by{' '}
        <Link href={LOOP_HREF} variant="quiet" onClick={stay}>
          the decision loop
        </Link>{' '}
        when this was accepted
      </MetaText>
    </section>
  )
}

/** How far a person lets a loop go: it starts proposing, and only a person raises it. */
const LEVELS = [
  { value: 'proposes', label: 'Proposes' },
  { value: 'undo', label: 'Acts, with Undo' },
  { value: 'acts', label: 'Acts' },
]

/** What the loop must get right, run against each new version of its instructions (Notion's evals). */
const CHECKS = [
  'Finds a page that still uses the old word',
  'Proposes nothing in a team the Decision’s readers cannot read',
  'Leaves past Journal entries as they were',
  'Proposes nothing when nothing disagrees',
]

interface Run { when: string; after: string; did: string; acted?: boolean }
const RUNS: Run[] = [
  { when: 'Today, 10:12', after: 'Cross-app work is an Initiative; a team room is a Topic', did: 'Proposed 3 changes' },
  { when: '13 Nov', after: 'A Folder is called a team', did: 'Changed 2 pages', acted: true },
  { when: '2 Nov', after: 'Ship opens on Topics', did: 'Found nothing to change' },
]

function RunRow({ run }: { run: Run }) {
  const [undone, setUndone] = useState(false)
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 truncate text-body-2 text-text-primary">{undone ? 'Undone: both pages are back as they were' : run.did}</span>
        <MetaText tone="muted">
          {run.when} · after “{run.after}”
        </MetaText>
      </span>
      {run.acted && !undone && (
        <Button variant="outlined" size="small" onClick={() => setUndone(true)}>
          Undo
        </Button>
      )}
    </li>
  )
}

/**
 * A loop's own page, shaped like an item's: its name and what it is for, then what it reads and the level a person
 * allows; its instructions are its description, a page with versions anyone can read; then its checks and runs.
 */
export function LoopPage() {
  const [level, setLevel] = useState('proposes')
  const crumbs = [
    { label: 'Projects', href: '#/projects' },
    { label: PROJECT, href: '#/project/p' },
    { label: 'Loops', icon: <IconSparkles size={16} stroke={1.5} /> },
  ]
  const fields = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-44">
          <Select size="small" ariaLabel="What it may do" value={level} onChange={setLevel} options={LEVELS} />
        </span>
        <MetaText tone="muted">Runs when a Decision is accepted</MetaText>
      </div>
      <MetaText tone="muted">Reads the project’s Journal, its issues and the Leaf pages they link, in Estiva HQ</MetaText>
      <MetaText tone="muted">
        Instructions version 4 · changed by Miky 2d ago ·{' '}
        <Link href="#" variant="quiet" onClick={stay}>
          Versions
        </Link>
      </MetaText>
    </div>
  )
  return (
    <div data-surface="loop" className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader title={<Breadcrumb items={crumbs} />} />
      <ScrollArea className="min-h-0 min-w-0 flex-1" contentClassName="flex flex-col gap-6 px-6 pb-5">
        <Centred>
          <LiveHeader
            fields={fields}
            title="The decision loop"
            titlePlaceholder="Untitled loop"
            onRename={() => true}
            summary="When a Decision is accepted, it finds what still says otherwise and proposes the change."
            description={
              'Read the accepted Decision and what it chose over.\nFind each place in this project that still says what was turned down: the Journal, the issues, the Leaf pages they link.\nPropose the smallest change that makes it agree. Leave past Journal entries as they were.'
            }
            format="marker"
            onDescribe={() => true}
          />
          <section className="flex flex-col gap-2" aria-label="Checks">
            <SectionHeader title="Checks" count={CHECKS.length} />
            <Card fill="none" clip>
              <ul aria-label="Checks">
                {CHECKS.map((c) => (
                  <li key={c} className="flex items-center gap-2 border-b border-border-subtle px-4 py-2 last:border-b-0">
                    <IconCircleCheck size={16} stroke={1.5} className="shrink-0 text-text-success" />
                    <span className="text-body-2 text-text-primary">{c}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <MetaText tone="muted">All pass on version 4</MetaText>
          </section>
          <section className="flex flex-col gap-2" aria-label="Runs">
            <SectionHeader title="Runs" count={RUNS.length} />
            <Card fill="none" clip>
              <ul aria-label="Runs">
                {RUNS.map((r) => (
                  <RunRow key={r.when} run={r} />
                ))}
              </ul>
            </Card>
          </section>
        </Centred>
      </ScrollArea>
    </div>
  )
}

/**
 * An agent's claim on an issue (Miky, 24 Nov: every app's harness claims, works and writes back the same way): one line
 * under the description, working with its session, or what it wrote back where everyone reads it.
 */
export function AgentClaim({ phase }: { phase: 'working' | 'wrote' }) {
  return (
    <Card fill="inset" className="flex flex-col gap-1 px-3 py-2">
      <span className="flex items-center gap-2 text-body-2 text-text-primary">
        <IconTerminal2 size={14} stroke={1.5} className="shrink-0" />
        {phase === 'working' ? 'Claude is working on this' : 'Claude wrote back'}
        <MetaText tone="muted">· claimed 2h ago</MetaText>
        {phase === 'working' && (
          <span className="ml-auto">
            <Link href="#" variant="quiet" onClick={stay}>
              Open session
            </Link>
          </span>
        )}
      </span>
      {phase === 'wrote' && (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="#" variant="quiet" onClick={stay}>
            <IconGitPullRequest size={12} stroke={1.5} className="mr-1 inline" />
            ship#612, open
          </Link>
          <Link href="#" variant="quiet" onClick={stay}>
            <IconNotebook size={12} stroke={1.5} className="mr-1 inline" />
            An Update in the Journal
          </Link>
          <Link href="#" variant="quiet" onClick={stay}>
            <IconHelpCircle size={12} stroke={1.5} className="mr-1 inline" />
            A question for Miky
          </Link>
        </span>
      )}
    </Card>
  )
}
