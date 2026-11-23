/**
 * What Ship shows and what the shared read gives, on made-up histories (TES-2).
 *
 * Ship reads a project or an issue with `readState`, which is the shared read
 * (`@estiva-app/interop`'s `projectEvents`, by Ship's manifest) named the way
 * Ship's pages hold it (`files.ts`), since MOV-4; before, Ship had a read of its
 * own, and a rule it applied and the manifest did not state was a rule only Ship
 * followed. That is how a project renamed in Ship kept its old name in every
 * other app (ship#127) and a renamed issue did too (ship#231). What is left to
 * guard is the naming: a field `files.ts` takes from the wrong slot, or drops.
 *
 * Here both reads get the same histories, made up by
 * `@estiva-app/protocol/testing` (projects and issues created, renamed, moved,
 * a status set, assigned, archived, deleted, by several people, many in the
 * same second, some delivered twice, in any order; summaries with line breaks,
 * statuses nobody defined, a project's own statuses, statuses that carry their
 * stage, descriptions, keys, leads and refs, since MOV-1), and must show the
 * same of everything Ship shows about a project or an issue: title, status and
 * its stage, summary, parent, assignee, archived, deleted, description, key (an
 * issue's is its ref), lead, and for each field which change set it, who made
 * it and when.
 *
 * The shared read is two functions over the same events: `projectEvents`
 * gives the card (title, status, stage, summary, key, lead, parent, assignee,
 * archived, deleted) and `filesOf` gives each field's current change and the
 * text. "When" is compared to the second: Ship's fold keeps a change's second,
 * and the change's id already says which change of that second it is. The id
 * carries the comparison: where the reads pick different changes, the id, the
 * person and the time all differ at once, from one wrong winner. The file's
 * history, every change in order as Ship's History panel lists it, is compared
 * with the shared history (`historyOf`), since MOV-4.
 *
 * A failure prints the smallest history that breaks it and the seed that
 * replays it: `FC_SEED=<seed> npx vitest run src/nostr/read.shared-read`.
 * A difference where both readings could be right is Miky's to decide; his
 * answers are `KEPT` below, and nothing else is.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { deliveryArb, historyArb, runSettings } from '@estiva-app/protocol/testing'
import { BLOCK_DOCUMENT_FORMAT, filesOf, historyOf, projectEvents, textOf, type FileChange, type FileFields, type ForeignObject } from '@estiva-app/interop'
import type { SignedEvent } from '@estiva-app/protocol'
import { ARCHIVED_OR_DELETED, type Change, type Issue, type Project } from './files'
import { readState } from './read'
import { manifestContent } from './manifest'
import { ISSUE_STATUSES, KIND, PROJECT_STATUSES } from './kinds'
import { statusLabel } from '../lib/issues'

const settings = runSettings(1000)

/** Ship's manifest as every reader holds it, for every root's author. */
const resolved = {
  manifest: manifestContent() as unknown as NonNullable<ReturnType<Parameters<typeof projectEvents>[1]>>['manifest'],
  address: `31990:${'a'.repeat(64)}:estiva-ship`,
  viaRecommendation: true,
}

/** What a person sees of a project or an issue, in either app. */
interface Seen {
  title: string
  status: string
  summary: string
  parent: string
  assignee: string
  archived: boolean
  deleted: boolean
  description: string
  /** How the description is written: Ship's `marker`, `blocks` or `unknown`. */
  descriptionFormat: string
  /** A project's key; an issue's ref. */
  key: string
  lead: string
  /** What the status means (SPEC §7.4), or '' where neither the change nor a list says. */
  stage: string
  /** For each field a change set: that change's id, who made it, and the second it was made. */
  setBy: Record<string, string>
  /** Every change to it, oldest first: its id, the field and value it set, and who made it. */
  history: string[]
}

/**
 * Differences Miky decided to keep: each the field left out of the comparison,
 * and his answer, linked. Only his answers go here (TES-2's Done when); none
 * yet, because every difference found so far was a plain bug and was fixed.
 */
const KEPT: { field: keyof Seen; why: string }[] = []

/** A reading without the fields Miky decided may differ. */
function compared(seen: Record<string, Seen>): Record<string, Partial<Seen>> {
  const kept = new Set(KEPT.map((k) => k.field))
  return Object.fromEntries(
    Object.entries(seen).map(([address, fields]) => [address, Object.fromEntries(Object.entries(fields).filter(([field]) => !kept.has(field as keyof Seen)))]),
  )
}

const line = (id: string, field: string, value: string, by: string) => `${id} ${field}=${value} by ${by}`

function seenByShip(file: Project | Issue, activity: Change[]): Seen {
  const issue = 'folder' in file ? file : undefined
  return {
    title: file.title,
    // As Ship draws it: the vocabulary's label, which is what the shared read gives.
    status: statusLabel(file.status, issue ? ISSUE_STATUSES : PROJECT_STATUSES),
    summary: file.summary ?? '',
    parent: issue?.projectAddr ?? '',
    assignee: issue?.assignee ?? '',
    // A project's own `archived`; an issue's is read by `ownArchive` (src/lib/archive.ts) by the same value.
    archived: file.fields.archived?.value === ARCHIVED_OR_DELETED,
    deleted: !!file.deleted,
    description: file.description,
    descriptionFormat: file.descriptionFormat,
    key: (issue ? issue.ref : (file as Project).key) ?? '',
    lead: issue ? '' : ((file as Project).lead ?? ''),
    stage: file.stage ?? '',
    setBy: Object.fromEntries(Object.entries(file.fields).map(([field, set]) => [field, `${set.id} by ${set.by} at ${set.at}`])),
    // As the History panel lists it: the activity's changes to this file, in the activity's order.
    history: activity.filter((change) => change.target === file.addr).map((change) => line(change.id, change.field, change.value, change.author)),
  }
}

/** A `content-format` as Ship names it (`contentFormatOf`): none is marker text, the block format is blocks. */
const formatName = (format: string | undefined) => (!format ? 'marker' : format === BLOCK_DOCUMENT_FORMAT ? 'blocks' : 'unknown')

function seenBySharedRead(object: ForeignObject, file: FileFields | undefined, history: FileChange[]): Seen {
  const meta = (named: (slot: ForeignObject['meta'][number]) => boolean) => object.meta.find(named)?.value ?? ''
  const text = file?.fields.description ?? (file ? textOf(file.root) : undefined)
  return {
    title: object.slots.title?.value ?? '',
    status: object.slots.status?.value ?? '',
    summary: object.slots.subtitle?.value ?? '',
    parent: object.parentRef ?? '',
    assignee: object.meta.find((slot) => slot.label === 'Assignee')?.value ?? '',
    archived: !!object.archived,
    deleted: !!object.deleted,
    description: text?.value ?? '',
    descriptionFormat: formatName(text?.format),
    key: object.kind === KIND.ISSUE ? meta((slot) => slot.field === 'ref') : meta((slot) => slot.label === 'Key'),
    lead: object.kind === KIND.ISSUE ? '' : meta((slot) => slot.label === 'Lead'),
    stage: object.slots.status?.stage ?? '',
    setBy: Object.fromEntries(Object.entries(file?.fields ?? {}).map(([field, set]) => [field, `${set.id} by ${set.pubkey} at ${Math.floor(set.at / 1000)}`])),
    history: history.filter((change) => change.address === object.address).map((change) => line(change.id, change.field, change.value, change.pubkey)),
  }
}

/** Every project and issue, by address, as each read shows it. */
function bothReads(events: SignedEvent[]): { ship: Record<string, Partial<Seen>>; shared: Record<string, Partial<Seen>> } {
  const read = readState(events)
  const ship = Object.fromEntries([...read.projects, ...read.issues].map((file) => [file.addr, seenByShip(file, read.activity)]))
  const files = new Map(filesOf(events, { withText: true }).map((file) => [file.address, file]))
  const history = historyOf(events)
  const shared = Object.fromEntries(
    projectEvents(events, () => resolved)
      .filter((object) => object.kind === KIND.PROJECT || object.kind === KIND.ISSUE)
      .map((object) => [object.address!, seenBySharedRead(object, files.get(object.address!), history)]),
  )
  return { ship: compared(ship), shared: compared(shared) }
}

describe("What Ship shows and the shared read Peek and Leaf use", () => {
  test('show the same of everything Ship shows about a project or an issue: its title, status, stage, summary, parent, assignee, archived, deleted, description, key, lead, who set each field and when, and its history', () => {
    fc.assert(
      fc.property(historyArb().chain((history) => deliveryArb(history.events)), (events) => {
        const { ship, shared } = bothReads(events)
        expect(shared).toEqual(ship)
      }),
      settings,
    )
  })

  // SPEC §6.5 archives and deletes with `true` and restores with the empty
  // value; Ship's manifest says the same (`hiddenWhen`, the vocabularies). An
  // app that restores with `false` must not leave the file archived in Ship
  // alone (TES-2).
  test('agree when an archive or a delete is undone by writing false', () => {
    const undoneWithFalse = (event: SignedEvent): SignedEvent => {
      const sets = (field: string) => event.tags.some((t) => (t[0] === 'field' && t[1] === field) || (t[0] === 'set' && t[1] === field))
      if (event.kind !== KIND.CHANGE || !(sets('archived') || sets('deleted'))) return event
      const tags = event.tags.map((t) =>
        t[0] === 'value' && t[1] === '' ? ['value', 'false'] : t[0] === 'set' && (t[1] === 'archived' || t[1] === 'deleted') && t[2] === '' ? ['set', t[1], 'false'] : t,
      )
      return { ...event, tags }
    }
    fc.assert(
      fc.property(historyArb().chain((history) => deliveryArb(history.events.map(undoneWithFalse))), (events) => {
        const { ship, shared } = bothReads(events)
        expect(shared).toEqual(ship)
      }),
      settings,
    )
  })

  test('agree on long histories by two people, with file ids that hold a colon', () => {
    fc.assert(
      fc.property(historyArb({ people: 2, maxChanges: 60, idsWithColons: true }).chain((history) => deliveryArb(history.events)), (events) => {
        const { ship, shared } = bothReads(events)
        expect(shared).toEqual(ship)
      }),
      settings,
    )
  })
})
