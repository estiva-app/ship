import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar } from '@/components/ShipSidebar'
import { ACTIVITY, ARCHIVED_CARDS, PEOPLE, PROJECT_CARDS, PROJECT_STATUSES, SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { ACTIVITY_ITEMS, ANA, ISSUES, ISSUE_STATUSES, THREADS, hrefFor, makeIssues } from '@/fixtures/issues'
import type { RelatedState } from '@/api/useRelated'
import { IssueView } from './IssueView'
import { IssuesView, type IssuesScope } from './IssuesView'
import { ProjectView } from './ProjectView'
import { ProjectsView } from './ProjectsView'
import type { ProjectTab } from '@/router'
import { useSideColumn, type Side } from '@/pages/sideColumn'
import type { Imeta } from '@estiva-app/protocol'
import { ArchivedNotice } from '@estiva-app/ui'
import { archivedNoticeOf } from '@/lib/archive'

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
function Shell({ current, children }: { current: 'issues' | 'projects' | { projectAddr: string }; children: React.ReactNode }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={ANA} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<ShipSidebar openIssues={18} issuesHref="#/issues" projectsHref="#/projects" projects={SIDEBAR_PROJECTS} current={current} />}
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

/** One project, in tabs: Overview (title, its fields, description, Related), Activity (Mentioned in), Issues (table or board). Its comments in the column beside, on every tab; the header's buttons hide it and hold the ⋯. */
/** FOL-46's notice, as the pages build it: archived by Miky two days ago, with a resolution. */
const ARCHIVED_AT = Math.floor(Date.now() / 1000) - 2 * 86400

/** The header's "Edited … ago" (ONE-6, step 4a), as the pages make it: who changed it last, and exactly when under the pointer. */
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
      <Shell current={{ projectAddr: '30850:a:rel' }}>
        <ProjectView
          edited={STORY_EDITED}
          {...(archived ? {} : { onAddIssue: fn() })}
          crumbs={{ projectsHref: '#/projects', title }}
          header={{ title, summary, description, descriptionFormat: 'marker', archived, onRename: (v) => (setTitle(v), true), onSummarize: async (v) => (setSummary(v || undefined), true), onDescribe: (v) => (setDescription(v), true) }}
          tab={tab}
          onTab={setTab}
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
const issuePage = (archivedWithProject = false, withSummary = true, newWhileHidden = false, startSide: Side = 'comments'): Story => ({
  render: () => {
    const issue = ISSUES[0]
    const [status, setStatus] = useState(issue.status)
    const [assignee, setAssignee] = useState('ana')
    const [project, setProject] = useState('rel')
    const [title, setTitle] = useState(issue.title)
    const [summary, setSummary] = useState(withSummary ? issue.summary : undefined)
    const [description, setDescription] = useState('After an archived project is restored, the board draws its columns in the order the folder union returned them rather than the vocabulary order.')
    const side = useSideColumn(newWhileHidden ? 'none' : startSide)
    return (
      <Shell current={{ projectAddr: '30850:a:rel' }}>
        <IssueView
          edited={STORY_EDITED}
          crumbs={{ issuesHref: '#/issues', project: { title: 'Relay Migration', href: '#/project/30850%3Aa%3Arel' }, ref: issue.ref }}
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
