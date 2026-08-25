import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sidebar, type SidebarProject } from './Sidebar'

/** Shaped like the local workspace: five active projects, twenty-eight issues. */
const PROJECTS: SidebarProject[] = [
  { addr: '30850:a:rew', title: 'Rewrite Ship with shared foundation', href: '#/p/rew', openCount: 9 },
  { addr: '30850:a:pee', title: 'Peek: Real-time Ship→Peek updates', href: '#/p/pee', openCount: 6 },
  { addr: '30850:a:cro', title: 'Cross-app read state', href: '#/p/cro', openCount: 3 },
  { addr: '30850:a:sha', title: 'Shared foundation packages', href: '#/p/sha', openCount: 0 },
  { addr: '30850:a:cat', title: 'Catch up the Buzz fork', href: '#/p/cat', openCount: 0 },
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

/** On the Issues list. Every number is open issues; projects with none show none. */
export const Issues: Story = {}

export const Projects: Story = { args: { current: 'projects' } }

/** A project route marks its own row, not the Projects entry. */
export const OnAProject: Story = { args: { current: { projectAddr: '30850:a:pee' } } }

/** A workspace with no active projects: the heading is not drawn either. */
export const Empty: Story = { args: { openIssues: 0, projects: [] } }
