import type { ReadTopic, TopicConversation, TopicsRead } from '@estiva-app/interop'
import { topicAsDrawn } from '@/api/foreign'

/** One row on Ship's Topics (SHIPS-3), as Linear draws an initiative. */
export interface TopicRowData {
  address: string
  title: string
  /** The line under its name; absent, nothing is drawn there. */
  summary?: string
  /** Where it opens: Peek, as its manifest says, until a topic has its page in Ship (SHIPS-4). */
  href?: string
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
  projects: readonly { addr: string; status: string }[]
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
  const projects = new Map(work.projects.map((project) => [project.addr, project]))
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
      ...(drawn.openUrl ? { href: drawn.openUrl } : {}),
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
