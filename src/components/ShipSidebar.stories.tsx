import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShipSidebar, type SidebarFolder } from './ShipSidebar'
import type { SidebarTopic } from '@/lib/topics'

const SHIP = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
const HQ = '0212db6d-bcbf-40d0-890e-f4f056db2f5d'

/** The teams as the sidebar sees them: a name, and deliberately no count. */
const FOLDERS: SidebarFolder[] = [
  { id: SHIP, name: 'Ship', addresses: ['30850:a:rel', '30850:a:pay', '39000:r:ship-talk'] },
  { id: HQ, name: 'Estiva HQ', addresses: ['30850:a:des', '30850:a:onb'] },
]

/** Your five newest initiatives, newest activity first, each folding to the projects then issues it lists (TOPI-9). */
const TOPICS: SidebarTopic[] = [
  {
    id: '30840:a:nav',
    title: 'Cross-app navigation',
    href: '#/topic/nav',
    work: [
      { id: '30850:a:rel', kind: 'project', title: 'Release 2', href: '#/project/rel' },
      { id: '30851:a:1', kind: 'issue', title: 'Explore initiatives opens its page', href: '#/issue/1' },
    ],
  },
  { id: '30840:a:speed', title: 'Speed', href: '#/topic/speed', work: [{ id: '30850:a:pay', kind: 'project', title: 'Payments', href: '#/project/pay' }] },
  { id: '30840:a:triage', title: 'Triage', href: '#/topic/triage', work: [] },
  { id: '30840:a:brand', title: 'Brand refresh', href: '#/topic/brand', work: [] },
  { id: '30840:a:hiring', title: 'Hiring', href: '#/topic/hiring', work: [] },
]

const meta = {
  title: 'Navigation/ShipSidebar',
  component: ShipSidebar,
  args: {
    openIssues: 18,
    activeProjects: 5,
    hrefFor: (entry, folder) => (folder ? `#/app/teams/${folder}/${entry}` : `#/${entry}`),
    folders: FOLDERS,
    onNewFolder: () => {},
    current: { entry: 'topics' },
    topics: TOPICS,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen bg-bg-base">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShipSidebar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Where Ship opens (SHIPS-5, TOPI-9): Projects ("5 active"), Issues ("18 open"),
 * your five newest initiatives folded, Explore initiatives (Peek's icon, lit:
 * Ship opens on it), then the teams under a quiet "Teams" label, alphabetically,
 * each a row like Peek's — the team's icon and name, a link to its page — folded
 * (C1). A team carries **no count** — a Folder holds files from apps Ship does
 * not own, so any number would be Ship's records only.
 */
export const OnTopics: Story = { name: 'On Explore initiatives' }

/** A project an initiative lists: that initiative opens, the project lit under it, and its team's Projects. */
export const OnAProjectInATopic: Story = { name: 'On a project in an initiative', args: { current: { entry: 'projects', folder: SHIP }, openFile: '30850:a:rel' } }

/** An initiative's page: its row is lit, not Explore initiatives. */
export const OnATopic: Story = { name: 'On an initiative', args: { current: undefined, openTopic: '30840:a:speed' } }

/** You are in no initiative yet: the line says so, and Explore initiatives is the way in. */
export const NoTopics: Story = { name: 'No initiatives', args: { topics: [] } }

/** The initiatives or their order are being read. */
export const TopicsLoading: Story = { name: 'Initiatives loading', args: { topics: 'loading' } }

/** The initiatives or their order did not load. */
export const TopicsFailed: Story = { name: 'Initiatives failed', args: { topics: 'failed' } }

export const OnIssues: Story = { args: { current: { entry: 'issues' } } }

/** A project in Estiva HQ: its team's row opens and its Projects is marked, not the top one. */
export const OnAProject: Story = { args: { current: { entry: 'projects', folder: HQ } } }

/** An issue whose project is in Ship: that team's row opens, its Issues marked. */
export const OnAnIssue: Story = { args: { current: { entry: 'issues', folder: SHIP } } }

/** A team's page: its row is lit, as Peek's Teams column lights a team whose page is open. */
export const OnAFolder: Story = { args: { current: { folderId: SHIP } } }

/** Your teams first; the ones you are not in folded under "Other teams" with their count, as Peek's Teams column (Katerina, 23 November). */
export const WithOtherTeams: Story = { name: 'With other teams', args: { yours: new Set([SHIP]) } }

/** A team you are not in, its page open: Other teams opens for it, its row lit. */
export const OnAnOtherTeam: Story = { name: 'On an other team', args: { yours: new Set([SHIP]), current: { folderId: HQ } } }

/**
 * A Folder with no name falls back to its id.
 *
 * Not hypothetical: a state written by a placement carries no name, and
 * `listFolders` reads the state's name and stops — the Peek team rendered as
 * its uuid on 2026-09-15.
 */
export const FolderWithNoName: Story = { args: { folders: [{ id: '9c69f247-be6a-4ae7-9703-71cb971f5f93' }] } }

/** The first workspace read has not landed — SHI-20: the entries are links already, their counts absent rather than zero. */
export const Loading: Story = { args: { loading: true } }

/** The Folders have not landed: placeholder rows, and no "Folders" label yet. */
export const FoldersLoading: Story = { args: { folders: [], foldersLoading: true } }
