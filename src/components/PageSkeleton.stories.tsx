import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar } from '@/components/ShipSidebar'
import { ANA } from '@/fixtures/issues'
import { PageSkeleton, type PageSkeletonShape } from './PageSkeleton'

/**
 * Before the workspace's first read lands: each route in the shape it arrives
 * in (UIG-14), in the shell, beside the sidebar's own loading rows — the cold
 * start as it looks.
 */
function Loading({ shape, current }: { shape: PageSkeletonShape; current: 'issues' | 'projects' }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={ANA} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<ShipSidebar openIssues={0} issuesHref="#/issues" projectsHref="#/projects" projects={[]} current={current} loading />}
      >
        <PageSkeleton shape={shape} />
      </AppShell>
    </div>
  )
}

const meta = {
  title: 'Pages/Loading',
  component: PageSkeleton,
  parameters: { layout: 'fullscreen' },
  args: { shape: 'cards' },
} satisfies Meta<typeof PageSkeleton>

export default meta
type Story = StoryObj<typeof meta>

/** The projects page: its heading, then a grid of project cards. */
export const Projects: Story = { render: () => <Loading shape="cards" current="projects" /> }

/** The issues page: its heading, the tabs, then rows. */
export const Issues: Story = { render: () => <Loading shape="list" current="issues" /> }

/** One project or one issue: the trail, the title and rows, and the rail. */
export const ProjectOrIssue: Story = { render: () => <Loading shape="page" current="issues" /> }

/** Any other route (an inbound reference): rows. A Folder is not one — it draws its own. */
export const Rows: Story = { render: () => <Loading shape="rows" current="issues" /> }
