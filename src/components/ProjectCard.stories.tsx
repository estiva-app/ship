import type { Meta, StoryObj } from '@storybook/react-vite'
import { PROJECT_TABS } from '@/fixtures/projects'
import { ProjectCard } from './ProjectCard'

/** Invented projects and people — nothing here is real data. */
const meta = {
  title: 'Projects/ProjectCard',
  component: ProjectCard,
  args: { project: PROJECT_TABS.active[0], showFolder: true, showStatus: false },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectCard>

export default meta
type Story = StoryObj<typeof meta>

/** Name · Folder · bar and count · lead named, on the whole workspace's Active tab. */
export const Default: Story = {}

/** On All or Archived the line also says its status. */
export const WithStatus: Story = { args: { showStatus: true } }

/** On a Folder's own Projects: no Folder line. */
export const InAFolder: Story = { args: { showFolder: false } }

/** A long name: two lines at most. */
export const LongName: Story = { args: { project: PROJECT_TABS.active[1] } }

/** No issues: an empty bar and "0 / 0"; no lead: no line for one. */
export const NoIssuesNoLead: Story = { args: { project: PROJECT_TABS.active[2] } }

/** Archived: the name and the bar quieter. */
export const Archived: Story = { args: { project: PROJECT_TABS.archived[0], showStatus: true } }
