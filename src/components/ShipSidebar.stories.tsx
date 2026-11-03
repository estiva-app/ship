import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShipSidebar, type SidebarFolder } from './ShipSidebar'

const SHIP = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
const HQ = '0212db6d-bcbf-40d0-890e-f4f056db2f5d'

/** The teams as the sidebar sees them: a name, and deliberately no count. */
const FOLDERS: SidebarFolder[] = [
  { id: SHIP, name: 'Ship', addresses: ['30850:a:rel', '30850:a:pay', '39000:r:ship-talk'] },
  { id: HQ, name: 'Estiva HQ', addresses: ['30850:a:des', '30850:a:onb'] },
]

const meta = {
  title: 'Navigation/ShipSidebar',
  component: ShipSidebar,
  args: {
    openIssues: 18,
    activeProjects: 5,
    hrefFor: (entry, folder) => (folder ? `#/app/folder/${folder}/${entry}` : `#/${entry}`),
    folders: FOLDERS,
    onOpenFolder: () => {},
    onNewFolder: () => {},
    current: { entry: 'topics' },
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
 * Where Ship opens (SHIPS-5): Topics, Projects ("5 active"), Issues ("18 open"),
 * then the teams under a quiet "Folders" label, closed, alphabetically. A team
 * carries **no count** — a Folder holds files from apps Ship does not own, so
 * any number would be Ship's records only.
 */
export const OnTopics: Story = {}

export const OnIssues: Story = { args: { current: { entry: 'issues' } } }

/** A project in Estiva HQ: its fold opens and its Projects is marked, not the top one. */
export const OnAProject: Story = { args: { current: { entry: 'projects', folder: HQ } } }

/** An issue whose project is in Ship: that fold opens, its Issues marked. */
export const OnAnIssue: Story = { args: { current: { entry: 'issues', folder: SHIP } } }

/** The Folder page: nothing is marked; the arrow on a fold's hover is how you get there. */
export const OnAFolder: Story = { args: { current: { folderId: SHIP } } }

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
