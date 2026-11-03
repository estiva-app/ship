import type { ReadTopic, TopicConversation, TopicsRead } from '@estiva-app/interop'
import { topicAsDrawn } from '@/api/foreign'
import { ISSUE_STATUSES, PROJECT_STATUSES } from '@/nostr/kinds'
import { href } from '@/router'
import type { Archives } from './archive'
import { statusLabel } from './issues'
import { topicHref, topicInPeek } from './topicLinks'

/** One row on Ship's Topics (SHIPS-3), as Linear draws an initiative. */
export interface TopicRowData {
  address: string
  title: string
  /** The line under its name; absent, nothing is drawn there. */
  summary?: string
  /** Its page here (SHIPS-4): a route for `linkTo`. */
  href: string
  /** Its projects Completed, of all it lists, archived ones included (Linear's "2 / 10"). */
  projects: { done: number; total: number }
  /** Its conversations in Peek; `undefined` until they are read. */
  conversations?: number
  /** How many of them have something new for you: only on your own open topics, as Peek's dot. */
  fresh: number
}

export type TopicsTab = 'all' | 'yours' | 'others' | 'archived'

/** Ship's own projects and issues, by address, to judge what a topic lists. */
export interface TopicWork {
  projects: readonly { addr: string; status: string; deleted?: unknown }[]
  issues: readonly { addr: string }[]
}

const byTitle = (a: TopicRowData, b: TopicRowData) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/**
 * Which topics Ship's Topics draws on each tab (Miky, 2–3 Nov, SHIPS-3), each
 * A–Z. Never a space: Ship is project management, conversation is Peek's.
 * A topic is drawn when it lists a project or an issue Ship holds, archived and
 * done ones counting; one that lists none is on no tab. It is under Archived
 * when it is archived in Peek, and only then: a topic whose work is all
 * archived stays on its tab until somebody archives it, so Ship, Peek and Add
 * to topic agree (Miky, 3 Nov, on Widgets). `folder` keeps only the topics
 * filed in it.
 *
 * Its work is judged by Ship's own fold: a listed address Ship holds as a
 * project or an issue, so a row agrees with the project and issue pages.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-space-is-the-teams-own-mark-on-a-topic-it-lists.md
 */
export function topicsByTab(
  read: TopicsRead,
  work: TopicWork,
  conversations: ReadonlyMap<string, TopicConversation> | undefined,
  folder?: string,
): Record<TopicsTab, TopicRowData[]> {
  // A deleted project is in no list (SPEC §6.5): a topic listing only that is no row.
  const projects = new Map(work.projects.filter((project) => !project.deleted).map((project) => [project.addr, project]))
  const issues = new Set(work.issues.map((issue) => issue.addr))
  const lists: Record<TopicsTab, TopicRowData[]> = { all: [], yours: [], others: [], archived: [] }

  for (const topic of read.topics) {
    if (topic.space || (folder && topic.folder !== folder)) continue
    const listed = listedWork(topic, projects, issues)
    if (listed.length === 0) continue
    const drawn = topicAsDrawn(topic.address, topic.folder, topic.object)
    const conversation = conversations?.get(topic.address)
    const listedProjects = listed.filter((item) => item.project)
    const row: TopicRowData = {
      address: topic.address,
      title: drawn.title,
      // A file's summary is its subtitle slot, built in for every kind (SPEC §6.12).
      ...(topic.object.slots.subtitle?.value ? { summary: topic.object.slots.subtitle.value } : {}),
      href: topicHref(topic.address, drawn.title),
      projects: { done: listedProjects.filter((item) => item.project!.status === 'completed').length, total: listedProjects.length },
      ...(conversation ? { conversations: conversation.conversations } : {}),
      fresh: conversation?.fresh ?? 0,
    }
    if (drawn.archived) {
      lists.archived.push(row)
      continue
    }
    lists.all.push(row)
    lists[topic.yours ? 'yours' : 'others'].push(row)
  }
  for (const list of Object.values(lists)) list.sort(byTitle)
  return lists
}

/** The projects and issues a topic lists that Ship holds. */
function listedWork(topic: ReadTopic, projects: Map<string, { addr: string; status: string }>, issues: Set<string>) {
  return topic.listed.flatMap(({ address }): { project?: { status: string } }[] => {
    if (!address) return []
    const project = projects.get(address)
    if (project) return [{ project }]
    if (issues.has(address)) return [{ project: undefined }]
    return []
  })
}

/** A Leaf document's kind: what a topic's Documents lists (interop's `LISTED_FILE_KINDS`). */
export const DOCUMENT_KIND = 30842

const dOf = (address: string) => address.split(':')[2] ?? ''

/** The topic a `d` names in the read: none when no topic holds it, or two do (§13.1, as the hand-off reads it). */
export function topicOfD(read: TopicsRead, d: string): ReadTopic | undefined {
  const held = read.topics.filter((topic) => dOf(topic.address) === d)
  return held.length === 1 ? held[0] : undefined
}

/** One project or issue on a topic's page: a project with its issues done, an issue with its status and project. */
export interface TopicWorkRow {
  address: string
  kind: 'project' | 'issue'
  title: string
  href: string
  status: { value: string; label: string }
  /** A project's issues done of all, archived-with-it ones counting as its card counts them. */
  progress?: { done: number; total: number }
  /** An issue's project, by title. */
  project?: string
}

export interface TopicPageData {
  address: string
  title: string
  summary?: string
  folder: string
  archived: boolean
  /** "Conversation in Peek". */
  peekUrl?: string
  /** Its projects then its issues that are not archived, each in the order the topic lists them. */
  live: TopicWorkRow[]
  /** The archived ones, archived with their project or team as well as by themselves (FOL-46). */
  archivedWork: TopicWorkRow[]
  /** The Leaf documents it lists, by address, for one read of their titles. */
  documents: string[]
}

/** Ship's projects and issues, with what their rows say. */
export interface TopicPageWork {
  projects: readonly { addr: string; id: string; title: string; status: string; deleted?: unknown }[]
  issues: readonly { addr: string; id: string; title: string; status: string; projectAddr?: string }[]
}

/**
 * A topic's page (SHIPS-4, the approved story `TopicPage`): what it lists that
 * Ship holds as a project or an issue, projects first, split by archive; and
 * the Leaf documents it lists. Judged by Ship's own fold, as Topics is.
 */
export function topicPageOf(topic: ReadTopic, work: TopicPageWork, archives: Archives): TopicPageData {
  const drawn = topicAsDrawn(topic.address, topic.folder, topic.object)
  const projects = new Map(work.projects.filter((project) => !project.deleted).map((project) => [project.addr, project]))
  const issues = new Map(work.issues.map((issue) => [issue.addr, issue]))
  const rows: { row: TopicWorkRow; archived: boolean }[] = []
  const documents: string[] = []
  for (const { address } of topic.listed) {
    if (!address) continue
    const project = projects.get(address)
    const issue = issues.get(address)
    if (project) {
      const of = work.issues.filter((i) => {
        const archive = archives.ofIssue(i)
        return i.projectAddr === project.addr && (!archive || !!archive.with)
      })
      rows.push({
        archived: !!archives.ofProject(project.addr),
        row: {
          address,
          kind: 'project',
          title: project.title,
          href: href({ name: 'project', d: project.id, slug: project.title, view: 'table' }),
          status: { value: project.status, label: statusLabel(project.status, PROJECT_STATUSES) },
          progress: { done: of.filter((i) => i.status === 'done').length, total: of.length },
        },
      })
    } else if (issue) {
      const parent = issue.projectAddr ? projects.get(issue.projectAddr) : undefined
      rows.push({
        archived: !!archives.ofIssue(issue),
        row: {
          address,
          kind: 'issue',
          title: issue.title,
          href: href({ name: 'issue', d: issue.id, slug: issue.title }),
          status: { value: issue.status, label: statusLabel(issue.status, ISSUE_STATUSES) },
          ...(parent ? { project: parent.title } : {}),
        },
      })
    } else if (address.startsWith(`${DOCUMENT_KIND}:`)) documents.push(address)
  }
  const projectsFirst = (list: TopicWorkRow[]) => [...list.filter((row) => row.kind === 'project'), ...list.filter((row) => row.kind === 'issue')]
  const peekUrl = topicInPeek(topic.object.openUrl, topic.address, drawn.title)
  return {
    address: topic.address,
    title: drawn.title,
    ...(topic.object.slots.subtitle?.value ? { summary: topic.object.slots.subtitle.value } : {}),
    folder: topic.folder,
    archived: drawn.archived,
    ...(peekUrl ? { peekUrl } : {}),
    live: projectsFirst(rows.filter((item) => !item.archived).map((item) => item.row)),
    archivedWork: projectsFirst(rows.filter((item) => item.archived).map((item) => item.row)),
    documents,
  }
}
