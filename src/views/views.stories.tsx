import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { Sidebar } from '@/components/Sidebar'
import { ACTIVITY, ARCHIVED_CARDS, PEOPLE, PROJECT_CARDS, PROJECT_STATUSES, SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { ACTIVITY_ITEMS, ANA, ISSUES, ISSUE_STATUSES, THREADS, hrefFor, makeIssues } from '@/fixtures/issues'
import type { ForeignObject } from '@/api/foreign'
import type { RelatedState } from '@/api/useRelated'
import { IssueView } from './IssueView'
import { IssuesView, type IssuesScope } from './IssuesView'
import { ProjectView } from './ProjectView'
import { ProjectsView } from './ProjectsView'

/**
 * A bare-file topic somebody started under the project in Peek — RFC 0.5
 * §10.7's Related section, with its comment count. The shape `readRelated`
 * hands the page; see `Related.stories` for the section's own states.
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
      appName: 'File',
      slots: { title: { value: 'Cut-over checklist' }, body: { value: 'What has to be true before the old read path is turned off.' } },
      meta: [],
      comments: [],
      parentRef: '30850:a:rel',
    } as unknown as ForeignObject,
  ],
  counts: { '30840:a:cutover': 7 },
}

/**
 * The four pages, composed from the reviewed parts and placed in the shell,
 * on invented data. What wiring (REW-3 step c) does is feed these the fold's
 * data instead of fixtures; the pages do not change.
 */
function Shell({ current, children }: { current: 'issues' | 'projects' | { projectAddr: string }; children: React.ReactNode }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={ANA} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<Sidebar openIssues={18} issuesHref="#/issues" projectsHref="#/projects" projects={SIDEBAR_PROJECTS} current={current} />}
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

/** The projects list: heading, Active / Archived tabs, the card grid. */
export const Projects: Story = {
  render: () => {
    const [showArchived, setShowArchived] = useState(false)
    return (
      <Shell current="projects">
        <ProjectsView active={PROJECT_CARDS} archived={ARCHIVED_CARDS} showArchived={showArchived} onShowArchived={setShowArchived} onAddProject={fn()} />
      </Shell>
    )
  },
}

/** No projects at all: the whole page is empty, so the empty state keeps its icon and its centre — the `page` manner (B18). */
export const ProjectsEmpty: Story = {
  render: () => {
    const [showArchived, setShowArchived] = useState(false)
    return (
      <Shell current="projects">
        <ProjectsView active={[]} archived={[]} showArchived={showArchived} onShowArchived={setShowArchived} onAddProject={fn()} />
      </Shell>
    )
  },
}

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

/** One project: title and description, Issues as a table or a board, Conversations, and the rail. */
export const Project: Story = {
  render: () => {
    const [view, setView] = useState<'table' | 'board'>('table')
    const [status, setStatus] = useState('in_progress')
    const [lead, setLead] = useState('ravi')
    const [title, setTitle] = useState('Relay Migration')
    const [description, setDescription] = useState('Moving every workspace read and write onto the relay, one surface at a time, with the old path kept until each is proven.')
    const done = ISSUES.filter((issue) => issue.status === 'done').length
    return (
      <Shell current={{ projectAddr: '30850:a:rel' }}>
        <ProjectView
          onAddIssue={fn()}
          crumbs={{ projectsHref: '#/projects', title }}
          header={{ title, description, descriptionFormat: 'marker', archived: false, onRename: (v) => (setTitle(v), true), onDescribe: (v) => (setDescription(v), true) }}
          view={view}
          onView={setView}
          issues={ISSUES}
          issueStatuses={ISSUE_STATUSES}
          hrefFor={hrefFor}
          related={RELATED}
          threads={THREADS}
          onStartConversation={fn()}
          onReply={fn()}
          activity={ACTIVITY_ITEMS}
          onReplyInActivity={fn()}
          rail={{
            status,
            statuses: PROJECT_STATUSES,
            onStatusChange: setStatus,
            lead,
            people: PEOPLE,
            onLeadChange: setLead,
            done,
            total: ISSUES.length,
            folder: '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34',
            onCopyFolderLink: fn(),
            onPairFolder: fn(),
            onArchive: fn(),
            onDelete: fn(),
          }}
        />
      </Shell>
    )
  },
}

/** One issue: the trail, editable title and description, Conversations, Activity, and the rail. */
export const Issue: Story = {
  render: () => {
    const issue = ISSUES[0]
    const [status, setStatus] = useState(issue.status)
    const [assignee, setAssignee] = useState('ana')
    const [project, setProject] = useState('rel')
    const [title, setTitle] = useState(issue.title)
    const [description, setDescription] = useState('After an archived project is restored, the board draws its columns in the order the folder union returned them rather than the vocabulary order.')
    return (
      <Shell current={{ projectAddr: '30850:a:rel' }}>
        <IssueView
          crumbs={{ issuesHref: '#/issues', project: { title: 'Relay Migration', href: '#/project/30850%3Aa%3Arel' }, ref: issue.ref }}
          title={title}
          description={description}
          descriptionFormat="marker"
          onRename={(v) => (setTitle(v), true)}
          onDescribe={(v) => (setDescription(v), true)}
          threads={THREADS}
          onStartConversation={fn()}
          onReply={fn()}
          activity={ACTIVITY_ITEMS}
          onReplyInActivity={fn()}
          history={ACTIVITY}
          rail={{
            status,
            statuses: ISSUE_STATUSES,
            onStatusChange: setStatus,
            assignee,
            people: PEOPLE,
            onAssigneeChange: setAssignee,
            project,
            projects: [{ value: '', label: 'No project' }, { value: 'des', label: 'Design System' }, { value: 'rel', label: 'Relay Migration' }],
            onProjectChange: setProject,
            openedBy: issue.openedBy,
            openedAt: issue.at,
            onCopyReference: fn(),
            onDelete: fn(),
          }}
        />
      </Shell>
    )
  },
}
