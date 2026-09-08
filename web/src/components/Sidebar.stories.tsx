import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sidebar, type SidebarProject } from './Sidebar'

/** Shaped like the local sandbox — invented projects, nothing real. */
const PROJECTS: SidebarProject[] = [
  { addr: '30850:a:des', title: 'Design System', href: '#/p/des', openCount: 9 },
  { addr: '30850:a:rel', title: 'Relay Migration', href: '#/p/rel', openCount: 6 },
  { addr: '30850:a:pay', title: 'Payment integration', href: '#/p/pay', openCount: 3 },
  { addr: '30850:a:onb', title: 'Onboarding flow for new workspaces', href: '#/p/onb', openCount: 0 },
  { addr: '30850:a:mob', title: 'Mobile app', href: '#/p/mob', openCount: 0 },
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
