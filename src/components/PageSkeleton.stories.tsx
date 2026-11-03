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
        nav={<ShipSidebar openIssues={0} activeProjects={0} hrefFor={(entry) => `#/${entry}`} current={{ entry: current }} loading />}
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

/** One issue: the header with its trail, the title, the summary, the pills and the description, and the comments column beside it. */
export const Issue: Story = { render: () => <Loading shape="issue" current="issues" /> }

/** One project: the same, with its tabs under the header. */
export const Project: Story = { render: () => <Loading shape="project" current="projects" /> }

/** Any other route (an inbound reference): rows. A Folder is not one — it draws its own. */
export const Rows: Story = { render: () => <Loading shape="rows" current="issues" /> }
