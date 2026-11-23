import { editedLabel } from '@/lib/time'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar, type SidebarEntry } from '@/components/ShipSidebar'
import { ACTIVITY, PEOPLE, PROJECT_STATUSES, PROJECT_TABS, SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { ACTIVITY_ITEMS, ANA, ISSUES, ISSUE_STATUSES, MARA, RAVI, THREADS, hrefFor, makeIssues } from '@/fixtures/issues'
import type { RelatedState } from '@/api/useRelated'
import { IssueView } from './IssueView'
import { IssuesView, type IssuesScope } from './IssuesView'
import { ProjectView } from './ProjectView'
import { ProjectsView, type ProjectsLayout } from './ProjectsView'
import { TopicsView } from './TopicsView'
import { TopicView, type TopicPageView, type TopicViewProps } from './TopicView'
import { ThreadListView } from '@/components/conversations/ThreadList'
import type { SidebarTopic, TopicRowData, TopicsTab } from '@/lib/topics'
import type { ProjectTab, ProjectsTab } from '@/router'
import { useSideColumn, type Side } from '@/pages/sideColumn'
import type { Imeta } from '@estiva-app/protocol'
import { ArchivedNotice } from '@estiva-app/ui'
import { archivedNoticeOf } from '@/lib/archive'
import { knowSpacesAmong } from '@/lib/topicLinks'
import type { TopicOfFile } from '@/api/foreign'
import { FileTopics } from '@/components/FileTopics'

/** Attach without a relay: the picked file, shown from the browser's own memory. */
const pretendUpload = async (file: File) => ({ url: URL.createObjectURL(file), m: file.type || 'application/octet-stream', x: '0'.repeat(64), size: file.size, filename: file.name }) as unknown as Imeta

/**
 * A bare-file topic somebody started under the project in Peek — RFC 0.5
 * §10.7's Related section, with its comment count. The shape `readRelated`
 * hands the page; see `Related.stories` for the section's own states.
 * Typed, not cast: every field the projection always carries is here, so a
 * missing one is a type error, not a story that throws (it had no `actions`,
 * which the kit's card reads).
 */
const RELATED: RelatedState = {
  inside: {},
  files: [
    {
      ref: '30840:a:cutover',
      address: '30840:a:cutover',
      eventId: 'e',
      kind: 30840,
      widget: 'card',
      appName: 'Peek',
      noun: 'topic',
      slots: { title: { value: 'Cut-over checklist' }, body: { value: 'What has to be true before the old read path is turned off.' } },
      meta: [],
      comments: [],
      actions: [],
      viaRecommendation: false,
      parentRef: '30850:a:rel',
    },
  ],
  counts: { '30840:a:cutover': 7 },
}

/**
 * The four pages, composed from the reviewed parts and placed in the shell,
 * on invented data. What wiring (REW-3 step c) does is feed these the fold's
 * data instead of fixtures; the pages do not change.
 */
/** Your five newest initiatives, as the sidebar draws them (TOPI-9). */
const SIDEBAR_TOPICS: SidebarTopic[] = [
  {
    id: `30840:${'a'.repeat(64)}:nav`,
    title: 'Cross-app navigation',
    href: '#/topic/nav',
    work: [
      { id: '30850:a:nav-ship', kind: 'project', title: 'Ship’s initiatives navigation', href: '#/project/nav-ship' },
      { id: '30851:a:nav-1', kind: 'issue', title: 'Explore initiatives opens its page', href: '#/issue/nav-1' },
    ],
  },
  { id: `30840:${'a'.repeat(64)}:speed`, title: 'Speed', href: '#/topic/speed', work: [] },
  { id: `30840:${'a'.repeat(64)}:triage`, title: 'Triage', href: '#/topic/triage', work: [] },
]

function Shell({ current, openTopic, children }: { current?: SidebarEntry; openTopic?: string; children: React.ReactNode }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={ANA} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<ShipSidebar openIssues={18} activeProjects={SIDEBAR_PROJECTS.length} hrefFor={(entry) => `#/${entry}`} {...(current ? { current: { entry: current } } : {})} {...(openTopic ? { openTopic } : {})} topics={SIDEBAR_TOPICS} />}
      >
        {children}
      </AppShell>
    </div>
  )
}

const meta = {
  // A page is a view placed in the shell (Katerina, 2026-09-09: a view alone
  // is under Views, a page in the shell under Pages).
  title: 'Pages/In the shell',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Projects in tabs by status, opening on Active as a table; the switch beside Add project shows cards (SHIPS-7). */
function ProjectsStory({ lists, firstLayout = 'table', folder }: { lists: Record<ProjectsTab, typeof PROJECT_TABS.all>; firstLayout?: ProjectsLayout; folder?: string }) {
  const [tab, setTab] = useState<ProjectsTab>('active')
  const [layout, setLayout] = useState<ProjectsLayout>(firstLayout)
  return (
    <Shell current="projects">
      <ProjectsView title={folder ? `${folder} · Projects` : 'Projects'} lists={lists} tab={tab} onTab={setTab} layout={layout} onLayout={setLayout} showFolder={!folder} onAddProject={fn()} />
    </Shell>
  )
}

export const Projects: Story = { render: () => <ProjectsStory lists={PROJECT_TABS} /> }

/** The same list as cards. */
export const ProjectsCards: Story = { render: () => <ProjectsStory lists={PROJECT_TABS} firstLayout="cards" /> }

/** A Folder's Projects: its name before the title, no Folder column. */
export const ProjectsInAFolder: Story = { render: () => <ProjectsStory lists={PROJECT_TABS} folder="Estiva HQ" /> }

/** No projects at all: every tab says so in one line. */
export const ProjectsEmpty: Story = { render: () => <ProjectsStory lists={{ all: [], planned: [], active: [], completed: [], archived: [] }} /> }

const HOUR = 3600
const NOW = Math.floor(Date.now() / 1000)
/** Who an initiative lists, by key: the row's faces are the first three. */
const CAST = ['ana', 'ravi', 'mara', 'sam', 'lee', 'kim', 'ola', 'ben', 'eve']
const FACES: Record<string, { name: string; picture?: string }> = { ana: ANA, ravi: RAVI, mara: MARA }
/** Faces from the profiles Ship knows; anyone else a dash, as Peek draws them. */
const faceOf = (key: string) => FACES[key] ?? { name: '—' }
const topicRow = (d: string, title: string, team: string, members: number, hoursAgo: number, yours: boolean, summary?: string, archived = false): TopicRowData => ({
  address: `30840:${'a'.repeat(64)}:${d}`,
  title,
  ...(summary ? { summary } : {}),
  href: `https://peek.estiva.app/topic/${d}`,
  team,
  members,
  people: CAST.slice(0, members),
  active: NOW - hoursAgo * HOUR,
  archived,
  yours,
})
// Newest activity first, as the sidebar's five.
const YOUR_TOPICS = [
  topicRow('nav', 'Cross-app navigation', 'Product', 4, 0.2, true, 'Teams and initiatives instead of Folders, in every app.'),
  topicRow('speed', 'Speed', 'Engineering', 3, 5, true, 'Every app opens in under a second on Miky’s workspace.'),
  topicRow('triage', 'Triage', 'Engineering', 2, 30, true),
]
const OTHER_TOPICS = [topicRow('brand', 'Brand refresh', 'Design', 2, 72, false, 'Lists no project or issue: Explore shows it anyway.')]
const TOPICS: Record<TopicsTab, TopicRowData[]> = {
  all: [OTHER_TOPICS[0], YOUR_TOPICS[0], YOUR_TOPICS[1], YOUR_TOPICS[2]],
  yours: YOUR_TOPICS,
  others: OTHER_TOPICS,
  archived: [topicRow('launch', 'Launch week', 'Company', 9, 400, false, undefined, true)],
}

/** Explore initiatives, which the sidebar's Explore initiatives opens (TOPI-9): a search, All / Your initiatives / Other initiatives / Archived opening on yours, newest first; the kit's list table with team, members' faces, last active, and Join on one you are not in. */
export const Topics: Story = {
  name: 'Explore initiatives',
  render: () => {
    const [tab, setTab] = useState<TopicsTab>('yours')
    return (
      <Shell current="topics">
        <TopicsView title="Explore initiatives" lists={TOPICS} tab={tab} onTab={setTab} onRetry={fn()} onJoin={fn()} faceOf={faceOf} />
      </Shell>
    )
  },
}

/** Other initiatives, where Join is. */
export const TopicsOthers: Story = {
  name: 'Explore initiatives: others',
  render: () => (
    <Shell current="topics">
      <TopicsView title="Explore initiatives" lists={TOPICS} tab="others" onTab={fn()} onRetry={fn()} onJoin={fn()} faceOf={faceOf} />
    </Shell>
  ),
}

/** A search that finds nothing says so, in the words asked. */
export const TopicsNoMatch: Story = {
  name: 'Explore initiatives: no match',
  render: () => (
    <Shell current="topics">
      <TopicsView title="Explore initiatives" lists={TOPICS} tab="all" onTab={fn()} onRetry={fn()} onJoin={fn()} query="zebra" />
    </Shell>
  ),
}

/** Explore initiatives while the read is out: skeleton rows in the list's place. */
export const TopicsLoading: Story = {
  name: 'Explore initiatives: loading',
  render: () => (
    <Shell current="topics">
      <TopicsView title="Explore initiatives" lists="loading" tab="yours" onTab={fn()} onRetry={fn()} onJoin={fn()} />
    </Shell>
  ),
}

/** The initiatives read failed: the page says so and offers Try again. */
export const TopicsFailed: Story = {
  name: 'Explore initiatives: failed',
  render: () => (
    <Shell current="topics">
      <TopicsView title="Explore initiatives" lists="failed" tab="yours" onTab={fn()} onRetry={fn()} onJoin={fn()} />
    </Shell>
  ),
}

/** The page as `Shell` draws it, with the conversation's column shown or hidden from its header. */
function InitiativeStory({ topic, documents = INITIATIVE_DOCUMENTS, files = INITIATIVE_FILES }: { topic: TopicViewProps['topic']; documents?: TopicViewProps['documents']; files?: TopicViewProps['files'] }) {
  const [shown, setShown] = useState(false)
  return (
    <Shell openTopic={SIDEBAR_TOPICS[0].id}>
      <TopicView
        topic={topic}
        documents={documents}
        files={files}
        onRetry={fn()}
        onRetryDocuments={fn()}
        topicsHref="#/topics"
        comments={{ shown, onShownChange: setShown }}
        conversation={<ThreadListView threads={THREADS} onStart={fn()} onReply={fn()} />}
        onCopyLink={fn()}
        peekUrl="https://peek.estiva.app/topic/cross-app-navigation"
      />
    </Shell>
  )
}

const INITIATIVE_DOCUMENTS: TopicViewProps['documents'] = [
  { address: '30842:a:brainstorm', title: 'Navigation brainstorm', href: 'https://leaf.estiva.app/document/brainstorm', edited: 'Mara, 2d ago', editor: MARA },
  {
    address: '30842:a:spec',
    title: 'Sidebar spec',
    href: 'https://leaf.estiva.app/document/spec',
    edited: 'Ana, 5h ago',
    editor: ANA,
    children: [{ address: '30842:a:spec-rows', title: 'Rows and folds', href: 'https://leaf.estiva.app/document/spec-rows', edited: 'Ana, 5h ago', editor: ANA }],
  },
]

/**
 * Another app's file it lists (A10): a Peek file, its type in Peek's own word. Peek still publishes "topic" for its
 * files (review of 23 November, A9), so that is what the line says until Peek republishes it.
 */
const INITIATIVE_FILES: TopicViewProps['files'] = [
  { address: '30840:a:sketches', title: 'Launch sketches', type: 'Topic', href: 'https://peek.estiva.app/topic/launch-sketches', edited: 'Ravi, 1d ago', editor: RAVI },
]

/** Now, in seconds, so the stories' When reads the same each day. */
const SECONDS_NOW = Math.floor(Date.now() / 1000)

const INITIATIVE: TopicPageView = {
  title: 'Cross-app navigation',
  summary: 'Teams and initiatives instead of Folders, in every app.',
  team: 'Product',
  teamId: '0212db6d-bcbf-40d0-890e-f4f056db2f5d',
  archived: false,
  // Who changed each last and when, in Ship's words (Katerina, 23 November: "if the who edited last is the current wording keep it").
  projects: PROJECT_TABS.all.slice(0, 3).map((project, i) => ({ ...project, changedAt: SECONDS_NOW - (i + 1) * 5 * 3600, changedLabel: editedLabel(['Ana Duarte', 'Ravi Mehta', 'Mara Sato'][i]!, SECONDS_NOW - (i + 1) * 5 * 3600) })),
  issues: [
    { address: '30851:a:nav-1', kind: 'issue', title: 'Explore initiatives opens its page', href: '#/issue/nav-1', status: { value: 'in_progress', label: 'In Progress' }, project: 'Relay Migration', edited: { by: 'a', at: SECONDS_NOW - 3600 }, editedLabel: editedLabel('Ana Duarte', SECONDS_NOW - 3600), assigneePerson: RAVI },
    { address: '30851:a:nav-2', kind: 'issue', title: 'The open file lights its team', href: '#/issue/nav-2', status: { value: 'todo', label: 'Todo' }, edited: { by: 'm', at: SECONDS_NOW - 3 * 86400 }, editedLabel: editedLabel('Mara Sato', SECONDS_NOW - 3 * 86400) },
  ],
  archivedWork: [
    { address: '30850:a:old', kind: 'project', title: 'Folders sidebar', href: '#/project/old', status: { value: 'completed', label: 'Completed' }, progress: { done: 6, total: 6 } },
    { address: '30851:a:old-1', kind: 'issue', title: 'Rename Folders to Teams', href: '#/issue/old-1', status: { value: 'done', label: 'Done' }, edited: { by: 'a', at: SECONDS_NOW - 14 * 86400 }, editedLabel: editedLabel('Ana Duarte', SECONDS_NOW - 14 * 86400) },
  ],
}

/**
 * An initiative's page (SHIPS-4; Katerina, 18 November, A4: direction A, "Peek's team-page look"): its name once, in
 * the header's trail, then its team as the one chip and Open into Peek (D4, D5), the conversation's button and the ⋯
 * (Copy link); its summary; Projects and Issues in the kit's list with their facts, no tabs; its Leaf documents, one
 * folding to its page; another app's file under Files, its type under its name; Archived shut at the end. Its row is lit
 * in the sidebar.
 */
export const Initiative: Story = { render: () => <InitiativeStory topic={INITIATIVE} /> }

/** An archived initiative: the kit's notice first, who archived it and when, said once. */
export const InitiativeArchived: Story = {
  name: 'Initiative: archived',
  render: () => <InitiativeStory topic={{ ...INITIATIVE, archived: true, archive: { by: 'Ana Duarte', when: '2d ago', resolution: 'Shipped in every app.' } }} />,
}

/** Everything it lists is archived: said in words, and Archived open. */
export const InitiativeAllArchived: Story = {
  name: 'Initiative: all archived',
  render: () => <InitiativeStory topic={{ ...INITIATIVE, projects: [], issues: [] }} documents={[]} files={[]} />,
}

/** It lists nothing yet. */
export const InitiativeEmpty: Story = {
  name: 'Initiative: empty',
  render: () => <InitiativeStory topic={{ ...INITIATIVE, projects: [], issues: [], archivedWork: [] }} documents={[]} files={[]} />,
}

/** The initiative is being read. */
export const InitiativeLoading: Story = { name: 'Initiative: loading', render: () => <InitiativeStory topic="loading" documents="loading" /> }

/** The initiative did not load: said, with Try again. */
export const InitiativeFailed: Story = { name: 'Initiative: failed', render: () => <InitiativeStory topic="failed" /> }

/** Its Leaf documents and other apps' files did not load: the rest of the page stands, and a line says so with Try again. */
export const InitiativeDocumentsFailed: Story = { name: 'Initiative: documents failed', render: () => <InitiativeStory topic={INITIATIVE} documents="failed" files={[]} /> }

/** Every issue in the workspace: All / Open / Assigned to me, grouped by status. Forty rows, so the page scrolls — in the frame's bar, not a native one. */
export const Issues: Story = {
  render: () => {
    const [scope, setScope] = useState<IssuesScope>('all')
    return (
      <Shell current="issues">
        <IssuesView issues={[...ISSUES, ...makeIssues(40)]} statuses={ISSUE_STATUSES} mine={new Set(['30851:a:1', '30851:a:4', '30851:a:7'])} scope={scope} onScope={setScope} hrefFor={hrefFor} onAddIssue={fn()} />
      </Shell>
    )
  },
}

/** No issues at all: the whole page is empty, so the state keeps its icon and its centre (B18). */
export const IssuesEmpty: Story = {
  render: () => {
    const [scope, setScope] = useState<IssuesScope>('all')
    return (
      <Shell current="issues">
        <IssuesView issues={[]} statuses={ISSUE_STATUSES} mine={new Set()} scope={scope} onScope={setScope} hrefFor={hrefFor} onAddIssue={fn()} />
      </Shell>
    )
  },
}

/** One project, in tabs: Overview (title, its fields, description, Related), Activity (Mentioned in), Issues (table or board). Its comments in the column beside, on every tab; the header's buttons hide it and hold the ⋯. */
/** FOL-46's notice, as the pages build it: archived by Miky two days ago, with a resolution. */
const ARCHIVED_AT = Math.floor(Date.now() / 1000) - 2 * 86400

/** The header's "Edited … ago" (ONE-6, step 4a), as the pages make it: who changed it last, and exactly when under the pointer. */
/** The team the story's project, and so its issues, are in: the one chip after the trail (Katerina, 18 November, D7). */
const STORY_TEAM = { id: '7b32200c-e4c0-4216-b79a-8490fc05e0bd', name: 'Estiva HQ' }
const STORY_EDITED = { label: 'Edited 5m ago', exact: 'Edited by Ana Duarte · Nov 2, 2026, 10:30 AM' }
const archivedNotice = (withProject?: boolean) => (
  <ArchivedNotice
    {...archivedNoticeOf(
      {
        by: 'a'.repeat(64),
        at: ARCHIVED_AT,
        resolution: 'Shipped as interop 0.37.0. The follow-ups are FOL-49 and FOL-50.',
        ...(withProject ? { with: { kind: 'project' as const, addr: '30850:a:rel', title: 'Relay Migration' } } : {}),
      },
      () => 'Miky',
    )}
    {...(withProject ? { onOpenParent: fn() } : { onUnarchive: fn() })}
  />
)

const topic = (d: string, title: string, archived = false): TopicOfFile => ({ address: `30840:${'a'.repeat(64)}:${d}`, folder: 'team', title, openUrl: `https://peek.estiva.app/topic/${d}`, archived })
const TOPIC_CHOICES = { yours: [topic('w', 'Widgets'), topic('r', 'Roadmap')], others: [topic('d', 'Design review'), topic('q', 'Q4 planning')] }

/** The topics that list a file (TOP-5), working: Add to topic and ✕ change the chips; an archived topic has no ✕. */
function StoryTopics({ start }: { start: TopicOfFile[] }) {
  const [topics, setTopics] = useState(start)
  return (
    <FileTopics
      topics={topics}
      busy={new Set()}
      onChange={(t, listed) => setTopics((held) => (listed ? [...held, t] : held.filter((h) => h.address !== t.address)).sort((a, b) => a.title.localeCompare(b.title)))}
      readChoices={async () => TOPIC_CHOICES}
    />
  )
}

const projectPage = (startTab: ProjectTab, startView: 'table' | 'board' = 'table', readOnlyReason?: string, archived = false, startSide: Side = 'comments'): Story => ({
  render: () => {
    const [tab, setTab] = useState<ProjectTab>(startTab)
    const [view, setView] = useState<'table' | 'board'>(startView)
    const [status, setStatus] = useState('in_progress')
    const [lead, setLead] = useState('ravi')
    const [title, setTitle] = useState('Relay Migration')
    const [summary, setSummary] = useState<string | undefined>('Every workspace read and write on the relay, one surface at a time.')
    const [description, setDescription] = useState('Moving every workspace read and write onto the relay, one surface at a time, with the old path kept until each is proven.')
    const done = ISSUES.filter((issue) => issue.status === 'done').length
    // The page's own: the comments or the Overview beside it, one at a time (ONE-6, step 4d).
    const side = useSideColumn(startSide)
    return (
      <Shell current="projects">
        <ProjectView
          edited={STORY_EDITED}
          {...(archived ? {} : { onAddIssue: fn() })}
          crumbs={{ projectsHref: '#/projects', title }}
          team={STORY_TEAM}
          header={{ title, summary, description, descriptionFormat: 'marker', archived, onRename: (v) => (setTitle(v), true), onSummarize: async (v) => (setSummary(v || undefined), true), onDescribe: (v) => (setDescription(v), true) }}
          tab={tab}
          onTab={setTab}
          view={view}
          onView={setView}
          issues={ISSUES}
          issueStatuses={ISSUE_STATUSES}
          hrefFor={hrefFor}
          related={RELATED}
          topics={<StoryTopics start={[]} />}
          threads={THREADS}
          onStartConversation={fn()}
          onReply={fn()}
          activity={ACTIVITY_ITEMS}
          history={ACTIVITY}
          readOnlyReason={readOnlyReason}
          upload={pretendUpload}
          archivedNotice={archived && archivedNotice()}
          lockedReason={archived ? 'Unarchive to edit' : undefined}
          fields={{
            status,
            statuses: PROJECT_STATUSES,
            onStatusChange: setStatus,
            lead,
            people: PEOPLE,
            onLeadChange: setLead,
            done,
            total: ISSUES.length,
          }}
          menu={{ archive: archived ? 'own' : 'none', onMove: fn(), onCopyLink: fn(), onArchive: fn(), onDelete: fn() }}
          comments={side.comments}
          overview={side.overview}
        />
      </Shell>
    )
  },
})

/** A project, Overview: the title, its fields and the description, always editable; its comments beside it. */
export const Project: Story = projectPage('overview')
/** A project with its Overview beside it, from the header's side-panel button (ONE-6, step 4d): Activity, History, Related. Hide it, and the comments come back. */
export const ProjectOverviewPanel: Story = projectPage('overview', 'table', undefined, false, 'overview')
/** A project, Issues: full width, Table / Board at the right of the tab row. */
export const ProjectIssues: Story = projectPage('issues')
/** A project's Issues as a board — `?view=board`. */
export const ProjectBoard: Story = projectPage('issues', 'board')
/** Signed out: the title and description are text, and every write control is disabled with the reason. */
export const ProjectSignedOut: Story = projectPage('overview', 'table', 'Sign in to react or reply.')
/** Archived (FOL-46): the notice first on every tab; the fields shut, saying why; the ⋯ holds Unarchive and Delete. */
export const ProjectArchived: Story = projectPage('overview', 'table', undefined, true)

/** One issue: its title, fields and description, and beside it its comments or its Overview; the header's buttons show and hide them, and hold the ⋯. */
const issuePage = (archivedWithProject = false, withSummary = true, newWhileHidden = false, startSide: Side = 'comments', onASpace = false): Story => ({
  render: () => {
    const issue = ISSUES[0]
    // A team's # topic among the topics that list it: the read of your topics says it is a space (FileTopics' other branch).
    if (onASpace) knowSpacesAmong([{ address: SPACE.address, space: true }])
    const [status, setStatus] = useState(issue.status)
    const [assignee, setAssignee] = useState('ana')
    const [project, setProject] = useState('rel')
    const [title, setTitle] = useState(issue.title)
    const [summary, setSummary] = useState(withSummary ? issue.summary : undefined)
    const [description, setDescription] = useState('After an archived project is restored, the board draws its columns in the order the folder union returned them rather than the vocabulary order.')
    const side = useSideColumn(newWhileHidden ? 'none' : startSide)
    return (
      <Shell current="projects">
        <IssueView
          edited={STORY_EDITED}
          crumbs={{ issuesHref: '#/issues', project: { title: 'Relay Migration', href: '#/project/30850%3Aa%3Arel' }, ref: issue.ref }}
          team={STORY_TEAM}
          title={title}
          summary={summary}
          onSummarize={async (v) => (setSummary(v || undefined), true)}
          description={description}
          descriptionFormat="marker"
          onRename={(v) => (setTitle(v), true)}
          onDescribe={(v) => (setDescription(v), true)}
          threads={THREADS}
          // A new comment in the hidden column (Katerina, 2 November): the header's button carries the dot.
          {...(newWhileHidden ? { stillUnread: { t2: [THREADS[1].root.id] } } : {})}
          onStartConversation={fn()}
          onReply={fn()}
          activity={ACTIVITY_ITEMS}
          history={ACTIVITY}
          topics={<StoryTopics start={onASpace ? [SPACE, topic('w', 'Widgets')] : [topic('w', 'Widgets'), topic('o', 'Old launch', true)]} />}
          upload={pretendUpload}
          archivedNotice={archivedWithProject && archivedNotice(true)}
          lockedReason={archivedWithProject ? 'Unarchive its project to edit' : undefined}
          fields={{
            status,
            statuses: ISSUE_STATUSES,
            onStatusChange: setStatus,
            assignee,
            people: PEOPLE,
            onAssigneeChange: setAssignee,
            project,
            projects: [{ value: '', label: 'No project' }, { value: 'des', label: 'Design System' }, { value: 'rel', label: 'Relay Migration' }],
            onProjectChange: setProject,
          }}
          menu={{ archive: archivedWithProject ? 'with' : 'none', onCopyLink: fn(), onArchive: fn(), onDelete: fn() }}
          comments={side.comments}
          overview={side.overview}
        />
      </Shell>
    )
  },
})

/** An issue: its summary under the title — click it to change it. */
export const Issue: Story = issuePage()
/** An issue with no summary: a quiet "Add a summary" under the title, for someone who can edit. */
export const IssueNoSummary: Story = issuePage(false, false)
/** An issue with its Overview beside it, from the header's side-panel button (ONE-6, step 4d): Activity, the mentions elsewhere, read-only; then History. */
export const IssueOverviewPanel: Story = issuePage(false, true, false, 'overview')
/** An issue archived with its project (FOL-46): the notice names the project and opens it. */
export const IssueArchivedWithProject: Story = issuePage(true)
/** The comments hidden, with a new one among them: the kit's dot on the header's "Show comments" (Katerina, 3 November). */
export const IssueCommentsHiddenWithNew: Story = issuePage(false, true, true)

/** A team's # topic that lists the issue: a space, opening Peek beside Ship. */
const SPACE = topic('bugs', 'Bugs')

/**
 * An issue a team's # topic lists, beside an initiative that lists it (review of 23 November, E4): its Overview's
 * Initiatives line as the app draws it today, the # topic's chip opening Peek. Whether a # topic belongs in this line,
 * and what it wears, waits on Katerina (A1).
 */
export const IssueOnATopic: Story = { name: 'Issue: listed on a # topic', ...issuePage(false, true, false, 'overview', true) }
