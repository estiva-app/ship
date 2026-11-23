/**
 * Ship's projects and issues, read by the shared read (MOV-3).
 *
 * `projectEvents` is the read Peek, Leaf and the agent use, through Ship's own
 * manifest: one piece of code decides a file's title, status, summary, parent,
 * assignee, lead, key, archive and delete, and which change set each field.
 * This file only names those answers the way Ship's pages hold them
 * (`Project`, `Issue`); it decides nothing about a file itself.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
 */
import { contentFormatOf, type ContentFormat, type SignedEvent } from '@estiva-app/protocol'
import { historyOf, projectEvents, textOf, type FileChange, type ForeignObject, type Stage } from '@estiva-app/interop'
import { DEFAULT_ISSUE_STATUS, DEFAULT_PROJECT_STATUS, KIND, projectStage } from './kinds'
import { manifestContent } from './manifest'

/** One field a kind:1851 set, as the shared read counted it toward a file. */
export interface Change {
  id: string
  /** Whoever acted. Frequently not the object's author — that is the point. */
  author: string
  createdAt: number
  /**
   * Epoch ms from the `ts` tag, as written, trusted or not: the shared read
   * decides whether it orders the change (SPEC §6.2), and the lists here are
   * already in that order, so never read it on its own.
   */
  ts?: number
  /** Address of the object changed, `<kind>:<pubkey>:<d>`. */
  target: string
  field: string
  value: string
  /**
   * Which content model `value` is written in — SPEC §13.4.
   *
   * It travels with the change rather than with the object, because the tag is
   * on the event the value came from: a description created as marker text and
   * later edited into blocks is an untagged root plus a tagged change, and the
   * fold takes the change's value. Reading the root's tag would report the
   * format of a value that is no longer displayed.
   */
  format: ContentFormat
  /**
   * What the value means, when the change says (SPEC §6.2's `["stage", field, …]`),
   * read by interop's `stageTagOf`. It travels with the change, like `format`:
   * a later change with none leaves none (EAC-3).
   */
  stage?: Stage
  /** Optional human note from `.content`. */
  note: string
  /**
   * The Folder the change was signed in: its first `h` with a value, the one
   * the relay checks the signer's membership against. A `buzz-channel` on a
   * change proves nothing, so it is not read (SPEC §6.2).
   */
  folder?: string
  /** The file the change says it is about, by its id: its `O` (SPEC §6.2). */
  about?: string
}

/** Fields on a Project or Issue that changes are allowed to set. */
/** Each field's winning change; `id` is that change's, the field's next `prev` (SPEC §6.2). */
export type FoldedFields = Record<string, { value: string; by: string; at: number; format: ContentFormat; id: string; stage?: Stage }>

export interface Project {
  addr: string
  id: string
  author: string
  createdAt: number
  title: string
  description: string
  /**
   * Which content model `description` is in — SPEC §13.4, resolved.
   *
   * From the winning change when one set the description, otherwise from the
   * root's own tag. Absent means marker text, permanently: 731 published
   * bodies carry no tag and none of them can be given one.
   */
  descriptionFormat: ContentFormat
  /** The one-line summary beside the title, as `fileSummary` reads it; absent when it has none. */
  summary?: string
  /**
   * The Folder the project record names: `buzz-channel` on a global record,
   * `h` on a channel-scoped one — the same answer interop's `folderOf` gives.
   *
   * Where a `kind:1851` about the project is addressed, since changes stay
   * channel-scoped whatever the record does, and where new issues and
   * comments go (`workFolder` in `api/writes.ts`), never the Folder that
   * lists the project. Nothing overrides this one: the
   * `folder` field that used to re-point a project is no longer read (MAN-5),
   * and a move changes only the Folder listings (FOL-7). Older issues and
   * threads may sit in other Folders; they are found by their parent and
   * anchor, not by this.
   */
  contentFolder: string
  lead?: string
  /** The project's own key, when it has one on the wire — `projectKeys` gives every project's. */
  key?: string
  status: string
  /** What the status means, as every app counts it (`projectStage`); absent for a word nothing reads. */
  stage?: Stage
  /**
   * Hidden from the lists, reversibly.
   *
   * A folded field rather than a deletion, so anyone in the Folder can do it,
   * it can be undone, and the activity feed records who did it. Deleting is a
   * separate and much narrower operation — see `buildDeletion`.
   */
  archived: boolean
  /**
   * Deleted by a `deleted` change (SPEC §6.13): who and when. Left out of every
   * list and search; its link shows who deleted it, with Restore. An old kind-5
   * delete never reaches the fold: the relay drops the record.
   * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/every-file-is-an-artifact-the-relay-keeps-in-order.md
   */
  deleted?: { by: string; at: number }
  /** The record's event id: the `prev` of a field's first change (SPEC §6.2). */
  rootId?: string
  /** Provenance for every field a change touched. Drives "changed by" in the UI. */
  fields: FoldedFields
}

export interface Issue {
  addr: string
  id: string
  author: string
  createdAt: number
  title: string
  description: string
  /**
   * Which content model `description` is in — SPEC §13.4, resolved.
   *
   * From the winning change when one set the description, otherwise from the
   * root's own tag. Absent means marker text, permanently: 731 published
   * bodies carry no tag and none of them can be given one.
   */
  descriptionFormat: ContentFormat
  /** The one-line summary beside the title, as `fileSummary` reads it; absent when it has none. */
  summary?: string
  folder: string
  /** Parent project address, when the issue has one. */
  projectAddr?: string
  /** Display-only key such as `LL-12`. */
  ref?: string
  status: string
  /** What the status means, as every app counts it (`issueStage`); absent for a word nothing reads. */
  stage?: Stage
  assignee?: string
  /**
   * Deleted by a `deleted` change (SPEC §6.5), as a project is: who and when.
   * It keeps its ref, so a restore brings back the same name and a new issue
   * never takes it (§6.1). An old kind-5 delete never reaches the fold.
   * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
   */
  deleted?: { by: string; at: number }
  /** The record's event id: the `prev` of a field's first change (SPEC §6.2). */
  rootId?: string
  fields: FoldedFields
}

/**
 * The one value that archives or deletes a file (SPEC §6.5; the manifest's
 * `hiddenWhen` and vocabularies say the same). Any other value, `false`
 * included, reads as live, as every manifest reader reads it: Ship took any
 * non-empty value, so a file another app restored with `false` stayed
 * archived or deleted in Ship alone (TES-2).
 */
export const ARCHIVED_OR_DELETED = 'true'


type Resolved = NonNullable<ReturnType<Parameters<typeof projectEvents>[1]>>

/**
 * Ship's manifest as this bundle ships it, for every file: Ship reads its own
 * kinds by its own declaration, whoever signed the file. One object for the
 * life of the page, which is what lets the shared read hand back a file it has
 * already read.
 */
const OWN: Resolved = {
  manifest: manifestContent() as unknown as Resolved['manifest'],
  address: `31990:${'0'.repeat(64)}:estiva-ship`,
  viaRecommendation: true,
}
const own = () => OWN

/** The first meta slot whose label, or field, is `named`. */
function meta(object: ForeignObject, by: 'label' | 'field', named: string): string | undefined {
  for (const slot of object.meta) if (slot[by] === named) return slot.value
  return undefined
}

/**
 * A file's title. The shared read draws no slot for an empty title, and Ship
 * tells two cases apart there: a title somebody emptied stays empty, and a
 * file that never had one says so.
 */
function titleOf(object: ForeignObject, untitled: string): string {
  const slot = object.slots.title?.value
  if (slot !== undefined) return slot
  const named = object.fields?.title || object.record!.tags.some((t) => t[0] === 'title' || t[0] === 'name')
  return named ? '' : untitled
}

/** What every project and issue share. */
function common(object: ForeignObject) {
  const record = object.record!
  const fields = object.fields ?? {}
  // A text a change set, or the one the file was created with.
  const seed = fields.description ? undefined : textOf(record)
  // Set one by one, not spread in: this runs for every file of the workspace.
  const file: Pick<Project, 'addr' | 'id' | 'author' | 'createdAt' | 'description' | 'descriptionFormat' | 'rootId' | 'fields' | 'summary' | 'deleted'> = {
    addr: object.address!,
    id: record.tags.find((t) => t[0] === 'd')![1],
    author: record.pubkey,
    createdAt: record.created_at,
    description: fields.description?.value ?? seed?.value ?? '',
    descriptionFormat: fields.description?.format ?? contentFormatOf(record),
    rootId: object.eventId,
    // A copy: the shared read hands the same object back on the next read.
    fields: { ...fields },
  }
  if (object.slots.subtitle?.value) file.summary = object.slots.subtitle.value
  if (object.deleted) file.deleted = object.deleted
  return file
}

const named = new WeakMap<ForeignObject, Project | Issue>()
const records = new WeakMap<Project | Issue, SignedEvent>()

/** The first record a project or an issue was read from, as signed: what its history starts from. */
export function recordOf(file: Project | Issue): SignedEvent | undefined {
  return records.get(file)
}

/**
 * Every project and issue among the events, newest first, as Ship's pages hold
 * them; and `files`, the shared read's own answer for each, which carries the
 * changes it counted (`changes`) so nothing here walks them a second time.
 */
export function readFiles(events: readonly SignedEvent[]): { projects: Project[]; issues: Issue[]; files: ForeignObject[] } {
  const projects: Project[] = []
  const issues: Issue[] = []
  const files: ForeignObject[] = []
  for (const object of projectEvents(events, own, { bare: true, fields: true, remember: true, changes: true })) {
    if (object.kind === KIND.PROJECT || object.kind === KIND.ISSUE) files.push(object)
    // The shared read hands back the same object for a file nothing changed, and so does this.
    const held = named.get(object)
    if (held) {
      if ('folder' in held) issues.push(held)
      else projects.push(held)
      continue
    }
    if (object.kind === KIND.PROJECT) {
      const status = object.slots.status?.stored ?? DEFAULT_PROJECT_STATUS
      const project = common(object) as Project
      project.title = titleOf(object, '(untitled project)')
      project.contentFolder = object.folder ?? ''
      project.lead = meta(object, 'label', 'Lead') ?? object.fields?.lead?.value
      project.key = meta(object, 'label', 'Key') ?? object.fields?.key?.value
      project.status = status
      // The shared read's stage, and for the 19 projects an older writer left
      // as `active` or `done` the stage of the status it meant: `projectStage`
      // reads the alias, as the label and the colour do (SHIPS-7). Those words
      // are Ship's alone until the projects are rewritten; next door they
      // read as written.
      project.stage = object.slots.status?.stage ?? projectStage(status, object.fields?.status?.stage)
      project.archived = !!object.archived
      projects.push(project)
      named.set(object, project)
      records.set(project, object.record!)
    } else if (object.kind === KIND.ISSUE) {
      const issue = common(object) as Issue
      issue.title = titleOf(object, '(untitled issue)')
      issue.folder = object.scopedTo ?? ''
      issue.projectAddr = object.parentRef
      issue.ref = meta(object, 'field', 'ref') ?? object.fields?.ref?.value
      issue.status = object.slots.status?.stored ?? DEFAULT_ISSUE_STATUS
      issue.stage = object.slots.status?.stage
      // A slot is not drawn for a cleared value; the field still says it was cleared.
      issue.assignee = meta(object, 'label', 'Assignee') ?? object.fields?.assignee?.value
      issues.push(issue)
      named.set(object, issue)
      records.set(issue, object.record!)
    }
  }
  const byNewest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt
  return { projects: projects.sort(byNewest), issues: issues.sort(byNewest), files }
}

/**
 * Every change the shared read counted toward these files, file by file, each
 * file's oldest first in §6.3's order (its time, then the lower id), a change
 * setting several fields one line each in the order it names them. This is
 * Ship's activity list: the same changes, and only those, that made each file
 * what it is now, so the two can never disagree. A change to a file whose
 * record is not in the read is not in it, as the shared history leaves it out
 * (Miky, 21 Nov, on MOV-2).
 *
 * Not one order across files: everything that reads it reads one file's (its
 * History, "Edited", its archive line), and sorting the whole workspace on
 * every open and live update made the read slower than the one it replaced.
 */
export function activityOf(files: readonly ForeignObject[]): Change[] {
  const all: Change[] = []
  for (const file of files) for (const change of changesOf(file)) all.push(change)
  return all
}

/**
 * One file's whole history, from its first record and every change read for
 * it (`useFileChanges`), by the shared read's `historyOf`: what Peek, Leaf and
 * the agent list for it, oldest first. Which changes count is its answer
 * (signed in the file's team, about this file); nothing here decides it again.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-keeps-every-change-for-good.md
 */
export function historyOfFile(record: SignedEvent, changes: readonly SignedEvent[]): Change[] {
  const lines = historyOf([record, ...changes])
  const history: Change[] = []
  for (const line of lines) history.push(changeOf(line))
  return history
}

/** A line of the shared history, as Ship's pages hold a change. */
function changeOf(line: FileChange): Change {
  const event = line.event
  const folder = event.tags.find((t) => t[0] === 'h' && !!t[1])?.[1]
  const about = event.tags.find((t) => t[0] === 'O')?.[1]
  const change: Change = {
    id: line.id,
    author: line.pubkey,
    createdAt: event.created_at,
    ts: tsAsWritten(event, line.at),
    target: line.address,
    field: line.field,
    value: line.value,
    // The tag's own word is `contentFormatOf`'s to name (`estiva-blocks-1` is `blocks`).
    format: line.format === undefined ? 'marker' : contentFormatOf(event),
    note: line.note,
    folder,
  }
  if (line.stage) change.stage = line.stage
  if (about !== undefined) change.about = about
  return change
}

/**
 * The changes the shared read counted toward one file, as Ship's pages hold a
 * change. Which ones count is the shared read's answer (signed in the file's
 * team, about this file, setting a field): nothing here decides it again.
 * A file the shared read hands back unchanged gives the same list back.
 */
function changesOf(file: ForeignObject): Change[] {
  let held = listed.get(file)
  if (held) return held
  held = []
  // The shared read lists them in the order they were handed in; a file's history is in §6.3's, its time then the
  // lower id (the shared read's `ms` is that time). The sort is stable: one change's lines stay as it names them.
  const lines = (file.changes ?? []).slice().sort((a, b) => a.ms - b.ms || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0))
  const target = file.address!
  // A change that arrived twice is listed once, as the shared history lists it (Miky, 21 Nov, on MOV-2): every line
  // of one change id sits in one run, so a field seen twice in a run is the same change again.
  let runId = ''
  const runFields: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const event = line.event
    if (event.id !== runId) {
      runId = event.id
      runFields.length = 0
    } else if (runFields.includes(line.field)) continue
    runFields.push(line.field)
    const change: Change = {
      id: event.id,
      author: event.pubkey,
      createdAt: event.created_at,
      ts: tsAsWritten(event, line.ms),
      target,
      field: line.field,
      value: line.value,
      format: line.format,
      note: event.content,
      folder: line.folder,
    }
    if (line.stage) change.stage = line.stage
    if (line.about !== undefined) change.about = line.about
    held.push(change)
  }
  listed.set(file, held)
  return held
}
const listed = new WeakMap<ForeignObject, Change[]>()

/**
 * A counted change's `ts` tag as written, trusted or not, so every row of the
 * activity list means the same. The shared read's ordering time (`ms`) is that
 * number wherever a reader trusts it (SPEC §6.2), which is nearly every change;
 * the tags are read only when it is not.
 */
function tsAsWritten(event: SignedEvent, ms: number): number | undefined {
  if (ms !== event.created_at * 1000) return ms
  const raw = Number.parseInt(event.tags.find((t) => t[0] === 'ts')?.[1] ?? '', 10)
  return Number.isFinite(raw) ? raw : undefined
}
