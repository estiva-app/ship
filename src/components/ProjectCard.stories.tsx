import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Tabs } from './ui/Tabs'
import { ARCHIVED_CARDS, PROJECT_CARDS } from '@/fixtures/projects'
import { ProjectCard } from './ProjectCard'

const NOW = Math.floor(Date.now() / 1000)

/** Invented projects and people — nothing here is real data. */
const meta = {
  title: 'Projects/ProjectCard',
  component: ProjectCard,
  args: {
    href: '#/p/des',
    title: 'Design System',
    summary: 'Tokens, primitives and the Storybook that reviews them.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 11,
    doneCount: 2,
    author: { name: 'Ana Duarte' },
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

/** Title · its summary · status · N issues · x/y done · by face name ago. */
export const Default: Story = { decorators: oneCard }

/** A summary past about 240 characters: cut at two lines. All of it is on the project's page. */
export const LongSummary: Story = {
  decorators: oneCard,
  args: {
    summary:
      'A summary that runs well past the length it is meant to keep to, so every place that shows it has to decide where to cut it short: two lines in a row, a card or the picker, and all of it on the file’s own page, where whoever can edit it sees the whole text and can shorten it.',
  },
}

/** No summary: no line at all, so the card is shorter — the description is never cut into its place. */
export const NoSummary: Story = { decorators: oneCard, args: { summary: undefined } }

/** No issues: the counters are absent, not "0 issues · 0/0 done". */
export const Empty: Story = {
  decorators: oneCard,
  args: { title: 'Mobile app', summary: undefined, status: { value: 'planned', label: 'Planned' }, issueCount: 0, doneCount: 0 },
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
            { id: 'active', label: 'Active', count: 5 },
            { id: 'archived', label: 'Archived', count: 1 },
          ]}
          active={which}
          onChange={setWhich}
        />
        {which === 'active' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            {PROJECT_CARDS.map((project) => (
              <ProjectCard key={project.href} {...project} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            {ARCHIVED_CARDS.map((project) => (
              <ProjectCard key={project.href} {...project} />
            ))}
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
    // @estiva-escape(no-handmade-empty-state): the story's stage, the projects view's own padding round the tab it stands for (UIG-42)
    <div className="flex w-full flex-col gap-4 p-6">
      <EmptyState message="Nothing archived." />
    </div>
  ),
}
