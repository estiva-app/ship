import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from './AppShell'
import { Banner } from './Banner'
import { IdentityMenu } from './IdentityMenu'
import { Sidebar, type SidebarProject } from './Sidebar'

const PROJECTS: SidebarProject[] = [
  { addr: '30850:a:rew', title: 'Rewrite Ship with shared foundation', href: '#/p/rew', openCount: 9 },
  { addr: '30850:a:pee', title: 'Peek: Real-time Ship→Peek updates', href: '#/p/pee', openCount: 6 },
  { addr: '30850:a:cro', title: 'Cross-app read state', href: '#/p/cro', openCount: 3 },
  { addr: '30850:a:sha', title: 'Shared foundation packages', href: '#/p/sha', openCount: 0 },
  { addr: '30850:a:cat', title: 'Catch up the Buzz fork', href: '#/p/cat', openCount: 0 },
]

const meta = {
  title: 'Navigation/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: {
    identity: <IdentityMenu me={{}} signedIn={false} relayUrl="http://localhost:3000" onCopyKey={fn()} />,
    sidebar: (
      <Sidebar
        openIssues={18}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={PROJECTS}
        current="issues"
      />
    ),
    children: (
      <div className="p-6">
        <div className="text-h3 text-text-primary">Issues</div>
        <div className="mt-2 text-body-2 text-text-muted">The list goes here (REW-4).</div>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppShell>

export default meta
type Story = StoryObj<typeof meta>

/** The four regions: header, (no banner), sidebar, main. Anonymous. */
export const Anonymous: Story = {}

/** The banner strip under the header, as after "Copy public key". */
export const WithBanner: Story = {
  args: { banner: <Banner tone="ok">Public key copied.</Banner> },
}

/** Signed in, on a project route. */
export const SignedInOnAProject: Story = {
  args: {
    identity: (
      <IdentityMenu
        me={{ name: 'Katerina Kelepouri' }}
        signedIn
        idBase="https://id.estiva.app"
        relayUrl="http://localhost:3000"
        onCopyKey={fn()}
        onSignOut={fn()}
      />
    ),
    sidebar: (
      <Sidebar
        openIssues={18}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={PROJECTS}
        current={{ projectAddr: '30850:a:pee' }}
      />
    ),
  },
}

/** Main scrolls on its own; the rail stays put. */
export const LongContent: Story = {
  args: {
    children: (
      <div className="p-6">
        {Array.from({ length: 60 }, (_, i) => (
          <div key={i} className="flex h-9 items-center border-b border-border-subtle text-body-2 text-text-secondary">
            Row {i + 1}
          </div>
        ))}
      </div>
    ),
  },
}
