/**
 * CONCEPT — Insights, Journal and Risks (prototype issue 009bc509). An item's detail, beside its list or on its own
 * page, drawn from the same parts as the list it was opened from (Miky, 16 Nov: the details felt "out of touch"):
 * an Insight's category and its tool's chart or customer quote; an Update's measures and what it leaves open; a
 * Decision's brief; a Question's phase, options and decider; a Blocker's wait; a severity as its icon. Copied
 * unchanged into Leaf.
 */
import { useState } from 'react'
import { IconExternalLink, IconSparkles } from '@tabler/icons-react'
import { AvatarGroup, Button, Card, Link, LinkPickers, LinkRow, MetaText, Property, Select } from '@estiva-app/ui'
import { STATUSES, type Status } from './MarkAs'
import { AcceptReject, ItemTag, JournalExtras, acceptedStatus } from './ItemParts'
import { DecideDialog, InsightVisual, SeverityMark, needs, waited } from './ItemKinds'
import { Group, ItemTrail, Marked, NeedsYou, Readers, Replaced, comesUp } from './Memory'
import { CATEGORIES, SEVERITIES, PEOPLE, type Item } from './fixtures'

/** An Insight sent by another tool on the protocol: its chart or quote is the source, live. */
export const fromTool = (item: Item) => item.source?.app === 'PostHog' || item.source?.app === 'Intercom'

/** What the detail is, as the list labels it: the word or category with its icon, and a risk's severity icon before it. */
export function ItemIdentity({ item }: { item: Item }) {
  return (
    <span className="flex items-center gap-2">
      {item.type === 'risk' && item.word !== 'Blocker' && <SeverityMark severity={item.severity} />}
      <ItemTag item={item} />
    </span>
  )
}

/**
 * An item's fields, each where the list showed it: the status with its type's words; the person a kind turns on (who
 * decided a Decision, who decides a Question, who a Blocker waits on); an Insight's category; a Concern's or a
 * Question's severity. Then one quiet line of where it lives and who marked it.
 */
export function ItemFields({ item, me = 'miky' }: { item: Item; me?: string }) {
  const [status, setStatus] = useState<Status>(item.status)
  const person = item.word === 'Decision' ? { p: item.decidedBy, label: 'Decided by' } : item.word === 'Question' ? { p: item.decider, label: 'Decides' } : item.word === 'Blocker' ? { p: item.waitingOn, label: 'Waiting on' } : undefined
  const [who, setWho] = useState(person?.p?.key)
  const [category, setCategory] = useState<string>(item.category ?? '')
  const [severity, setSeverity] = useState<string>(item.severity ?? '')
  const people = PEOPLE.map((p) => ({ value: p.key, label: p.name }))
  const waitingOn = status === 'proposed' && item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
  const when = comesUp(item)
  return (
    <div className="flex flex-col gap-2">
      {/* What waits on you first: a suggestion to answer (review, 17 Nov), a loop's change, a lost source. */}
      {status === 'proposed' && !waitingOn && (
        <Card fill="inset" className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-body-2 text-text-primary">Waiting for your answer</span>
          <AcceptReject onAnswer={(yes) => setStatus(yes ? acceptedStatus(item) : 'rejected')} />
        </Card>
      )}
      {waitingOn && <MetaText tone="muted">Waiting for {waitingOn} to add it</MetaText>}
      <NeedsYou item={item} />
      {/* Its properties in one card, a label column and a value column, as Linear's sidebar (Miky, 27 Nov). */}
      <Group title="Properties">
        <div className="flex flex-col gap-2">
          <Property label="Status">
            <LinkPickers status={{ value: status, options: STATUSES[item.type], onChange: (v) => setStatus(v as Status) }} />
          </Property>
          {person && (
            <Property label={person.label}>
              <LinkPickers owner={{ value: who, options: people, onChange: setWho }} />
            </Property>
          )}
          {item.type === 'insight' && (
            <Property label="Category">
              <span className="block w-36">
                <Select size="small" ariaLabel="Category" placeholder="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </span>
            </Property>
          )}
          {item.type === 'risk' && item.word !== 'Blocker' && (
            <Property label="Severity">
              <span className="block w-36">
                <Select size="small" ariaLabel="Severity" placeholder="Severity" value={severity} onChange={setSeverity} options={SEVERITIES.map((s) => ({ value: s, label: s }))} />
              </span>
            </Property>
          )}
          <Property label="Readers">
            <Readers item={item} />
          </Property>
          <Property label="Marked">
            <Marked item={item} />
          </Property>
          {when && (
            <Property label="Comes up">
              <span className="text-body-2 text-text-primary">{when}</span>
            </Property>
          )}
          {(item.supersededBy || item.replaces) && (
            <Property label={item.supersededBy ? 'Replaced' : 'Replaces'}>
              <Replaced item={item} />
            </Property>
          )}
        </div>
      </Group>
    </div>
  )
}

/**
 * An open Question, as one group (Miky, 27 Nov: "weirdly squeezed in"): where it stands and its next step, with Decide
 * for its decider; the brief its options were researched in, to read whole before deciding, as Claude hands Miky a
 * brief page; then each option at the panel's whole width, with what leans to it on a line under its words. Once
 * decided, the Decision it ended in.
 */
function QuestionGroup({ item, me, onDecide, deciding = false }: { item: Item; me: string; onDecide?: (choice: number, why: string) => void; deciding?: boolean }) {
  const [open, setOpen] = useState(deciding)
  if (item.decidedIn)
    return (
      <Card fill="inset" className="flex flex-col gap-0.5 px-3 py-2">
        <span className="text-body-2 text-text-muted">Decided, in the Journal</span>
        <Link href="#" variant="quiet">
          {item.decidedIn}
        </Link>
      </Card>
    )
  const letters = 'ABCDEF'
  const by = item.optionsBy
  return (
    <Group title="Options" trailing={by && item.options ? `by ${by.name}` : undefined}>
      <div className="flex flex-col gap-3">
        <span className="flex items-center justify-between gap-3">
          <span className="text-body-2 text-text-secondary">{needs(item, me)}</span>
          {item.step === 'decide' && item.decider?.key === me && (
            <Button variant="primary" size="small" onClick={() => setOpen(true)}>
              Decide
            </Button>
          )}
          {(item.step ?? 'raised') === 'raised' && (
            <Button variant="outlined" size="small" leadingIcon={<IconSparkles size={14} stroke={1.5} />} onClick={() => undefined}>
              Research options
            </Button>
          )}
        </span>
        {item.brief && (
          <LinkRow
            link={{ state: 'ready', linked: { id: item.brief.title, kind: 'page', noun: 'Brief', title: item.brief.title, href: '#', subtitle: `${by?.name ?? 'Claude'} · ${item.brief.at}`, ...(by ? { authors: [{ name: by.name, bot: by.bot }] } : {}) } }}
            preview
          />
        )}
        {item.options ? (
          <ol className="flex flex-col gap-3" aria-label="Options">
            {item.options.map((o, n) => (
              <li key={o.label} className="flex gap-2 text-body-2">
                <span className="w-4 shrink-0 font-medium text-text-muted">{letters[n]}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-text-primary">{o.label}</span>
                  <span className="text-text-secondary">{o.gist}</span>
                  {(o.lean || o.addedBy || (o.favouredBy?.length ?? 0) > 0) && (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {o.lean && <span className="text-caption text-accent-primary">Leaning</span>}
                      {o.favouredBy && o.favouredBy.length > 0 && (
                        <span className="flex items-center gap-1">
                          <AvatarGroup members={o.favouredBy.map((p) => ({ name: p.name, bot: p.bot }))} size={16} />
                          {/* Its adder alone favouring it says "added by" once, not their name twice. */}
                          {!(o.addedBy && o.favouredBy.every((p) => p.name === o.addedBy?.name)) && <MetaText tone="muted">{o.favouredBy.map((p) => p.name).join(' and ')}</MetaText>}
                        </span>
                      )}
                      {o.addedBy && <MetaText tone="muted">added by {o.addedBy.name}</MetaText>}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <MetaText tone="muted">No options yet.</MetaText>
        )}
      </div>
      {open && <DecideDialog item={item} onDecide={(c, why) => onDecide?.(c, why)} onClose={() => setOpen(false)} />}
    </Group>
  )
}

/** A Blocker's wait: what stops, and who has to act, for how long. */
function BlockerWait({ item }: { item: Item }) {
  return (
    <Card fill="inset" className="flex flex-col gap-1 px-3 py-2">
      {item.blocks && (
        <span className="text-body-2">
          <span className="text-text-muted">Stops: </span>
          {item.blocks}
        </span>
      )}
      {item.waitingOn && <span className="text-body-2 text-text-muted">Waiting {waited(item.day)}</span>}
    </Card>
  )
}

/** Its summary and details, under the title: an Update's whole text; a customer quote's words are its picture. */
export function ItemWords({ item }: { item: Item }) {
  const quote = item.visual?.kind === 'quote'
  return (
    <>
      {item.summary && !quote && !(item.word === 'Update' && item.details) && <span className="text-body-2 text-text-primary">{item.summary}</span>}
      {item.details && <span className="whitespace-pre-line text-body-2 text-text-secondary">{item.details}</span>}
    </>
  )
}

/**
 * The item's own content under its fields, kind by kind, as its list shows it. `words`: draw the summary and details
 * here (the side panel); the item page leaves them to its header and description.
 */
export function ItemContent({ item, me = 'miky', words = true, onDecide, deciding, here }: { item: Item; me?: string; words?: boolean; onDecide?: (choice: number, why: string) => void; deciding?: boolean; here?: string }) {
  const tool = fromTool(item)
  const quote = item.visual?.kind === 'quote'
  return (
    <div className="flex flex-col gap-3">
      {item.word === 'Blocker' && item.status !== 'proposed' && <BlockerWait item={item} />}
      {item.visual && (
        <Card fill="inset" className="flex flex-col p-3">
          <InsightVisual visual={item.visual} />
        </Card>
      )}
      {words && item.summary && !quote && !(item.word === 'Update' && item.details) && <span className="text-body-2 text-text-primary">{item.summary}</span>}
      {words && item.details && <span className="whitespace-pre-line text-body-2 text-text-secondary">{item.details}</span>}
      <JournalExtras item={item} />
      {item.word === 'Question' && item.status !== 'proposed' && <QuestionGroup item={item} me={me} onDecide={onDecide} deciding={deciding} />}
      {/* A tool's insight: its chart or quote is the source, so a link to it, not a copy as marked. */}
      {tool && item.source && (
        <MetaText tone="muted">
          <span className="inline-flex items-center gap-1">
            {item.source.app} · {item.source.place}
            {!quote && ' · Updated 5 min ago'}
            <IconExternalLink size={12} stroke={1.5} />
          </span>
        </MetaText>
      )}
      <ItemTrail item={item} here={here} />
    </div>
  )
}
