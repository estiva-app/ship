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

/**
 * The teams as the sidebar sees them: a name, what the team's state lists
 * (FOL-5), and deliberately no count. A state lists topics too; the sidebar
 * draws only the projects it holds.
 */
const FOLDERS: SidebarFolder[] = [
  { id: '7b32200c-e4c0-4216-b79a-8490fc05e0bd', name: 'Ship', addresses: ['30850:a:rel', '30850:a:pay', '39000:r:ship-talk'] },
  { id: '0212db6d-bcbf-40d0-890e-f4f056db2f5d', name: 'Estiva HQ', addresses: ['30850:a:des', '30850:a:onb'] },
]
/** The same projects, each with its own Folder; the last one in no team. */
const FILED: SidebarProject[] = [
  { ...PROJECTS[0]!, folder: '0212db6d-bcbf-40d0-890e-f4f056db2f5d' },
  { ...PROJECTS[1]!, folder: '7b32200c-e4c0-4216-b79a-8490fc05e0bd' },
  { ...PROJECTS[2]!, folder: '7b32200c-e4c0-4216-b79a-8490fc05e0bd' },
  { ...PROJECTS[3]!, folder: '0212db6d-bcbf-40d0-890e-f4f056db2f5d' },
  PROJECTS[4]!,
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
 * With teams (SHI-25): one fold per top-level Folder, the projects its state
 * lists as the rows (FOL-5), and a project in no team under "Not in a team"
 * after them — not a fold named like a Folder, because it is not one. A
 * team carries **no count**, unlike every other row here — a Folder holds
 * files from apps Ship does not own, so any number would be Ship's records
 * only, which is a lie about a container that also holds a topic.
 */
export const WithFolders: Story = { args: { folders: FOLDERS, projects: FILED, onOpenFolder: () => {} } }

/** A project row's menu (FOL-7): on hover or focus, over the count, with "Move to Folder…". */
export const WithRowMenu: Story = { args: { folders: FOLDERS, projects: FILED, onOpenFolder: () => {}, onMoveProject: () => {} } }

/** A folder route marks its own row, and leaves the project rows alone. */
export const OnAFolder: Story = {
  args: { folders: FOLDERS, current: { folderId: '7b32200c-e4c0-4216-b79a-8490fc05e0bd' } },
}

/**
 * A Folder with no name falls back to its id.
 *
 * Not hypothetical: a state written by a placement carries no name, and
 * `listFolders` reads the state's name and stops — the Peek team rendered as
 * its uuid on 2026-09-15.
 */
export const FolderWithNoName: Story = {
  args: { folders: [{ id: '9c69f247-be6a-4ae7-9703-71cb971f5f93' }] },
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

/** The first moment of a session: neither the workspace nor the Folders have landed. Both headings, each over its placeholder rows. */
export const LoadingEverything: Story = { args: { openIssues: 0, projects: [], loading: true, folders: [], foldersLoading: true } }
