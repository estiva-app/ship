import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sidebar, type SidebarFolder, type SidebarProject } from './Sidebar'

/** Shaped like the local sandbox — invented projects, nothing real. */
const PROJECTS: SidebarProject[] = [
  { addr: '30850:a:des', title: 'Design System', href: '#/p/des', openCount: 9 },
  { addr: '30850:a:rel', title: 'Relay Migration', href: '#/p/rel', openCount: 6 },
  { addr: '30850:a:pay', title: 'Payment integration', href: '#/p/pay', openCount: 3 },
  { addr: '30850:a:onb', title: 'Onboarding flow for new workspaces', href: '#/p/onb', openCount: 0 },
  { addr: '30850:a:mob', title: 'Mobile app', href: '#/p/mob', openCount: 0 },
]

/** Folders as the sidebar sees them: a name and a link, and deliberately no count. */
const FOLDERS: SidebarFolder[] = [
  { id: '7b32200c-e4c0-4216-b79a-8490fc05e0bd', name: 'Onboarding', href: '#/folder/7b32200c-e4c0-4216-b79a-8490fc05e0bd' },
  { id: '0212db6d-bcbf-40d0-890e-f4f056db2f5d', name: 'Feedback on Ship', href: '#/folder/0212db6d-bcbf-40d0-890e-f4f056db2f5d' },
]

const meta = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  args: {
    openIssues: 18,
    issuesHref: '#/',
    projectsHref: '#/projects',
    projects: PROJECTS,
    current: 'issues',
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen bg-bg-base">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>

export default meta
type Story = StoryObj<typeof meta>

/** On the Issues list. Issues counts open issues; Projects counts active projects; a project row with no open issues shows no number. */
export const Issues: Story = {}

export const Projects: Story = { args: { current: 'projects' } }

/** A project route marks its own row, not the Projects entry. */
export const OnAProject: Story = { args: { current: { projectAddr: '30850:a:rel' } } }

/** A workspace with no active projects: no count on Projects, and no heading either. */
export const Empty: Story = { args: { openIssues: 0, projects: [] } }

/**
 * With Folders. They sit below the projects and carry **no count**, unlike
 * every other row here — a Folder holds files from apps Ship does not own, so
 * any number would be Ship's records only, which is a lie about a container
 * that also holds a topic.
 */
export const WithFolders: Story = { args: { folders: FOLDERS } }

/** A folder route marks its own row, and leaves the project rows alone. */
export const OnAFolder: Story = {
  args: { folders: FOLDERS, current: { folderId: '7b32200c-e4c0-4216-b79a-8490fc05e0bd' } },
}

/**
 * A Folder with no name falls back to its id.
 *
 * Not hypothetical: a Folder with no state event has only its channel's name,
 * and a channel created by an app rather than a person may carry none.
 */
export const FolderWithNoName: Story = {
  args: { folders: [{ id: '9c69f247-be6a-4ae7-9703-71cb971f5f93', href: '#/folder/9c69f247' }] },
}

/**
 * The first workspace read has not landed — SHI-20.
 *
 * Issues and Projects are real links and work already, so they are drawn;
 * their counts are absent rather than zero, because a zero would be a claim.
 * Where the project list will be, the rows say a list is coming without
 * pretending to know how long it is.
 *
 * The placeholder holds back 150ms, so a fast read never flashes it. That
 * cannot be seen in a static story — only that the shape is the row's.
 */
export const Loading: Story = { args: { openIssues: 0, projects: [], loading: true } }

/**
 * Loading, with Folders already in hand.
 *
 * Folders are read separately from the workspace, so they can arrive first.
 * The placeholder stands in for the projects only — a folder list that is
 * ready has nothing to wait for.
 */
export const LoadingWithFolders: Story = {
  args: { openIssues: 0, projects: [], loading: true, folders: FOLDERS },
}

/** The Folders have not landed yet, with the projects already in hand: the same placeholder rows, under their own heading. */
export const FoldersLoading: Story = { args: { folders: [], foldersLoading: true } }
