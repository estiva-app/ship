import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Tabs } from './ui/Tabs'
import { ProjectCard, type ProjectCardProps } from './ProjectCard'

const NOW = Math.floor(Date.now() / 1000)

const meta = {
  title: 'Projects/ProjectCard',
  component: ProjectCard,
  args: {
    href: '#/p/rew',
    title: 'Rewrite Ship with shared foundation',
    description:
      'Ship on React/Vite/Tailwind, and the second consumer that makes the packages extractable. Same stack, same view-by-view port, same src/lib/nostr boundary.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 11,
    doneCount: 2,
    author: { name: 'Jan Mikula' },
    createdAt: NOW - 86400,
  },
} satisfies Meta<typeof ProjectCard>

export default meta
type Story = StoryObj<typeof meta>

/** One card at the width the grid gives it. Story-level decorators add to the
 *  meta's rather than replacing them, so the single-card box lives here. */
const oneCard: Story['decorators'] = [
  (Story) => (
    <div className="w-[300px]">
      <Story />
    </div>
  ),
]

/** Title · two-line description · status · N issues · x/y done · by face name ago. */
export const Default: Story = { decorators: oneCard }

/** No issues: the counters are absent, not "0 issues · 0/0 done". */
export const Empty: Story = {
  decorators: oneCard,
  args: { title: 'Catch up the Buzz fork', description: undefined, status: { value: 'planned', label: 'Planned' }, issueCount: 0, doneCount: 0 },
}

/** Archived, with its chip. */
export const Archived: Story = {
  decorators: oneCard,
  args: { status: { value: 'completed', label: 'Completed' }, issueCount: 6, doneCount: 6, archived: true, createdAt: NOW - 86400 * 40 },
}

/** An author nobody has published a profile for: silhouette and an em dash, never a key. */
export const UnknownAuthor: Story = { decorators: oneCard, args: { author: {} } }

/** A status the vocabulary does not know is shown raw. */
export const UnknownStatus: Story = { decorators: oneCard, args: { status: { value: 'blocked', label: 'blocked' } } }

const PROJECTS: ProjectCardProps[] = [
  {
    href: '#/p/rew',
    title: 'Rewrite Ship with shared foundation',
    description: 'Ship on React/Vite/Tailwind, and the second consumer that makes the packages extractable.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 11,
    doneCount: 2,
    author: { name: 'Jan Mikula' },
    createdAt: NOW - 86400,
  },
  {
    href: '#/p/pee',
    title: 'Peek: Real-time Ship→Peek updates',
    description: 'Peek reads the relay once per mount and never again. Make it live, and make stale state explain itself.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 11,
    doneCount: 5,
    author: { name: 'Jan Mikula' },
    createdAt: NOW - 86400 * 2,
  },
  {
    href: '#/p/cro',
    title: 'Cross-app read state',
    description: 'Read/unread becomes a property of the person, not the app.',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 11,
    doneCount: 1,
    author: { name: 'Jan Mikula' },
    createdAt: NOW - 86400 * 2,
  },
  {
    href: '#/p/sha',
    title: 'Shared foundation packages',
    description: 'Four packages plus a scaffold, so app four is cheap.',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 6,
    doneCount: 0,
    author: { name: 'Katerina Kelepouri' },
    createdAt: NOW - 3600 * 5,
  },
  {
    href: '#/p/cat',
    title: 'Catch up the Buzz fork',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 0,
    doneCount: 0,
    author: {},
    createdAt: NOW - 120,
  },
]

/**
 * The projects list as it will compose (step c): heading + "Add project" as
 * today, the Active/Archived tabs (only when something is archived), the
 * card grid at today's 260px minimum.
 */
export const InTheList: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => {
    const [which, setWhich] = useState<'active' | 'archived'>('active')
    return (
      <div className="flex w-full flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-h3 text-text-primary">Projects</h1>
          <Button variant="primary">Add project</Button>
        </div>
        <Tabs
          tabs={[
            { id: 'active', label: 'Active (5)' },
            { id: 'archived', label: 'Archived (1)' },
          ]}
          active={which}
          onChange={setWhich}
        />
        {which === 'active' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            {PROJECTS.map((project) => (
              <ProjectCard key={project.href} {...project} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            <ProjectCard
              href="#/p/old"
              title="Relay migration"
              description="Moving Ship's records from Convex onto the relay."
              status={{ value: 'completed', label: 'Completed' }}
              issueCount={6}
              doneCount={6}
              author={{ name: 'Jan Mikula' }}
              createdAt={NOW - 86400 * 40}
              archived
            />
          </div>
        )}
      </div>
    )
  },
}

/** The other empty. */
export const NothingArchived: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="flex w-full flex-col gap-4 p-6">
      <EmptyState className="py-12" message="Nothing archived." />
    </div>
  ),
}
