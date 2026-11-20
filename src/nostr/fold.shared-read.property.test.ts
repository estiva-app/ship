/**
 * Ship's own read and the shared read, on made-up histories (TES-2).
 *
 * Ship folds a project or an issue with `foldFolder`. Peek, Leaf and the agent
 * read the same events through `@estiva-app/interop`'s `projectEvents`, by
 * what Ship's manifest says (`manifestContent()`), so a rule the fold applies
 * and the manifest does not state is a rule only Ship follows. That is how a
 * project renamed in Ship kept its old name in every other app (ship#127) and
 * a renamed issue did too (ship#231).
 *
 * Here both reads get the same histories, made up by
 * `@estiva-app/protocol/testing` (projects and issues created, renamed, moved,
 * a status set, assigned, archived, deleted, by several people, many in the
 * same second, some delivered twice, in any order), and must show the same
 * title, status, summary, parent, assignee, archived and deleted for every
 * project and issue.
 *
 * A failure prints the smallest history that breaks it and the seed that
 * replays it: `FC_SEED=<seed> npx vitest run src/nostr/fold.shared-read`.
 * A difference where both readings could be right is Miky's to decide; his
 * answers are `KEPT` below, and nothing else is.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { deliveryArb, historyArb, runSettings } from '@estiva-app/protocol/testing'
import { projectEvents, type ForeignObject } from '@estiva-app/interop'
import type { SignedEvent } from '@estiva-app/protocol'
import { ARCHIVED_OR_DELETED, foldFolder, type Issue, type Project } from './fold'
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

function seenByShip(file: Project | Issue): Seen {
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
  }
}

function seenBySharedRead(object: ForeignObject): Seen {
  return {
    title: object.slots.title?.value ?? '',
    status: object.slots.status?.value ?? '',
    summary: object.slots.subtitle?.value ?? '',
    parent: object.parentRef ?? '',
    assignee: object.meta.find((slot) => slot.label === 'Assignee')?.value ?? '',
    archived: !!object.archived,
    deleted: !!object.deleted,
  }
}

/** Every project and issue, by address, as each read shows it. */
function bothReads(events: SignedEvent[]): { ship: Record<string, Partial<Seen>>; shared: Record<string, Partial<Seen>> } {
  const folded = foldFolder(events)
  const ship = Object.fromEntries([...folded.projects, ...folded.issues].map((file) => [file.addr, seenByShip(file)]))
  const shared = Object.fromEntries(
    projectEvents(events, () => resolved)
      .filter((object) => object.kind === KIND.PROJECT || object.kind === KIND.ISSUE)
      .map((object) => [object.address!, seenBySharedRead(object)]),
  )
  return { ship: compared(ship), shared: compared(shared) }
}

describe("Ship's read and the shared read Peek and Leaf use", () => {
  test('show the same title, status, summary, parent, assignee, archived and deleted for every project and issue', () => {
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
