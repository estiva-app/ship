import { byActivity, type ReadTopic, type TopicsRead } from '@estiva-app/interop'
import { topicAsDrawn } from '@/api/foreign'
import { ISSUE_STATUSES, lookupStatus, progressOf, projectStatus } from '@/nostr/kinds'
import { href } from '@/router'
import type { Archives } from './archive'
import { statusLabel } from './issues'
import { topicHref, topicInPeek } from './topicLinks'

/** One row on Ship's Topics, which is Explore topics (TOPI-9): the same columns in every app. */
export interface TopicRowData {
  address: string
  title: string
  /** The line under its name; absent, nothing is drawn there. */
  summary?: string
  /** Its page here (SHIPS-4): a route for `linkTo`. */
  href: string
  /** Its team's name; absent until the teams are read. */
  team?: string
  /** How many people it lists (record a-place-lists-who-chose-a-level-and-its-teams-members); `undefined` until read. */
  members?: number
  /** When anything last happened in it, Unix seconds (the shared rule, TOPI-10); `undefined` until read. */
  active?: number
  archived: boolean
  /** You are in it: no Join on it. */
  yours: boolean
}

export type TopicsTab = 'all' | 'yours' | 'others' | 'archived'

/** What the rows draw beside the topics read: each read on its own, `undefined` until it lands. */
export interface TopicFacts {
  /** Each topic's newest activity (interop's `readTopicActivity`). */
  at?: ReadonlyMap<string, number>
  /** `undefined` for a topic whose people could not be judged. */
  members?: ReadonlyMap<string, number | undefined>
  /** A team's name, by its id. */
  teamName?: (id: string) => string | undefined
}

const byTitle = (a: TopicRowData, b: TopicRowData) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/**
 * Whether a topic is yours, for the sidebar's five and the Your topics tab
 * alike: you follow it by the shared fold (interop's `following.in`: made,
 * joined, added or a level chosen since your last leave; writing in one is not
 * following it), it is not archived, and you did not mute it, as Peek's switch
 * shows a mute as Not following (`muted`, your `estiva:muted:v1`; until it is
 * read, nothing is taken out). Peek's column leaves out the same two, so the
 * two apps' orders agree.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/writing-in-a-place-never-follows-it.md
 */
const isYours = (topic: ReadTopic, archived: boolean, muted?: ReadonlySet<string>) => topic.yours && !archived && !muted?.has(topic.address)

/**
 * Which topics Ship's Topics draws on each tab: every topic you can open
 * (TOPI-9; Miky, 6 Nov — also those listing no project or issue), never a
 * space: Ship is project management, conversation is Peek's. It is under
 * Archived when it is archived in Peek, and only then. `folder` keeps only the
 * topics filed in it.
 *
 * Your topics come newest activity first, the order of the sidebar's five and
 * of Peek's list (`byActivity`); All, Other topics and Archived A to Z. Your
 * topics' order needs `facts.at`; without it they are A to Z too.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-space-is-the-teams-own-mark-on-a-topic-it-lists.md
 */
export function topicsByTab(read: TopicsRead, facts: TopicFacts = {}, folder?: string, muted?: ReadonlySet<string>): Record<TopicsTab, TopicRowData[]> {
  const lists: Record<TopicsTab, TopicRowData[]> = { all: [], yours: [], others: [], archived: [] }

  for (const topic of read.topics) {
    if (topic.space || (folder && topic.folder !== folder)) continue
    const drawn = topicAsDrawn(topic.address, topic.folder, topic.object)
    const team = facts.teamName?.(topic.folder)
    const members = facts.members?.get(topic.address)
    const active = facts.at?.get(topic.address)
    const yours = isYours(topic, drawn.archived, muted)
    const row: TopicRowData = {
      address: topic.address,
      title: drawn.title,
      // A file's summary is its subtitle slot, built in for every kind (SPEC §6.12).
      ...(topic.object.slots.subtitle?.value ? { summary: topic.object.slots.subtitle.value } : {}),
      href: topicHref(topic.address, drawn.title),
      ...(team ? { team } : {}),
      ...(members !== undefined ? { members } : {}),
      ...(active ? { active } : {}),
      archived: drawn.archived,
      yours: topic.yours && !muted?.has(topic.address),
    }
    if (drawn.archived) {
      lists.archived.push(row)
      continue
    }
    lists.all.push(row)
    lists[yours ? 'yours' : 'others'].push(row)
  }
  for (const list of Object.values(lists)) list.sort(byTitle)
  if (facts.at) {
    const newest = byActivity(facts.at)
    lists.yours.sort((a, b) => newest(a.address, b.address))
  }
  return lists
}

/** The topics yours by {@link isYours}, by address: what the sidebar and Your topics order. */
export function yourTopics(read: TopicsRead, muted?: ReadonlySet<string>): string[] {
  return read.topics
    .filter((topic) => !topic.space && isYours(topic, topicAsDrawn(topic.address, topic.folder, topic.object).archived, muted))
    .map((topic) => topic.address)
}

/** One of your topics in the sidebar: its page, and the projects and issues it lists, in its page's order. */
export interface SidebarTopic {
  /** Its address. */
  id: string
  title: string
  href: string
  work: { id: string; kind: 'project' | 'issue'; title: string; href: string }[]
}

/** How many of your topics the sidebar shows; the rest are on Explore topics, under Your topics (Miky, 6 Nov). */
export const TOPICS_SHOWN = 5

/**
 * The sidebar's topics (TOPI-9): your five newest, by the same rule and the
 * same "yours" as the Your topics tab, each with what its page lists that is
 * not archived, projects then issues, each in the order the topic lists them
 * ({@link topicPageOf}): the topic's one arranged order (TOPI-5).
 */
export function sidebarTopicsOf(read: TopicsRead, at: ReadonlyMap<string, number>, work: TopicPageWork, archives: Archives, muted?: ReadonlySet<string>): SidebarTopic[] {
  const newest = byActivity(at)
  const byAddress = new Map(read.topics.map((topic) => [topic.address, topic]))
  return yourTopics(read, muted)
    .sort(newest)
    .slice(0, TOPICS_SHOWN)
    .map((address) => {
      const page = topicPageOf(byAddress.get(address)!, work, archives)
      return {
        id: address,
        title: page.title,
        href: topicHref(address, page.title),
        work: page.live.map((row) => ({ id: row.address, kind: row.kind, title: row.title, href: row.href })),
      }
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
          status: (({ value, label }) => ({ value, label }))(projectStatus(project.status)),
          progress: progressOf(of.map((i) => i.status), (value) => lookupStatus(ISSUE_STATUSES, value)),
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
