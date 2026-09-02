import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { Sidebar } from '@/components/Sidebar'
import { ACTIVITY, ARCHIVED_CARDS, PEOPLE, PROJECT_CARDS, PROJECT_STATUSES, SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { ANA, ISSUES, ISSUE_STATUSES, THREADS, hrefFor } from '@/fixtures/issues'
import { IssueView } from './IssueView'
import { IssuesView, type IssuesScope } from './IssuesView'
import { ProjectView } from './ProjectView'
import { ProjectsView } from './ProjectsView'

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
  title: 'Views/Pages',
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

/** Every issue in the workspace: All / Open / Assigned to me, grouped by status. */
export const Issues: Story = {
  render: () => {
    const [scope, setScope] = useState<IssuesScope>('all')
    return (
      <Shell current="issues">
        <IssuesView issues={ISSUES} statuses={ISSUE_STATUSES} mine={new Set(['30851:a:1', '30851:a:4', '30851:a:7'])} scope={scope} onScope={setScope} hrefFor={hrefFor} onAddIssue={fn()} />
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
          header={{ title, description, archived: false, onRename: (v) => (setTitle(v), true), onDescribe: (v) => (setDescription(v), true) }}
          view={view}
          onView={setView}
          issues={ISSUES}
          issueStatuses={ISSUE_STATUSES}
          hrefFor={hrefFor}
          threads={THREADS}
          onStartConversation={fn()}
          onReply={fn()}
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
          onRename={(v) => (setTitle(v), true)}
          onDescribe={(v) => (setDescription(v), true)}
          threads={THREADS}
          onStartConversation={fn()}
          onReply={fn()}
          activity={ACTIVITY}
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
