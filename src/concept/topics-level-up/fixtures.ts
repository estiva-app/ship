import type { ThreadData } from '@/components/ConversationThread'
import type { WorkspacePerson } from '@/components/PageFields'
import type { ProjectRowData } from '@/lib/projects'
import type { TopicRowData, TopicWorkRow } from '@/lib/topics'

/**
 * The data behind Ship's stories of "Topics: level up the topic experience" (prototype only; this branch never
 * merges). Real topic names from Estiva HQ, invented contents: the spec's `fixtures.ts` (estiva-ui
 * `concept/topics-level-up`), in the shapes Ship's own views take. A topic's `at` is when anything last happened in
 * it, in minutes ago (a message by anyone, the agent's too, a file added, a save, status or comment on a file it
 * lists): the order the sidebar and "Your topics" sort by.
 */

export type Who = 'miky' | 'katerina' | 'agent'
const NAMES: Record<Who, string> = { miky: 'Miky', katerina: 'Katerina Kelepouri', agent: 'Estiva agent' }
export const personOf = (who: Who) => ({ name: NAMES[who], ...(who === 'agent' ? { bot: true } : {}) })
/** The people as Ship's pickers and the Members dialog take them; the key is the person's word here. */
export const PEOPLE: WorkspacePerson[] = (Object.keys(NAMES) as Who[]).map((who) => ({ value: who, ...personOf(who) }))
const first = (who: Who) => (who === 'agent' ? NAMES.agent : NAMES[who].split(' ')[0])

const NOW = Math.floor(Date.now() / 1000)

type Kind = 'project' | 'issue' | 'file'
interface File {
  id: string
  kind: Kind
  title: string
  status?: { value: string; label: string }
  lead?: Who
  /** When it last changed, in Ship's words, and who changed it. */
  edited: string
  editedBy: Who
  children?: string[]
  archived?: boolean
  progress?: { done: number; total: number }
  /** An issue's project, by title. */
  project?: string
}

const S = {
  progress: { value: 'in_progress', label: 'In Progress' },
  planned: { value: 'planned', label: 'Planned' },
  completed: { value: 'completed', label: 'Completed' },
  todo: { value: 'todo', label: 'Todo' },
}

const FILES: File[] = [
  { id: 'w2b2', kind: 'project', title: 'Widgets 2: build 2', status: S.progress, lead: 'miky', edited: '20m ago', editedBy: 'agent', progress: { done: 3, total: 7 } },
  { id: 'spec', kind: 'file', title: 'Widgets spec', edited: '2h ago', editedBy: 'katerina', children: ['row', 'card'] },
  { id: 'row', kind: 'file', title: 'Row widget', edited: 'Yesterday', editedBy: 'katerina' },
  { id: 'card', kind: 'file', title: 'Card widget', edited: 'Tue', editedBy: 'miky' },
  { id: 'status', kind: 'issue', title: 'Card widget draws status and lead', status: S.todo, lead: 'agent', edited: '1h ago', editedBy: 'agent', project: 'Widgets 2: build 2' },
  { id: 'w2b1', kind: 'project', title: 'Widgets 2: build 1', status: S.completed, lead: 'miky', edited: 'Mon', editedBy: 'miky', progress: { done: 6, total: 6 } },
  { id: 'sketch', kind: 'file', title: 'Widget sketches', edited: 'Mon', editedBy: 'katerina' },
  { id: 'w3', kind: 'project', title: 'Widgets 3', status: S.planned, lead: 'katerina', edited: 'Mon', editedBy: 'katerina', progress: { done: 0, total: 4 } },
  { id: 'v0', kind: 'file', title: 'Widgets v0 notes', edited: '12 Oct', editedBy: 'miky', archived: true },
  { id: 'pickers', kind: 'project', title: 'Widget pickers', status: S.completed, lead: 'agent', edited: '20 Oct', editedBy: 'agent', archived: true, progress: { done: 5, total: 5 } },
  { id: 'fixcard', kind: 'issue', title: 'Card widget clips a long title', status: S.progress, lead: 'katerina', edited: '3h ago', editedBy: 'katerina' },
  // Other topics' files, for the sidebar's folds.
  { id: 'speed', kind: 'project', title: 'Peek opens instantly', status: S.progress, lead: 'agent', edited: '2m ago', editedBy: 'agent', progress: { done: 4, total: 9 } },
  { id: 'speedkit', kind: 'file', title: 'Speed kit', edited: 'Yesterday', editedBy: 'agent' },
  { id: 'level', kind: 'project', title: 'Topics: level up the topic experience', status: S.progress, lead: 'miky', edited: '20m ago', editedBy: 'miky', progress: { done: 1, total: 8 } },
  { id: 'proto', kind: 'issue', title: 'Topics level-up, prototyped', status: S.progress, lead: 'agent', edited: '20m ago', editedBy: 'agent' },
  { id: 'navdoc', kind: 'file', title: 'Navigation notes', edited: '3h ago', editedBy: 'miky' },
  { id: 'suits', kind: 'file', title: 'Estiva Suits Update, 6 Nov', edited: 'Yesterday', editedBy: 'agent' },
  { id: 'onb', kind: 'file', title: 'Onboarding checklist', edited: 'Tue', editedBy: 'katerina' },
  { id: 'price', kind: 'file', title: 'Pricing draft', edited: 'Last week', editedBy: 'miky' },
]
const fileOf = (id: string) => FILES.find((f) => f.id === id)!

export interface Topic {
  id: string
  title: string
  summary?: string
  team: string
  members: Who[]
  at: number
  atLabel: string
  archived?: boolean
  /** What it lists, in the topic's order. */
  files: string[]
}

const t = (id: string, title: string, at: number, atLabel: string, files: string[], extra: Partial<Topic> = {}): Topic => ({ id, title, team: 'Company', members: ['miky', 'katerina', 'agent'], at, atLabel, files, ...extra })

export const TOPICS: Topic[] = [
  t('fast', 'Peek, Ship and Leaf are fast', 2, '2m ago', ['speed', 'speedkit'], { summary: 'Every app opens in under a second on Miky’s workspace.', team: 'Engineering', members: ['miky', 'agent'] }),
  t('level', 'Topics level-up', 20, '20m ago', ['level', 'proto']),
  t('widgets', 'Widgets', 60, '1h ago', ['w2b2', 'spec', 'status', 'w2b1', 'sketch', 'fixcard', 'w3', 'v0', 'pickers'], { summary: 'One way to draw a file inside another, in every app.' }),
  t('nav', 'Universal Navigation', 180, '3h ago', ['navdoc']),
  t('suits', 'Estiva Suits Update', 1440, 'Yesterday', ['suits'], { members: ['miky', 'agent'] }),
  t('onb', 'Onboarding', 4000, 'Tue', ['onb'], { team: 'Design' }),
  t('price', 'Pricing', 9000, 'Last week', ['price'], { members: ['miky'] }),
  t('hiring', 'Hiring', 300, '5h ago', [], { members: ['katerina'], summary: 'Who we look for next.' }),
  t('brand', 'Brand refresh', 2000, 'Mon', [], { members: ['katerina'], team: 'Design', summary: 'Logo, colours and the site.' }),
  t('interviews', 'Customer interviews', 6000, 'Last week', [], { members: [], summary: 'What five companies told us.' }),
  t('comments', 'Comments everywhere', 30000, '17 Oct', ['w2b1'], { archived: true, summary: 'One comment box in Peek, Ship and Leaf.' }),
  t('signin', 'Stay signed in', 40000, '19 Oct', [], { archived: true }),
]
export const topicOf = (id: string) => TOPICS.find((x) => x.id === id)!

/** Your topics, newest activity first: the sidebar's order, and the Topics page's "Your topics". */
export const yourTopics = (who: Who, topics: Topic[] = TOPICS) => topics.filter((x) => !x.archived && x.members.includes(who)).sort((a, b) => a.at - b.at)
/** Which topics a person can open: theirs, and every topic in the Company team. Engineering's are its members' only. */
export const canOpen = (who: Who, topic: Topic) => topic.members.includes(who) || topic.team === 'Company' || topic.team === 'Design'

export const topicHref = (id: string) => `#/topic/${id}`
export const fileHref = (id: string) => `#/file/${id}`
export const EXPLORE_HREF = '#/topics'

/** The sidebar's rows: your topics, newest first, each with the projects and issues it lists, in its order. */
export interface SidebarTopicData {
  id: string
  title: string
  href: string
  work: { id: string; kind: 'project' | 'issue'; title: string; href: string }[]
}
export const sidebarTopics = (who: Who, topics: Topic[] = TOPICS): SidebarTopicData[] =>
  yourTopics(who, topics).map((topic) => ({
    id: topic.id,
    title: topic.title,
    href: topicHref(topic.id),
    work: topic.files
      .map(fileOf)
      .filter((f) => !f.archived && f.kind !== 'file')
      .map((f) => ({ id: f.id, kind: f.kind as 'project' | 'issue', title: f.title, href: fileHref(f.id) })),
  }))

/** A row on Ship's Topics page, with whether it is yours (Join on one that is not). */
export interface ExploreRowData extends TopicRowData {
  id: string
  yours: boolean
}
const rowOf = (who: Who) => (topic: Topic): ExploreRowData => {
  const projects = topic.files.map(fileOf).filter((f) => f.kind === 'project')
  return {
    id: topic.id,
    address: `30840:${'a'.repeat(64)}:${topic.id}`,
    title: topic.title,
    ...(topic.summary ? { summary: topic.summary } : {}),
    href: topicHref(topic.id),
    projects: { done: projects.filter((f) => f.status?.value === 'completed').length, total: projects.length },
    conversations: topic.files.length + 2,
    fresh: topic.id === 'level' ? 1 : 0,
    yours: topic.members.includes(who),
  }
}
const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/** The Topics page's four tabs: All, Other topics and Archived A to Z; Your topics in the sidebar's order. */
export const exploreLists = (who: Who, topics: Topic[] = TOPICS) => {
  const live = topics.filter((x) => !x.archived && canOpen(who, x))
  return {
    all: [...live].sort(byTitle).map(rowOf(who)),
    yours: yourTopics(who, topics).map(rowOf(who)),
    others: live.filter((x) => !x.members.includes(who)).sort(byTitle).map(rowOf(who)),
    archived: topics.filter((x) => x.archived).sort(byTitle).map(rowOf(who)),
  }
}

/** One issue on a topic's page: today's row, with who edited it last and when. */
export type TopicIssue = TopicWorkRow & { edited: string }
/** One document on a topic's page: who edited it last and when, and its child pages. */
export interface TopicDocumentData {
  address: string
  title: string
  href?: string
  edited: string
  children?: TopicDocumentData[]
}
/** What Ship's topic page draws: the topic, then its projects, issues and documents, each kind in the topic's order. */
export interface TopicPageFixture {
  title: string
  summary?: string
  team: string
  archived: boolean
  member: boolean
  members: Who[]
  projects: ProjectRowData[]
  issues: TopicIssue[]
  documents: TopicDocumentData[]
  /** Archived projects and issues, behind "Archived · N", as today; an archived document is left out, as today. */
  archivedWork: TopicWorkRow[]
}

const editedOf = (f: File) => `${first(f.editedBy)}, ${f.edited}`
const docOf = (f: File): TopicDocumentData => ({
  address: `30842:a:${f.id}`,
  title: f.title,
  href: `https://leaf.estiva.app/document/${f.id}`,
  edited: editedOf(f),
  ...(f.children ? { children: f.children.map((id) => docOf(fileOf(id))) } : {}),
})

export function topicPage(id: string, who: Who, topics: Topic[] = TOPICS): TopicPageFixture {
  const topic = topics.find((x) => x.id === id)!
  const files = topic.files.map(fileOf)
  const live = files.filter((f) => !f.archived)
  return {
    title: topic.title,
    ...(topic.summary ? { summary: topic.summary } : {}),
    team: topic.team,
    archived: !!topic.archived,
    member: topic.members.includes(who),
    members: topic.members,
    projects: live
      .filter((f) => f.kind === 'project')
      .map((f) => ({ addr: `30850:a:${f.id}`, href: fileHref(f.id), title: f.title, status: f.status!, ...(f.lead ? { lead: personOf(f.lead) } : {}), progress: f.progress ?? { done: 0, total: 0 }, archived: false })),
    issues: live.filter((f) => f.kind === 'issue').map((f) => ({ address: `30851:a:${f.id}`, kind: 'issue' as const, title: f.title, href: fileHref(f.id), ...(f.project ? { project: f.project } : {}), status: f.status!, edited: editedOf(f) })),
    documents: live.filter((f) => f.kind === 'file').map(docOf),
    archivedWork: files
      .filter((f) => f.archived && f.kind !== 'file')
      .map((f) => ({ address: `a:${f.id}`, kind: f.kind as 'project' | 'issue', title: f.title, href: fileHref(f.id), status: f.status!, ...(f.progress ? { progress: f.progress } : {}) })),
  }
}

/** The topic's conversation, as Peek holds it: the same messages, shown in Ship's comment column. */
export const TOPIC_THREADS: ThreadData[] = [
  {
    id: 'c1',
    root: { id: 'c1m', author: personOf('katerina'), at: NOW - 3600 * 2, body: 'Card widget sketches are in. Status and lead on the card, the rest in the row.' },
    replies: [
      { id: 'c1r1', author: personOf('miky'), at: NOW - 3600 * 1.5, body: 'Looks right. Progress on the card too?' },
      { id: 'c1r2', author: personOf('katerina'), at: NOW - 3600, body: 'Yes, under the title.' },
    ],
  },
  {
    id: 'c2',
    root: { id: 'c2m', author: personOf('agent'), at: NOW - 40 * 60, body: 'Build 2 picks them up: the card draws status and lead from this week.' },
    replies: [],
  },
]

/** Any other topic's conversation: one message. */
export const OTHER_THREADS: ThreadData[] = [
  { id: 'o1', root: { id: 'o1m', author: personOf('miky'), at: NOW - 3600 * 5, body: 'The latest is in the document. Say here if anything is missing.' }, replies: [] },
]
