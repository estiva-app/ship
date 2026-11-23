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
import { contentFormatOf, type SignedEvent } from '@estiva-app/protocol'
import { projectEvents, textOf, type ForeignObject } from '@estiva-app/interop'
import type { Issue, Project } from './fold'
import { DEFAULT_ISSUE_STATUS, DEFAULT_PROJECT_STATUS, KIND, projectStage } from './kinds'
import { manifestContent } from './manifest'

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
    }
  }
  const byNewest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt
  return { projects: projects.sort(byNewest), issues: issues.sort(byNewest), files }
}
